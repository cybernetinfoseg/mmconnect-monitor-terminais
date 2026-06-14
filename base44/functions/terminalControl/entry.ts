/**
 * terminalControl.js — Controlo Remoto de Terminais Biométricos
 *
 * Suporte por tipo de conexão:
 *   - websocket_cloud (Timmy/THbio): relay via timmy_ws_server.py (HTTP → WS → Terminal)
 *   - adms_push / sdk_tcp (ZKTeco): relay via noc_server.py (HTTP → ADMS → Terminal)
 *   - ip_publico / dns + hikvision: Hikvision ISAPI REST direto
 *   - ip_publico / dns + dahua: Dahua HTTP CGI API direto
 *
 * Servidor NOC configurável via variável de ambiente NOC_SERVER_HOST.
 * Nunca use IPs hardcoded — configure NOC_SERVER_HOST no painel de secrets.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Resolve o host do servidor NOC.
 * Prioridade: campo ip_publico/dns do terminal (se preenchido para ADMS) → NOC_SERVER_HOST (env var) → erro
 * Para Timmy WS, o servidor central é sempre NOC_SERVER_HOST.
 */
function getNocServerHost() {
  const host = Deno.env.get('NOC_SERVER_HOST');
  if (!host) {
    throw new Error(
      'Variável de ambiente NOC_SERVER_HOST não configurada.\n' +
      'Aceda ao painel de Configurações → Secrets e defina NOC_SERVER_HOST com o IP público ou hostname do servidor NOC.\n' +
      'Exemplo: 51.91.219.145 ou noc.meudominio.com'
    );
  }
  return host;
}

function nowStr(timezone) {
  const now = new Date();
  if (timezone) {
    try {
      // Format in the target timezone as "YYYY-MM-DD HH:MM:SS"
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const p = {};
      parts.forEach(({ type, value }) => { p[type] = value; });
      return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
    } catch {}
  }
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

// ─── Helpers de comunicação ──────────────────────────────────────────────────

/**
 * sendAdmsCommand — envia comando ao noc_server.py via HTTP (porta 7790).
 * O campo ip_publico/dns do terminal deve apontar para o servidor NOC se diferente do padrão,
 * caso contrário usa NOC_SERVER_HOST.
 */
async function sendAdmsCommand(terminal, action, params = {}) {
  const host = terminal.ip_publico || terminal.dns || getNocServerHost();
  const sn = terminal.numero_serie || '';
  if (!sn) {
    return { success: false, error: 'Número de série (SN) não configurado — obrigatório para terminais ADMS/ZKTeco.' };
  }

  const ctrlPort = 7790;
  const url = `http://${host}:${ctrlPort}/cmd`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sn, action, params }),
    signal: AbortSignal.timeout(15000),
  }).catch(e => { throw new Error(`Não foi possível contactar noc_server.py em ${host}:${ctrlPort} — ${e.message}`); });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    throw new Error(`noc_server.py respondeu ${resp.status}: ${errBody || 'erro desconhecido'}`);
  }

  const data = await resp.json();
  return {
    success: data.success !== false,
    message: data.message || (data.success ? 'Comando executado' : 'Falha no servidor ADMS'),
    data: data.result || data,
    note: data.note,
  };
}

/**
 * sendTimmyCommand — envia comando ao timmy_ws_server.py via HTTP (porta 7789).
 * Prioridade: ip_publico do terminal → dns → NOC_SERVER_HOST global.
 * Isto permite servidores Timmy locais/diferentes por terminal.
 */
