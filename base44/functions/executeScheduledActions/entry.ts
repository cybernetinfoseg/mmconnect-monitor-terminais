/**
 * executeScheduledActions — Executa ações remotas agendadas nos terminais
 * Chamado pelo cron a cada 5 minutos (via mainScheduler)
 *
 * CORREÇÕES v2:
 * - Retry automático em falha de comandos críticos (opendoor, lockctrl)
 * - shouldRunNow usa instante único (consistência entre hora e dia)
 * - lockctrl respeita parâmetros do agendamento (fuc)
 * - opendoor ZKTeco usa caminho ADMS correto
 * - sendTimmyCommand com retry configurável
 * - Timeout aumentado para comandos críticos
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNocServerHost() {
  const host = Deno.env.get('NOC_SERVER_HOST');
  if (!host) throw new Error('NOC_SERVER_HOST não configurado. Defina esta variável de ambiente no painel de Secrets.');
  return host;
}

/**
 * sendTimmyCommand com retry automático.
 * maxAttempts=3 para comandos críticos (opendoor, lockctrl).
 */
async function sendTimmyCommand(terminal, command, maxAttempts = 2) {
  const host = terminal.ip_publico || terminal.dns || getNocServerHost();
  const ctrlPort = 7789;
  const sn = terminal.numero_serie || '';
  if (!sn) throw new Error(`SN não configurado no terminal "${terminal.nome}"`);

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(`http://${host}:${ctrlPort}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sn, command }),
        signal: AbortSignal.timeout(20000), // 20s por tentativa
      });
      if (!resp.ok) throw new Error(`Servidor Timmy respondeu ${resp.status}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Servidor Timmy falhou');
      return data.result || { result: true };
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        console.warn(`[Timmy] tentativa ${attempt}/${maxAttempts} falhou (${JSON.stringify(command.cmd)}) — retrying em 3s: ${e.message}`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  throw new Error(`Servidor Timmy (${host}:${ctrlPort}) inacessível após ${maxAttempts} tentativa(s) — ${lastError?.message}`);
}

async function sendAdmsCommand(terminal, action, params = {}) {
  const host = terminal.ip_publico || terminal.dns || getNocServerHost();
  const ctrlPort = 7790;
  const sn = terminal.numero_serie || '';
  if (!sn) return { success: false, error: 'SN não configurado — obrigatório para terminais ADMS/ZKTeco.' };

  const resp = await fetch(`http://${host}:${ctrlPort}/cmd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sn, action, params }),
    signal: AbortSignal.timeout(15000),
  }).catch(e => { throw new Error(`noc_server.py (${host}:${ctrlPort}) inacessível — ${e.message}`); });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`noc_server.py respondeu ${resp.status}: ${errBody || 'erro desconhecido'}`);
  }
  const data = await resp.json();
  return {
    success: data.success !== false,
    message: data.message || (data.success ? 'Comando executado' : 'Falha no servidor ADMS'),
    data: data.result || data,
  };
}

function buildBaseUrl(terminal) {
  const ip = terminal.ip_publico || terminal.dns || terminal.ip_local;
  return `http://${ip}:${terminal.porta || 80}`;
}

async function hikvisionRequest(terminal, method, path, body = null) {
  const creds = btoa(`admin:${terminal.observacoes || 'admin'}`);
  const opts = {
    method,
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${buildBaseUrl(terminal)}${path}`, opts);
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: resp.status }; }
}

async function dahuaRequest(terminal, cgiPath) {
  const base = buildBaseUrl(terminal);
  const user = 'admin';
  const pass = terminal.observacoes || 'admin';
  const url = `${base}${cgiPath}`;

  const r1 = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!r1 || r1.status !== 401) return { status: r1?.status || 0, body: await r1?.text().catch(() => '') };

  const wwwAuth = r1.headers.get('www-authenticate') || '';
  const realm  = (wwwAuth.match(/realm="([^"]*)"/)  || [])[1] || '';
  const nonce  = (wwwAuth.match(/nonce="([^"]*)"/)  || [])[1] || '';
  const qop    = (wwwAuth.match(/qop="([^"]*)"/)    || [])[1] || '';

  const md5 = async (str) => {
    const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str)).catch(() => null);
    if (!buf) return str;
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const nc = '00000001'; const cnonce = Math.random().toString(36).substring(2, 10);
  const ha1 = await md5(`${user}:${realm}:${pass}`);
  const ha2 = await md5(`GET:${cgiPath.split('?')[0]}`);
  const response = qop ? await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : await md5(`${ha1}:${nonce}:${ha2}`);
  const authHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${cgiPath.split('?')[0]}", ` +
    (qop ? `qop=${qop}, nc=${nc}, cnonce="${cnonce}", ` : '') + `response="${response}"`;
  const r2 = await fetch(url, { headers: { 'Authorization': authHeader }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  return { status: r2?.status || 0, body: await r2?.text().catch(() => '') };
}

// ─── Executores de ação ───────────────────────────────────────────────────────

async function runAction(terminal, action, scheduleParams) {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  // ── settime ──────────────────────────────────────────────────────────────
  if (action === 'settime') {
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'settime', cloudtime: now });
      return { success: r.result === true, message: `Relógio acertado para ${now}`, data: r };
    }
    if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
      return await sendAdmsCommand(terminal, 'settime', { time: now });
    }
    if (fab === 'hikvision') {
      const r = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/time', { timeMode: 'manual', localTime: now, timeZone: 'UTC+0:00' });
      return { success: true, message: 'Relógio acertado (Hikvision)', data: r };
    }
    if (fab === 'dahua') {
      const r = await dahuaRequest(terminal, `/cgi-bin/global.cgi?action=setCurrentTime&time=${encodeURIComponent(now)}`);
      return { success: r.status === 200, message: 'Relógio acertado (Dahua)', data: r };
    }
    if (['ip_publico', 'dns', 'ip_local'].includes(tipo) && (fab === 'zkteco' || fab === 'anviz')) {
      return await sendAdmsCommand(terminal, 'settime', { time: now });
    }
    return { success: false, error: `settime não suportado para ${tipo}/${fab}` };
  }

  // ── getlogs ──────────────────────────────────────────────────────────────
  if (action === 'getlogs') {
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'getnewlog', stn: true });
      return { success: r.result === true, message: `${r.count || 0} marcações recolhidas`, data: r };
    }
    if (tipo === 'adms_push') {
      return { success: true, message: 'Terminais ADMS enviam marcações automaticamente ao servidor.' };
    }
    if (tipo === 'sdk_tcp' || ['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { AcsEventCond: { searchID: '1', searchResultPosition: 0, maxResults: 50 } });
        return { success: true, message: 'Marcações Hikvision recolhidas', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/recordFinder.cgi?action=find&name=AttendanceRecord&StartTime=2000-01-01%2000:00:00&EndTime=2099-12-31%2023:59:59');
        return { success: r.status === 200, message: 'Marcações Dahua recolhidas' };
      }
      // ZKTeco via noc_server.py (ADMS relay)
      return await sendAdmsCommand(terminal, 'getlogs', {});
    }
    return { success: false, error: `getlogs não suportado para ${tipo}/${fab}` };
  }

  // ── opendoor — CRÍTICO: 3 tentativas ──────────────────────────────────────
  if (action === 'opendoor') {
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'opendoor' }, 3); // 3 tentativas
      return { success: r.result === true || r.result === undefined, message: 'Porta aberta', data: r };
    }
    if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'PUT', '/ISAPI/AccessControl/RemoteControl/door/1',
          { RemoteControlDoorParam: { door: 1, controlType: 'open' } });
        return { success: true, message: 'Porta aberta (Hikvision)', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote');
        return { success: r.status === 200, message: 'Porta aberta (Dahua)', data: r };
      }
      // ZKTeco ADMS: via noc_server.py relay (protocolo correto)
      return await sendAdmsCommand(terminal, 'opendoor', {});
    }
    if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'PUT', '/ISAPI/AccessControl/RemoteControl/door/1',
          { RemoteControlDoorParam: { door: 1, controlType: 'open' } });
        return { success: true, message: 'Porta aberta (Hikvision)', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote');
        return { success: r.status === 200, message: 'Porta aberta (Dahua)', data: r };
      }
      if (fab === 'zkteco' || fab === 'anviz') {
        return await sendAdmsCommand(terminal, 'opendoor', {});
      }
    }
    return { success: false, error: `opendoor não suportado para ${tipo}/${fab}` };
  }

  // ── reboot ───────────────────────────────────────────────────────────────
  if (action === 'reboot') {
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'reboot' }).catch(() => ({ result: true }));
      return { success: true, message: 'Comando de reinício enviado', data: r };
    }
    if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/reboot');
        return { success: true, message: 'Reinício enviado (Hikvision)', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=reboot');
        return { success: r.status === 200, message: 'Reinício enviado (Dahua)' };
      }
      return await sendAdmsCommand(terminal, 'reboot', {});
    }
    if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/reboot');
        return { success: true, message: 'Reinício enviado (Hikvision)', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=reboot');
        return { success: r.status === 200, message: 'Reinício enviado (Dahua)' };
      }
      if (fab === 'zkteco' || fab === 'anviz') return await sendAdmsCommand(terminal, 'reboot', {});
    }
    return { success: false, error: `reboot não suportado para ${tipo}/${fab}` };
  }

  // ── getdevinfo ────────────────────────────────────────────────────────────
  if (action === 'getdevinfo') {
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'getreginfo' });
      return { success: r.result === true, message: 'Info do dispositivo obtida', data: r };
    }
    if (tipo === 'adms_push' || tipo === 'sdk_tcp' || ['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
      if (fab === 'hikvision') {
        const r = await hikvisionRequest(terminal, 'GET', '/ISAPI/System/deviceInfo');
        return { success: true, message: 'Info Hikvision obtida', data: r };
      }
      if (fab === 'dahua') {
        const r = await dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=getSystemInfo');
        return { success: r.status === 200, message: 'Info Dahua obtida', data: r.body };
      }
      return await sendAdmsCommand(terminal, 'getdevinfo', {});
    }
    return { success: false, error: `getdevinfo não suportado para ${tipo}/${fab}` };
  }

  // ── lockctrl — CRÍTICO: 3 tentativas + respeita parâmetros do agendamento ─
  if (action === 'lockctrl') {
    // scheduleParams pode conter { fuc: 1 } guardado no agendamento
    const fuc = scheduleParams?.fuc ?? 1;
    if (tipo === 'websocket_cloud') {
      const r = await sendTimmyCommand(terminal, { cmd: 'lockctrl', fuc }, 3); // 3 tentativas
      const msgs = { 1: 'Porta forçada aberta (permanente)', 2: 'Porta forçada fechada', 3: 'Porta aberta temporariamente', 4: 'Relay resetado', 6: 'Alarme cancelado' };
      return { success: r.result === true || r.result === undefined, message: msgs[fuc] || `lockctrl fuc=${fuc}`, data: r };
    }
    return { success: false, error: 'lockctrl apenas suportado via WebSocket Cloud (Timmy)' };
  }

  return { success: false, error: `Ação desconhecida: ${action}` };
}

