/**
 * syncTimeCloud.js — Bridge: SQL Server TimeCloud → NOC Monitor
 *
 * Liga ao SQL Server MMConnect (software.mmconnect.pt:10555, DB: TimeCloud)
 * e sincroniza marcações e status de terminais para o Base44.
 *
 * Schema real descoberto:
 *   TerminaisMarcacoes: IDMarcacao, IDFuncionario, Data, Hora, Cartao, IDTerminal, Tipo, DataInsercao
 *   Terminais:          IDTerminal, Nome, NumeroSerie, Modelo, Comunicacao, ...
 *   Funcionarios:       IDFuncionario, Numero, Nome, Activo, ...
 *
 * Actions:
 *   test_connection   — testa ligação ao SQL Server
 *   get_tables        — lista todas as tabelas
 *   get_schema        — schema de uma tabela específica (param: table)
 *   sync_marcacoes    — sincroniza marcações → entidade Marcacao
 *   sync_status       — atualiza status dos terminais no NOC Monitor
 *   sync_all          — executa sync_marcacoes + sync_status em paralelo
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SQL_CONFIG = {
  server:   'software.mmconnect.pt',
  port:     10555,
  database: 'TimeCloud',
  user:     'wsapp',
  password: 'Y/f42]sDBzC78W[Y',
  options: {
    encrypt:                false,
    trustServerCertificate: true,
    connectTimeout:         10000,
    requestTimeout:         20000,
  }
};

async function getSqlPool() {
  const mssql = (await import('npm:mssql@10.0.4')).default;
  const pool = await mssql.connect(SQL_CONFIG);
  return { pool, mssql };
}

// Converte Data+Hora do SQL para string ISO
function mergeDataHora(data, hora) {
  if (!data) return null;
  const d = new Date(data);
  if (hora) {
    const h = new Date(hora);
    d.setHours(h.getUTCHours(), h.getUTCMinutes(), h.getUTCSeconds(), 0);
  }
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

// Tipo TimeCloud → tipo Marcacao
function mapTipo(tipo) {
  if (!tipo) return 'desconhecido';
  const t = String(tipo).toUpperCase().trim();
  if (t === 'E') return 'entrada';
  if (t === 'S') return 'saida';
  return 'desconhecido';
}

// ─── test_connection ─────────────────────────────────────────────────────────
async function testConnection() {
  const { pool } = await getSqlPool();
  try {
    const r = await pool.request().query(
      'SELECT @@VERSION AS version, DB_NAME() AS db_name, GETDATE() AS server_time'
    );
    const row = r.recordset[0];
    return {
      success:     true,
      message:     'Conexão ao SQL Server TimeCloud estabelecida com sucesso',
      server_time: row.server_time,
      db_name:     row.db_name,
      version:     String(row.version || '').split('\n')[0],
    };
  } finally {
    await pool.close();
  }
}

// ─── get_tables ──────────────────────────────────────────────────────────────
async function getTables() {
  const { pool } = await getSqlPool();
  try {
    const r = await pool.request().query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
    );
    return { success: true, tables: r.recordset.map(x => x.TABLE_NAME), count: r.recordset.length };
  } finally {
    await pool.close();
  }
}

// ─── get_schema ──────────────────────────────────────────────────────────────
async function getTableSchema(tableName) {
  const { pool, mssql } = await getSqlPool();
  try {
    const r = await pool.request()
      .input('tbl', mssql.NVarChar, tableName)
      .query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tbl
        ORDER BY ORDINAL_POSITION
      `);
    const cnt = await pool.request().query(`SELECT COUNT(*) AS total FROM [${tableName}]`);
    // Preview of last 3 rows
    const preview = await pool.request().query(`SELECT TOP 3 * FROM [${tableName}] ORDER BY 1 DESC`);
    return {
      success:    true,
      table:      tableName,
      columns:    r.recordset,
      total_rows: cnt.recordset[0].total,
      preview:    preview.recordset,
    };
  } finally {
    await pool.close();
  }
}

// ─── sync_marcacoes ──────────────────────────────────────────────────────────
async function syncMarcacoes(base44, horasAtras = 24, limit = 1000) {
  const { pool, mssql } = await getSqlPool();
  let inserted = 0, skipped = 0, errors = 0;

  try {
    // Corte temporal: últimas N horas
    const cutoff = new Date(Date.now() - horasAtras * 60 * 60 * 1000);

    // Buscar marcações recentes com join a Terminais e Funcionarios
    const result = await pool.request()
      .input('cutoff', mssql.DateTime, cutoff)
      .input('limit',  mssql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          tm.IDMarcacao,
          tm.IDFuncionario,
          tm.Data,
          tm.Hora,
          tm.Cartao,
          tm.IDTerminal,
          tm.Tipo,
          tm.DataInsercao,
          f.Nome       AS FuncionarioNome,
          f.Numero     AS FuncionarioNumero,
          t.Nome       AS TerminalNome,
          t.NumeroSerie,
          t.Grupo      AS TerminalGrupo
        FROM TerminaisMarcacoes tm
        LEFT JOIN Funcionarios f ON f.IDFuncionario = tm.IDFuncionario
        LEFT JOIN Terminais t    ON t.IDTerminal    = tm.IDTerminal
        WHERE tm.DataInsercao >= @cutoff
        ORDER BY tm.DataInsercao ASC
      `);

    if (result.recordset.length === 0) {
      return {
        success: true,
        message: `Nenhuma marcação nova nas últimas ${horasAtras}h`,
        inserted: 0, skipped: 0
      };
    }

    // Mapa SN → terminal NOC Monitor
    const terminaisNOC = await base44.asServiceRole.entities.Terminal.list();
    const bySN   = {};
    const byNome = {};
    for (const t of terminaisNOC) {
      if (t.numero_serie) bySN[t.numero_serie.trim()] = t;
      if (t.nome) byNome[t.nome.trim().toLowerCase()] = t;
    }

    for (const row of result.recordset) {
      try {
        // Montar timestamp combinando Data + Hora
        const tsStr = mergeDataHora(row.Data, row.Hora);
        if (!tsStr) { skipped++; continue; }

        // Determinar enrollid: IDFuncionario ou Cartao
        const enrollid = row.IDFuncionario ?? (row.Cartao ? parseInt(row.Cartao) : null);
        if (enrollid == null) { skipped++; continue; }

        // Encontrar terminal no NOC Monitor
        const sn = row.NumeroSerie?.trim() || '';
        const nomeTC = row.TerminalNome?.trim().toLowerCase() || '';
        let terminal = (sn && bySN[sn]) || (nomeTC && byNome[nomeTC]) || null;

        const terminalId   = terminal?.id   || String(row.IDTerminal || 'timecloud');
        const terminalNome = terminal?.nome  || row.TerminalNome || 'TimeCloud';
        const local        = terminal?.local || row.TerminalGrupo || '';

        // Evitar duplicados: verificar por IDMarcacao guardado no campo resposta_raw
        const existingBySource = await base44.asServiceRole.entities.Marcacao.filter({
          terminal_id: terminalId,
          enrollid:    Number(enrollid),
          timestamp:   tsStr,
        });
        if (existingBySource && existingBySource.length > 0) { skipped++; continue; }

        const modo = mapTipo(row.Tipo) !== 'desconhecido' ? 'card' : 'desconhecido';

        await base44.asServiceRole.entities.Marcacao.create({
          terminal_id:   terminalId,
          terminal_nome: terminalNome,
          enrollid:      Number(enrollid),
          utilizador_nome: row.FuncionarioNome || '',
          timestamp:     tsStr,
          modo,
          local,
          tipo:          mapTipo(row.Tipo),
          exportado:     false,
        });
        inserted++;

      } catch (rowErr) {
        errors++;
        console.error('[SYNC-MARC] Erro linha IDMarcacao=' + row.IDMarcacao + ':', rowErr.message);
      }
    }

    return {
      success:     true,
      total_found: result.recordset.length,
      inserted,
      skipped,
      errors,
      message:     `Sync concluído: ${inserted} novas, ${skipped} duplicadas, ${errors} erros`,
    };

  } finally {
    await pool.close();
  }
}

// ─── sync_status ─────────────────────────────────────────────────────────────
async function syncStatus(base44) {
  const { pool } = await getSqlPool();

  try {
    // Buscar terminais com campos disponíveis (sem UltimoAcesso/UltimaLigacao/Activo)
    const result = await pool.request().query(`
      SELECT IDTerminal, Nome, NumeroSerie, Modelo, Comunicacao, Grupo, Endereco
      FROM Terminais
    `);

    const terminaisNOC = await base44.asServiceRole.entities.Terminal.list();
    const bySN   = {};
    const byNome = {};
    for (const t of terminaisNOC) {
      if (t.numero_serie) bySN[t.numero_serie.trim()] = t;
      if (t.nome) byNome[t.nome.trim().toLowerCase()] = t;
    }

    let updated = 0;
    const now = new Date().toISOString();

    for (const row of result.recordset) {
      const sn   = (row.NumeroSerie || '').trim();
      const nome = (row.Nome || '').trim().toLowerCase();
      const terminal = (sn && bySN[sn]) || (nome && byNome[nome]);
      if (!terminal) continue;

      // TimeCloud não tem colunas de ping — só garantir que o terminal existe no NOC
      // Atualizar apenas último_check para confirmar que a BD o reconhece
      await base44.asServiceRole.entities.Terminal.update(terminal.id, {
        ultimo_check: now,
      });
      updated++;
    }

    return {
      success: true,
      total_terminais_timecloud: result.recordset.length,
      updated,
      message: `${updated} terminais atualizados com status do TimeCloud`,
    };

  } finally {
    await pool.close();
  }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Scheduled automations run without a user session — skip auth check in that case.
    // For manual/frontend calls, enforce admin role.
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores' }, { status: 403 });
    }

    const body   = await req.json().catch(() => ({}));
    const action = body.action || 'sync_marcacoes';

    let result;
    switch (action) {
      case 'test_connection':
        result = await testConnection();
        break;
      case 'get_tables':
        result = await getTables();
        break;
      case 'get_schema':
        result = await getTableSchema(body.table || 'TerminaisMarcacoes');
        break;
      case 'sync_marcacoes':
        result = await syncMarcacoes(base44, body.horas_atras || 24, body.limit || 1000);
        break;
      case 'sync_status':
        result = await syncStatus(base44);
        break;
      case 'sync_all': {
        const [marc, st] = await Promise.all([
          syncMarcacoes(base44, body.horas_atras || 24, body.limit || 1000),
          syncStatus(base44),
        ]);
        result = { success: true, marcacoes: marc, status_terminais: st };
        break;
      }
      default:
        return Response.json({
          error: `Ação desconhecida: "${action}". Disponíveis: test_connection, get_tables, get_schema, sync_marcacoes, sync_status, sync_all`
        }, { status: 400 });
    }

    return Response.json(result);

  } catch (error) {
    console.error('[syncTimeCloud] ERRO:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});