async function sendTimmyCommand(terminal, command, maxAttempts = 2) {
  // Para websocket_cloud: usar ip_publico do terminal (servidor Timmy WS), ou NOC_SERVER_HOST global
  let host;
  if (terminal.ip_publico || terminal.dns) {
    host = terminal.ip_publico || terminal.dns;
  } else {
    const envHost = Deno.env.get('NOC_SERVER_HOST');
    if (!envHost) {
      throw new Error(
        `[Timmy WebSocket Cloud] Endereço do servidor Timmy WS não configurado para o terminal "${terminal.nome}".\n` +
        `Solução: Preencha o campo "IP Público" do terminal com o IP/hostname da máquina onde corre o timmy_ws_server.py (ex: 51.91.219.145).\n` +
        `Alternativa: Configure a variável de ambiente NOC_SERVER_HOST com esse endereço.`
      );
    }
    host = envHost;
  }
  const ctrlPort = 7789;
  const sn = terminal.numero_serie || '';

  if (!sn) {
    throw new Error(
      `[Timmy WebSocket Cloud] Número de série (SN) não configurado no terminal "${terminal.nome}".\n` +
      `Aceda ao terminal: MENU → Sys Info → Info → SN e preencha o campo no NOC Monitor.`
    );
  }

  const url = `http://${host}:${ctrlPort}/cmd`;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sn, command }),
        signal: AbortSignal.timeout(20000), // 20s por tentativa
      });

      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '');
        throw new Error(`Servidor Timmy respondeu ${resp.status}: ${errBody || 'erro desconhecido'}`);
      }

      const data = await resp.json();
      if (!data.success) {
        throw new Error(data.error || 'Servidor Timmy não conseguiu enviar o comando ao terminal');
      }

      const result = data.result || { result: true };

      // Detectar "can not find this command" — o firmware não suporta este comando
      if (result.result === false && result.msg && result.msg.toLowerCase().includes('can not find this command')) {
        throw new Error(`O terminal "${terminal.nome}" (modelo: ${terminal.modelo || 'desconhecido'}) não suporta o comando "${command.cmd}". Este firmware não implementa esta função.`);
      }

      return result;

    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts) {
        console.warn(`[sendTimmyCommand] tentativa ${attempt}/${maxAttempts} falhou (${command.cmd}) — retry em 3s: ${e.message}`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  throw new Error(`Servidor Timmy (${host}:${ctrlPort}) inacessível após ${maxAttempts} tentativa(s) — ${lastError?.message}`);
}

function buildTerminalBaseUrl(terminal) {
  const ip = terminal.ip_publico || terminal.dns || terminal.ip_local;
  const port = terminal.porta || 80;
  return `http://${ip}:${port}`;
}

async function hikvisionRequest(terminal, method, path, body = null) {
  const base = buildTerminalBaseUrl(terminal);
  const creds = btoa(`admin:${terminal.observacoes || 'admin'}`);
  const opts = {
    method,
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${base}${path}`, opts);
  const text = await resp.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: resp.status }; }
}

/**
 * dahuaRequest — Digest Auth (MD5) para Dahua CGI.
 * A Dahua requer Digest Auth na maioria dos endpoints (Basic retorna 401).
 */
async function dahuaRequest(terminal, cgiPath) {
  const base = buildTerminalBaseUrl(terminal);
  const user = 'admin';
  const pass = terminal.observacoes || 'admin';
  const url = `${base}${cgiPath}`;

  // 1ª tentativa — sem auth (obter WWW-Authenticate com nonce)
  const r1 = await fetch(url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r1 || r1.status !== 401) {
    // Sem autenticação ou resposta directa
    return { status: r1?.status || 0, body: await r1?.text().catch(() => '') };
  }

  // Extrair parâmetros Digest do header WWW-Authenticate
  const wwwAuth = r1.headers.get('www-authenticate') || '';
  const realm  = (wwwAuth.match(/realm="([^"]*)"/)  || [])[1] || '';
  const nonce  = (wwwAuth.match(/nonce="([^"]*)"/)  || [])[1] || '';
  const qop    = (wwwAuth.match(/qop="([^"]*)"/)    || [])[1] || '';
  const opaque = (wwwAuth.match(/opaque="([^"]*)"/) || [])[1] || '';

  // Calcular HA1, HA2, response (MD5 via SubtleCrypto)
  const md5 = async (str) => {
    const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(str)).catch(() => null);
    if (!buf) return str; // fallback se MD5 não disponível
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const nc = '00000001';
  const cnonce = Math.random().toString(36).substring(2, 10);
  const ha1 = await md5(`${user}:${realm}:${pass}`);
  const ha2 = await md5(`GET:${cgiPath.split('?')[0]}`);
  const response = qop
    ? await md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : await md5(`${ha1}:${nonce}:${ha2}`);

  const authHeader = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${cgiPath.split('?')[0]}", ` +
    (qop ? `qop=${qop}, nc=${nc}, cnonce="${cnonce}", ` : '') +
    `response="${response}"` +
    (opaque ? `, opaque="${opaque}"` : '');

  const r2 = await fetch(url, {
    headers: { 'Authorization': authHeader },
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  return { status: r2?.status || 0, body: await r2?.text().catch(() => '') };
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function actionSetTime(terminal, _params, userTimezone) {
  const now = nowStr(userTimezone);
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    const resp = await sendTimmyCommand(terminal, { cmd: 'settime', cloudtime: now });
    return { success: resp.result === true, message: `Relógio acertado para ${now}`, data: resp };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    return await sendAdmsCommand(terminal, 'settime', { time: now });
  }
  if (fab === 'hikvision') {
    const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/time', { timeMode: 'manual', localTime: now, timeZone: 'UTC+0:00' });
    return { success: true, message: `Relógio acertado (Hikvision)`, data: resp };
  }
  if (fab === 'dahua') {
    const resp = await dahuaRequest(terminal, `/cgi-bin/global.cgi?action=setCurrentTime&time=${encodeURIComponent(now)}`);
    return { success: resp.status === 200, message: `Relógio acertado (Dahua)`, data: resp };
  }
  if (fab === 'zkteco' || fab === 'anviz') {
    return await sendAdmsCommand(terminal, 'settime', { time: now });
  }
  return { success: false, error: `settime não suportado para tipo: ${tipo} / fabricante: ${fab}` };
}

async function actionGetLogs(terminal) {
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    const resp = await sendTimmyCommand(terminal, { cmd: 'getnewlog', stn: true });
    const records = resp.record || [];
    return { success: resp.result === true, message: `${resp.count || 0} marcações recolhidas`, count: resp.count || 0, records: records.slice(0, 50) };
  }
  if (tipo === 'adms_push') {
    return { success: true, message: 'Terminais ADMS enviam marcações automaticamente via POST /iclock/cdata.', note: 'Consulte o histórico no painel.' };
  }
  if (tipo === 'sdk_tcp') {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { AcsEventCond: { searchID: '1', searchResultPosition: 0, maxResults: 50 } });
      return { success: true, message: 'Marcações Hikvision recolhidas', data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, '/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&StartTime=2000-01-01%2000%3A00%3A00&EndTime=2099-12-31%2023%3A59%3A59&count=50');
      return { success: resp.status === 200, message: 'Marcações Dahua recolhidas', data: resp.body };
    }
    return await sendAdmsCommand(terminal, 'getlogs', {});
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'POST', '/ISAPI/AccessControl/AcsEvent?format=json', { AcsEventCond: { searchID: '1', searchResultPosition: 0, maxResults: 50 } });
      return { success: true, message: 'Marcações Hikvision recolhidas', data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, '/cgi-bin/recordFinder.cgi?action=find&name=AccessControlCardRec&StartTime=2000-01-01%2000%3A00%3A00&EndTime=2099-12-31%2023%3A59%3A59&count=50');
      return { success: resp.status === 200, message: 'Marcações Dahua recolhidas', data: resp.body };
    }
    if (fab === 'zkteco' || fab === 'anviz') {
      return await sendAdmsCommand(terminal, 'getlogs', {});
    }
  }
  return { success: false, error: `getlogs não suportado para ${tipo}` };
}