// ─── Verificar se um agendamento deve ser executado agora ─────────────────────
/**
 * CORRIGIDO v3: Lê a timezone do utilizador que criou o agendamento
 * Usa um único instante para extrair hora+dia, evitando inconsistências em transições DST.
 */
async function shouldRunNow(schedule, now, base44) {
  // Obter timezone do utilizador que criou o agendamento
  let userTimezone = 'UTC';
  try {
    const owner = await base44.asServiceRole.entities.User.list();
    const ownerUser = owner.find(u => u.email === schedule.criado_por);
    if (ownerUser?.timezone) userTimezone = ownerUser.timezone;
  } catch (e) {
    console.warn(`[shouldRunNow] não consegui obter timezone do utilizador ${schedule.criado_por}, usando UTC`);
  }

  // Derivar todas as partes da hora local a partir de um único instante
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: userTimezone,
    hour: '2-digit', minute: '2-digit',
    weekday: 'short', day: '2-digit',
    hour12: false,
  });

  const partsList = dtf.formatToParts(now);
  const get = (type) => partsList.find(p => p.type === type)?.value || '0';

  const hour   = parseInt(get('hour'),    10);
  const minute = parseInt(get('minute'),  10);
  const day    = parseInt(get('day'),     10);   // dia do mês
  const weekdayStr = get('weekday');              // 'Mon', 'Tue', etc.

  const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const weekday = dayMap[weekdayStr] ?? now.getUTCDay();

  const [schedHour, schedMin] = (schedule.hora || '00:00').split(':').map(Number);
  const nowMins   = hour   * 60 + minute;
  const schedMins = schedHour * 60 + schedMin;

  // Janela de 5 minutos (cron corre a cada 5 min)
  if (Math.abs(nowMins - schedMins) > 4) return false;

  // Anti-duplo: se já executou nos últimos 6 minutos, não executar de novo
  if (schedule.ultima_execucao) {
    const lastRun = new Date(schedule.ultima_execucao);
    const diffMins = (now - lastRun) / 60000;
    if (diffMins < 6) return false;
  }

  const freq = schedule.frequencia;
  if (freq === 'diaria') return true;

  if (freq === 'semanal') {
    const dias = JSON.parse(schedule.dias_semana || '[1,2,3,4,5]');
    return dias.includes(weekday);
  }

  if (freq === 'mensal') {
    return day === (schedule.dia_mes || 1);
  }

  if (freq === 'unica' && schedule.data_unica) {
    const target = new Date(schedule.data_unica);
    const diffMins = Math.abs((target - now) / 60000);
    return diffMins <= 4 && !schedule.ultima_execucao;
  }

  return false;
}