async function actionOpenDoor(terminal) {
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    // 3 tentativas para comandos críticos de acesso
    const resp = await sendTimmyCommand(terminal, { cmd: 'opendoor' }, 3);
    return { success: resp.result === true || resp.result === undefined, message: 'Porta aberta remotamente', data: resp };
  }

  // Hikvision ISAPI: PUT /ISAPI/AccessControl/RemoteControl/door/1 com body JSON
  // Ref: Hikvision ISAPI v2.0 — Access Control Remote Control
  const hikvisionOpenDoor = async () => {
    const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/AccessControl/RemoteControl/door/1',
      { RemoteControlDoorParam: { door: 1, controlType: 'open' } });
    return { success: true, message: 'Porta aberta (Hikvision ISAPI)', data: resp };
  };

  // Dahua CGI: openDoor via accessControl.cgi
  // Ref: Dahua HTTP API — Access Control
  const dahuaOpenDoor = async () => {
    const resp = await dahuaRequest(terminal, '/cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote');
    return { success: resp.status === 200, message: 'Porta aberta (Dahua)', data: resp };
  };

  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    if (fab === 'hikvision') return await hikvisionOpenDoor();
    if (fab === 'dahua') return await dahuaOpenDoor();
    return await sendAdmsCommand(terminal, 'opendoor', {});
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') return await hikvisionOpenDoor();
    if (fab === 'dahua') return await dahuaOpenDoor();
    if (fab === 'zkteco' || fab === 'anviz') return await sendAdmsCommand(terminal, 'opendoor', {});
  }
  return { success: false, error: `opendoor não suportado para ${tipo}` };
}

async function actionReboot(terminal) {
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    const resp = await sendTimmyCommand(terminal, { cmd: 'reboot' });
    return { success: true, message: 'Comando de reinício enviado. Terminal reiniciará imediatamente.', data: resp };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/reboot');
      return { success: true, message: 'Reinício enviado (Hikvision)', data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=reboot');
      return { success: resp.status === 200, message: 'Reinício enviado (Dahua)' };
    }
    return await sendAdmsCommand(terminal, 'reboot', {});
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/System/reboot');
      return { success: true, message: 'Reinício enviado (Hikvision)', data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=reboot');
      return { success: resp.status === 200, message: 'Reinício enviado (Dahua)' };
    }
    if (fab === 'zkteco' || fab === 'anviz') {
      return await sendAdmsCommand(terminal, 'reboot', {});
    }
  }
  return { success: false, error: `reboot não suportado para ${tipo}` };
}

async function actionGetDevInfo(terminal) {
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    // "Info do Dispositivo" — devolve dados já guardados em BD (sem chamar o terminal)
    // Os dados de hardware (SN, modelo, firmware) chegam no heartbeat de registo (cmd=reg)
    return {
      success: true,
      message: 'Informação do dispositivo obtida',
      data: {
        sn: terminal.numero_serie,
        modelo: terminal.modelo,
        fabricante: terminal.fabricante,
        local: terminal.local,
        status: terminal.status,
        ultimo_ping: terminal.ultimo_ping,
        latencia_ms: terminal.latencia_ms,
        segundos_sem_ping: terminal.segundos_sem_ping,
        tipo_conexao: terminal.tipo_conexao,
      }
    };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'GET', '/ISAPI/System/deviceInfo');
      return { success: true, message: 'Info Hikvision obtida', data: resp };
    }
    if (fab === 'dahua') {
      const [r1, r2] = await Promise.all([
        dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=getSystemInfo'),
        dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=getSoftwareVersion'),
      ]);
      return { success: r1.status === 200, message: 'Info Dahua obtida', data: { system: r1.body, version: r2.body } };
    }
    return await sendAdmsCommand(terminal, 'getdevinfo', {});
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'GET', '/ISAPI/System/deviceInfo');
      return { success: true, message: 'Info Hikvision obtida', data: resp };
    }
    if (fab === 'dahua') {
      const [r1, r2] = await Promise.all([
        dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=getSystemInfo'),
        dahuaRequest(terminal, '/cgi-bin/magicBox.cgi?action=getSoftwareVersion'),
      ]);
      return { success: r1.status === 200, message: 'Info Dahua obtida', data: { system: r1.body, version: r2.body } };
    }
    if (fab === 'zkteco' || fab === 'anviz') {
      return await sendAdmsCommand(terminal, 'getdevinfo', {});
    }
  }
  return { success: false, error: `getdevinfo não suportado para ${tipo}` };
}

async function actionSetDoorStatus(terminal, params) {
  const fuc = params?.fuc ?? 1;
  if (terminal.tipo_conexao === 'websocket_cloud') {
    // 3 tentativas para comandos críticos de controlo de porta
    const resp = await sendTimmyCommand(terminal, { cmd: 'lockctrl', fuc }, 3);
    const msgs = { 1: 'Porta forçada aberta (permanente)', 2: 'Porta forçada fechada', 3: 'Porta aberta temporariamente', 4: 'Relay resetado', 6: 'Alarme cancelado' };
    return { success: resp.result === true || resp.result === undefined, message: msgs[fuc] || `lockctrl fuc=${fuc}`, data: resp };
  }
  return { success: false, error: 'lockctrl apenas suportado via WebSocket Cloud (Timmy)' };
}