// ─── Handler Principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    const schedules = await base44.asServiceRole.entities.ScheduledAction.filter({ ativo: true });

    const results = [];
    let executed = 0;

    for (const schedule of schedules) {
      if (!await shouldRunNow(schedule, now, base44)) continue;

      let result;
      try {
        const terminal = await base44.asServiceRole.entities.Terminal.get(schedule.terminal_id);
        if (!terminal || !terminal.ativo) {
          result = { success: false, error: 'Terminal não encontrado ou inativo' };
        } else {
          // Passar parâmetros extras do agendamento (ex: fuc para lockctrl)
          const scheduleParams = schedule.params ? JSON.parse(schedule.params) : {};
          result = await runAction(terminal, schedule.acao, scheduleParams);
        }
      } catch (err) {
        result = { success: false, error: err.message };
      }

      const ts = now.toISOString();
      const sucesso = result.success !== false;

      // Gravar log e atualizar agendamento em paralelo
      await Promise.all([
        base44.asServiceRole.entities.OperationLog.create({
          terminal_id: schedule.terminal_id,
          terminal_nome: schedule.terminal_nome,
          acao: schedule.acao,
          executado_por: `cron:${schedule.nome}`,
          sucesso,
          mensagem: result.message || result.error || 'Executado via agendamento',
          resposta_raw: JSON.stringify(result),
          timestamp: ts,
        }).catch(() => {}),

        base44.asServiceRole.entities.ScheduledAction.update(schedule.id, {
          ultima_execucao: ts,
          ultimo_resultado: sucesso ? 'sucesso' : 'falha',
          total_execucoes: (schedule.total_execucoes || 0) + 1,
          // Execução única: desativar após executar
          ...(schedule.frequencia === 'unica' ? { ativo: false } : {}),
        }).catch(() => {}),
      ]);

      results.push({
        id: schedule.id,
        nome: schedule.nome,
        acao: schedule.acao,
        terminal: schedule.terminal_nome,
        sucesso,
        msg: result.message || result.error,
      });
      executed++;
    }

    return Response.json({ ok: true, executed, results, checkedAt: now.toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});