async function actionAddUser(terminal, params) {
  const { enrollid, name, password = '', card = '', privilege = 0 } = params || {};
  if (!enrollid || !name) return { success: false, error: 'enrollid e name são obrigatórios' };
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    // Protocolo Timmy setuserinfo:
    //   backupnum: 10=senha, 11=cartão RFID, 15=facial (apenas registo de credenciais básicas)
    //   record: valor da credencial (número da senha, número do cartão)
    // Prioridade: cartão > senha > sem credencial (o terminal regista biometria separadamente)
    let backupnum = 10;
    let record = 0;
    if (card && String(card).trim()) {
      backupnum = 11;
      record = Number(card) || 0;
    } else if (password && String(password).trim()) {
      backupnum = 10;
      record = Number(password) || 0;
    }
    const resp = await sendTimmyCommand(terminal, {
      cmd: 'setuserinfo',
      enrollid: Number(enrollid),
      name,
      backupnum,
      admin: Number(privilege),
      record,
    });
    return { success: resp.result === true, message: `Utilizador "${name}" (ID:${enrollid}) adicionado`, data: resp };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    return await sendAdmsCommand(terminal, 'adduser', { enrollid, name, password, card, privilege });
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', {
        UserInfo: { employeeNo: String(enrollid), name, userType: Number(privilege) === 14 ? 'administrator' : 'normal', Valid: { enable: true, beginTime: '2000-01-01T00:00:00', endTime: '2099-12-31T23:59:59', timeType: 'local' }, doorRight: '1', RightPlan: [{ doorNo: 1, planTemplateNo: '1' }] }
      });
      return { success: true, message: `Utilizador "${name}" adicionado (Hikvision)`, data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, `/cgi-bin/recordUpdater.cgi?action=insert&name=AccessControlCard&CardName=${encodeURIComponent(name)}&CardNo=${enrollid}&UserID=${enrollid}&CardStatus=0&CardType=0&Password=${password}&Doors[0]=0`);
      return { success: resp.status === 200, message: `Utilizador "${name}" adicionado (Dahua)`, data: resp };
    }
  }
  return { success: false, error: `adduser não suportado para ${tipo}/${fab}` };
}

async function actionBlockUser(terminal, params) {
  const { enrollid, block = true } = params || {};
  if (!enrollid) return { success: false, error: 'enrollid é obrigatório' };
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';
  const statusLabel = block ? 'bloqueado' : 'desbloqueado';

  if (tipo === 'websocket_cloud') {
    const resp = await sendTimmyCommand(terminal, { cmd: 'enableuser', enrollid: Number(enrollid), enflag: block ? 0 : 1 });
    return { success: resp.result === true, message: `Utilizador ID:${enrollid} ${statusLabel}`, data: resp };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    return await sendAdmsCommand(terminal, 'adduser', { enrollid, privilege: block ? 255 : 0, name: '', password: '', card: '' });
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/AccessControl/UserInfo/Modify?format=json', {
        UserInfo: { employeeNo: String(enrollid), Valid: { enable: !block, beginTime: '2000-01-01T00:00:00', endTime: '2099-12-31T23:59:59', timeType: 'local' } }
      });
      return { success: true, message: `Utilizador ID:${enrollid} ${statusLabel} (Hikvision)`, data: resp };
    }
    if (fab === 'dahua') {
      return { success: false, error: 'Bloqueio de utilizador não suportado via API Dahua CGI' };
    }
  }
  return { success: false, error: `blockuser não suportado para ${tipo}/${fab}` };
}

async function actionDeleteUser(terminal, params) {
  const { enrollid } = params || {};
  if (!enrollid) return { success: false, error: 'enrollid é obrigatório' };
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  if (tipo === 'websocket_cloud') {
    // Protocolo oficial Timmy: cmd = "deleteuser", backupnum=13 apaga tudo (fp+pwd+card+nome)
    const resp = await sendTimmyCommand(terminal, { cmd: 'deleteuser', enrollid: Number(enrollid), backupnum: 13 });
    return { success: resp.result === true, message: `Utilizador ID:${enrollid} removido`, data: resp };
  }
  if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
    return await sendAdmsCommand(terminal, 'deleteuser', { enrollid });
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      const resp = await hikvisionRequest(terminal, 'PUT', '/ISAPI/AccessControl/UserInfo/Delete?format=json', { UserInfoDelCond: { EmployeeNoList: [{ employeeNo: String(enrollid) }] } });
      return { success: true, message: `Utilizador ID:${enrollid} removido (Hikvision)`, data: resp };
    }
    if (fab === 'dahua') {
      const resp = await dahuaRequest(terminal, `/cgi-bin/recordUpdater.cgi?action=remove&name=AccessControlCard&UserID=${enrollid}`);
      return { success: resp.status === 200, message: `Utilizador ID:${enrollid} removido (Dahua)`, data: resp };
    }
  }
  return { success: false, error: `deleteuser não suportado para ${tipo}/${fab}` };
}

// ─── Timmy-specific actions ──────────────────────────────────────────────────

async function actionGetUserList(terminal, params) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getuserlist apenas suportado via WebSocket Cloud (Timmy)' };

  // Protocolo Timmy: "getalluserinfo" devolve todos os utilizadores registados no terminal
  // Fallback para "getalluser" em firmwares mais antigos
  let lastError;
  for (const cmd of ['getalluserinfo', 'getalluser']) {
    try {
      const resp = await sendTimmyCommand(terminal, { cmd });
      const users = resp.record || [];
      return {
        success: resp.result === true,
        message: `${users.length} utilizador(es) encontrado(s)`,
        count: users.length,
        data: { total: resp.count || users.length, users },
        cmd_usado: cmd,
      };
    } catch (e) {
      lastError = e;
      console.warn(`[actionGetUserList] comando "${cmd}" falhou: ${e.message}`);
    }
  }
  return { success: false, error: lastError?.message || 'Nenhum comando de listagem suportado por este terminal' };
}

async function actionGetUserInfo(terminal, params) {
  const { enrollid } = params || {};
  if (!enrollid) return { success: false, error: 'enrollid é obrigatório' };
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getuserinfo apenas suportado via WebSocket Cloud (Timmy)' };
  const resp = await sendTimmyCommand(terminal, { cmd: 'getuserinfo', enrollid: Number(enrollid) });
  if (!resp) return { success: false, message: 'Terminal não respondeu' };
  return { success: resp.result === true, message: `Info do utilizador ID:${enrollid}`, data: resp };
}

async function actionGetAllLogs(terminal, params) {
  const { count = 200, from, to } = params || {};
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getalllog apenas suportado via WebSocket Cloud (Timmy)' };

  // Protocolo oficial Timmy:
  //   getalllog (pág. 16): suporta filtro de datas (from/to opcionais), usa stn:true para paginação
  //   getnewlog (pág. 15): apenas logs novos não lidos, sem filtro de datas
  const cmdGetAll = { cmd: 'getalllog', stn: true };
  if (from) cmdGetAll.from = from;
  if (to)   cmdGetAll.to   = to;

  let lastError;
  for (const cmd of [cmdGetAll, { cmd: 'getnewlog', stn: true }]) {
    try {
      const resp = await sendTimmyCommand(terminal, cmd);
      const records = resp.record || [];
      return {
        success: true,
        message: `${records.length} marcações obtidas (total: ${resp.count || records.length})${from ? ` — de ${from}` : ''}${to ? ` até ${to}` : ''}`,
        count: records.length,
        records: records.slice(0, 200),
        cmd_usado: cmd.cmd,
      };
    } catch (e) {
      lastError = e;
      console.warn(`[actionGetAllLogs] comando "${cmd.cmd}" falhou: ${e.message}`);
    }
  }
  return { success: false, error: lastError?.message || 'Nenhum comando de log suportado por este terminal' };
}

async function actionClearLogs(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'cleanlog apenas suportado via WebSocket Cloud (Timmy)' };
  // Protocolo oficial Timmy: cmd = "cleanlog" (pág. 18 do protocolo)
  const resp = await sendTimmyCommand(terminal, { cmd: 'cleanlog' });
  return { success: resp.result === true, message: 'Todos os logs eliminados do terminal', data: resp };
}

async function actionClearUsers(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'cleanuser apenas suportado via WebSocket Cloud (Timmy)' };
  // Protocolo oficial Timmy: cmd = "cleanuser" (pág. 14 do protocolo — "Clean all users")
  const resp = await sendTimmyCommand(terminal, { cmd: 'cleanuser' });
  return { success: resp.result === true, message: 'Todos os utilizadores eliminados do terminal', data: resp };
}

async function actionGetParam(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getdevinfo apenas suportado via WebSocket Cloud (Timmy)' };
  // Protocolo oficial Timmy: cmd = "getdevinfo" (pág. 22 — "Get terminal parameter")
  const resp = await sendTimmyCommand(terminal, { cmd: 'getdevinfo' });
  return { success: resp.result === true, message: 'Parâmetros do terminal obtidos', data: resp };
}

async function actionSetParam(terminal, params) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'setdevinfo apenas suportado via WebSocket Cloud (Timmy)' };
  // Protocolo oficial Timmy: cmd = "setdevinfo" (pág. 20-21)
  // Apenas enviar os campos fornecidos (todos opcionais conforme protocolo)
  const allowed = ['language', 'volume', 'screensaver', 'verifymode', 'sleep', 'userfpnum', 'loghint', 'reverifytime'];
  const cmd = { cmd: 'setdevinfo' };
  for (const key of allowed) {
    if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
      cmd[key] = Number(params[key]);
    }
  }
  if (Object.keys(cmd).length === 1) return { success: false, error: 'Nenhum parâmetro fornecido' };
  const resp = await sendTimmyCommand(terminal, cmd);
  return { success: resp.result === true, message: 'Configurações aplicadas com sucesso', data: resp };
}

async function actionInitDevice(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'initsys apenas suportado via WebSocket Cloud (Timmy)' };
  const resp = await sendTimmyCommand(terminal, { cmd: 'initsys' });
  return { success: resp.result === true, message: 'Sistema inicializado — utilizadores e logs eliminados (configurações mantidas)', data: resp };
}

async function actionGetTime(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'gettime apenas suportado via WebSocket Cloud (Timmy)' };
  const resp = await sendTimmyCommand(terminal, { cmd: 'gettime' });
  const terminalTime = resp.time || 'Desconhecido';
  const serverTime = nowStr();
  // Calcular desvio
  let desvio = '';
  if (resp.time) {
    const diff = Math.round((new Date(serverTime) - new Date(resp.time)) / 1000);
    desvio = diff >= 0 ? `+${diff}s adiantado no servidor` : `${Math.abs(diff)}s atrasado no terminal`;
  }
  return { success: true, message: `Hora do terminal: ${terminalTime}`, data: { terminal_time: terminalTime, server_time: serverTime, desvio } };
}

async function actionGetDevCap(terminal) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getdevcap apenas suportado via WebSocket Cloud (Timmy)' };
  const resp = await sendTimmyCommand(terminal, { cmd: 'getdevcap' });
  return { success: resp.result === true, message: 'Capacidades do dispositivo obtidas', data: resp };
}

async function actionSetUserProfile(terminal, params) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'setuserprofile apenas suportado via WebSocket Cloud (Timmy)' };
  const { enrollid = 0, profile } = params || {};
  if (!profile && profile !== '') return { success: false, error: 'profile é obrigatório' };
  if (String(profile).length > 200) return { success: false, error: 'profile máximo 200 bytes' };
  const resp = await sendTimmyCommand(terminal, { cmd: 'setuserprofile', enrollid: Number(enrollid), profile: String(profile) });
  const label = enrollid === 0 ? 'Mensagem pública' : `Perfil utilizador ID:${enrollid}`;
  return { success: resp.result === true, message: `${label} atualizado`, data: resp };
}

async function actionGetUserProfile(terminal, params) {
  if (terminal.tipo_conexao !== 'websocket_cloud') return { success: false, error: 'getuserprofile apenas suportado via WebSocket Cloud (Timmy)' };
  const { enrollid = 0 } = params || {};
  const resp = await sendTimmyCommand(terminal, { cmd: 'getuserprofile', enrollid: Number(enrollid) });
  return { success: resp.result === true, message: `Perfil do utilizador ID:${enrollid}`, data: { profile: resp.record, enrollid: resp.enrollid } };
}

/**
 * actionSetUserPhoto — envia foto facial (base64 JPEG) para o terminal.
 * Suportado em modelos AI com câmara: TM-AIFace11F, TM-AI07F, TM-AI08, etc.
 * O terminal processa a imagem e cria o template facial internamente.
 * Protocolo Timmy: cmd = "setuserphoto", enrollid, photo (base64 JPEG).
 * Se foto_url for fornecida, faz download e converte para base64.
 */
async function actionSetUserPhoto(terminal, params) {
  if (terminal.tipo_conexao !== 'websocket_cloud') {
    return { success: false, error: 'setuserphoto apenas suportado via WebSocket Cloud (Timmy AI)' };
  }
  const { enrollid, photo, foto_url } = params || {};
  if (!enrollid) return { success: false, error: 'enrollid é obrigatório' };

  let photoBase64 = photo;

  // Se não foi passado base64 diretamente, fazer download da foto_url
  if (!photoBase64 && foto_url) {
    const imgResp = await fetch(foto_url, { signal: AbortSignal.timeout(15000) })
      .catch(e => { throw new Error(`Não foi possível fazer download da foto: ${e.message}`); });
    if (!imgResp.ok) throw new Error(`Erro ao obter foto (HTTP ${imgResp.status})`);

    const arrayBuf = await imgResp.arrayBuffer();
    // Converter para base64
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    photoBase64 = btoa(binary);
  }

  if (!photoBase64) return { success: false, error: 'photo (base64) ou foto_url é obrigatório' };

  // Limite de tamanho: imagens muito grandes podem causar timeout no terminal
  // Recomendado: JPEG 300x300 a 400x400px, ~30-80KB
  const sizeKB = Math.round((photoBase64.length * 3) / 4 / 1024);
  console.log(`[setuserphoto] enrollid=${enrollid} tamanho estimado: ~${sizeKB}KB`);

  const resp = await sendTimmyCommand(terminal, {
    cmd: 'setuserphoto',
    enrollid: Number(enrollid),
    photo: photoBase64,
  }, 2);

  return {
    success: resp.result === true,
    message: resp.result === true
      ? `Foto facial enviada para utilizador ID:${enrollid} (~${sizeKB}KB)`
      : `Terminal rejeitou a foto (verifique se o modelo suporta reconhecimento facial)`,
    data: resp,
    size_kb: sizeKB,
  };
}

async function actionExportUsers(terminal, params={}) {

  const backupnum = params.backupnum || 50;

  const resp = await sendTimmyCommand(
    terminal,
    {
      cmd: 'getuser',
      backupnum: backupnum
    },
    2
  );


  return {
    success: true,
    message: 'Pedido de exportação FaceID enviado',
    data: resp
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { terminal_id, action, params } = await req.json();
    if (!terminal_id || !action) {
      return Response.json({ error: 'terminal_id e action são obrigatórios' }, { status: 400 });
    }

    const terminal = await base44.entities.Terminal.get(terminal_id);
    if (!terminal) {
      return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    // Ações de gestão de utilizadores (adduser/deleteuser) são permitidas a qualquer utilizador autenticado
    const isUserManagementAction = ['adduser', 'deleteuser', 'blockuser', 'getuserlist', 'getuserinfo', 'setuserphoto', 'exportusers'].includes(action);
    if (!isAdmin && !isUserManagementAction && terminal.created_by !== user.email && terminal.usuario_email !== user.email) {
      return Response.json({ error: 'Sem permissão para controlar este terminal' }, { status: 403 });
    }

    // Fetch user's configured timezone for clock sync
    const userTimezone = user.timezone || 'UTC';

    let result;
    switch (action) {
      case 'settime':     result = await actionSetTime(terminal, params, userTimezone); break;
      case 'getlogs':     result = await actionGetLogs(terminal); break;
      case 'getalllog':   result = await actionGetAllLogs(terminal, params); break;
      case 'opendoor':    result = await actionOpenDoor(terminal); break;
      case 'reboot':      result = await actionReboot(terminal); break;
      case 'getdevinfo':  result = await actionGetDevInfo(terminal); break;
      case 'lockctrl':    result = await actionSetDoorStatus(terminal, params); break;
      case 'adduser':     result = await actionAddUser(terminal, params); break;
      case 'blockuser':   result = await actionBlockUser(terminal, params); break;
      case 'deleteuser':  result = await actionDeleteUser(terminal, params); break;
      case 'getuserlist': result = await actionGetUserList(terminal, params); break;
      case 'getuserinfo': result = await actionGetUserInfo(terminal, params); break;
      case 'clearlog':    result = await actionClearLogs(terminal); break;
      case 'clearusers':  result = await actionClearUsers(terminal); break;
      case 'getparam':    result = await actionGetParam(terminal); break;
      case 'setparam':    result = await actionSetParam(terminal, params); break;
      case 'initdevice':  result = await actionInitDevice(terminal); break;
      case 'gettime':       result = await actionGetTime(terminal); break;
      case 'getdevcap':     result = await actionGetDevCap(terminal); break;
      case 'setuserprofile': result = await actionSetUserProfile(terminal, params); break;
      case 'getuserprofile': result = await actionGetUserProfile(terminal, params); break;
      case 'setuserphoto':   result = await actionSetUserPhoto(terminal, params); break;
      case 'exportusers':   result = await actionExportUsers(terminal, params); break;
      default:
        return Response.json({ error: `Ação desconhecida: ${action}` }, { status: 400 });
    }

    const ts = new Date().toISOString();

    await Promise.all([
      base44.asServiceRole.entities.OperationLog.create({
        terminal_id, terminal_nome: terminal.nome, acao: action,
        executado_por: user.email, sucesso: result.success !== false,
        mensagem: result.message || result.error || (result.success ? 'Operação executada' : 'Operação falhou'),
        resposta_raw: JSON.stringify(result), timestamp: ts,
      }).catch(() => {}),
      base44.asServiceRole.entities.AuditLog.create({
        usuario_email: user.email, acao: 'terminal_verificado',
        entidade: 'Terminal', entidade_id: terminal_id,
        descricao: `Ação remota "${action}" no terminal "${terminal.nome}": ${result.success !== false ? 'sucesso' : 'falha'}`,
        timestamp: ts,
      }).catch(() => {}),
    ]);

    return Response.json({ success: result.success, ...result });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});