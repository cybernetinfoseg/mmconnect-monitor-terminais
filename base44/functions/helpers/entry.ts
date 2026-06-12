/**
 * helpers.js — Funções reutilizáveis para backend
 * Reduz duplicação entre monitorAllTerminals, monitorTerminal, admsReport, nocServerReport, etc.
 */

/**
 * Valida e extrai API Key do request header
 */
export async function validateApiKey(req, base44) {
  const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
  if (!apiKey || apiKey.length < 16) {
    return { valid: false, error: 'API Key ausente ou inválida', status: 401 };
  }

  const allKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
  const match = allKeys.find(k => k.key === apiKey);

  if (!match) {
    return { valid: false, error: 'API Key inválida', status: 401 };
  }

  return { valid: true, ownerEmail: match.user_email };
}

/**
 * Obtém terminais de um proprietário, deduplicados
 */
export async function getTerminalsByOwner(base44, ownerEmail, filterTipo = null, adminMode = false) {
  let allTerminals = [];

  if (adminMode) {
    allTerminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });
  } else {
    const [byUsuario, byCreated] = await Promise.all([
      base44.asServiceRole.entities.Terminal.filter({ ativo: true, usuario_email: ownerEmail }),
      base44.asServiceRole.entities.Terminal.filter({ ativo: true, created_by: ownerEmail }),
    ]);
    const seen = new Set();
    allTerminals = [...byUsuario, ...byCreated].filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }

  if (filterTipo && filterTipo.length > 0) {
    return allTerminals.filter(t => filterTipo.includes(t.tipo_conexao));
  }

  return allTerminals;
}

/**
 * Verifica se utilizador é admin
 */
export async function isUserAdmin(base44, ownerEmail) {
  const users = await base44.asServiceRole.entities.User.filter({ email: ownerEmail }).catch(() => []);
  return users[0]?.role === 'admin';
}

/**
 * Verifica permissão do utilizador sobre terminal
 */
export async function checkTerminalPermission(base44, terminal, ownerEmail, isAdmin) {
  if (isAdmin) return true;
  return terminal.usuario_email === ownerEmail || terminal.created_by === ownerEmail;
}

/**
 * Verifica se está em janela de manutenção
 */
export async function isInMaintenanceWindow(base44, terminalId) {
  const windows = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id: terminalId, ativo: true });
  const agora_ms = Date.now();
  return windows.some(j => {
    const ini = new Date(j.inicio).getTime();
    const fim = new Date(j.fim).getTime();
    return agora_ms >= ini && agora_ms <= fim;
  });
}

/**
 * Atualiza cache de status
 */
export async function updateStatusCache(base44, terminalId, novoStatus, agora) {
  const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminalId });
  const cache = cacheResults[0] || null;
  const statusAnterior = cache?.ultimo_status || null;

  const cacheUpdate = { ultimo_status: novoStatus, atualizado_em: agora.toISOString() };
  if (cache) {
    await base44.asServiceRole.entities.StatusCache.update(cache.id, cacheUpdate);
  } else {
    await base44.asServiceRole.entities.StatusCache.create({ terminal_id: terminalId, ...cacheUpdate });
  }

  return statusAnterior;
}

/**
 * Manipula mudança de estado do terminal (online/offline)
 * Cria AlertIncident, EscalationAlert, StatusHistory, notificações
 */
export async function handleStatusChange(base44, terminal, novoStatus, statusAnterior, agora) {
  const statusMudou = statusAnterior !== null && statusAnterior !== novoStatus;

  if (!statusMudou) return { statusMudou: false };

  // Registar histórico
  await base44.asServiceRole.entities.StatusHistory.create({
    terminal_id: terminal.id,
    terminal_nome: terminal.nome,
    status: novoStatus,
    timestamp: agora.toISOString(),
    local: terminal.local || '',
    cliente: terminal.cliente_nome || '',
  }).catch(() => {});

  if (novoStatus === 'offline') {
    // Terminal foi para offline
    await Promise.all([
      base44.asServiceRole.entities.AlertIncident.create({
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        local: terminal.local || '',
        cliente: terminal.cliente_nome || '',
        tipo: 'offline',
        timestamp: agora.toISOString(),
        resolvido: false,
        notificado: false,
      }),
      base44.asServiceRole.entities.EscalationAlert.create({
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        local: terminal.local || '',
        cliente: terminal.cliente_nome || '',
        owner_email: terminal.created_by || '',
        offline_desde: agora.toISOString(),
        escalado: false,
        resolvido: false,
        notificacao_inicial_enviada: false,
      }).catch(() => {}),
      base44.asServiceRole.functions.invoke('pushNotify', {
        action: 'notify_offline',
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        local: terminal.local || '',
        cliente: terminal.cliente_nome || '',
        owner_email: terminal.created_by || '',
      }).catch(() => {}),
    ]);
  } else if (novoStatus === 'online') {
    // Terminal volta ao online
    const [openIncidents, openEscalations] = await Promise.all([
      base44.asServiceRole.entities.AlertIncident.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
      base44.asServiceRole.entities.EscalationAlert.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
    ]);

    await Promise.all([
      ...openIncidents.map(inc => {
        const duracao = Math.round((agora - new Date(inc.timestamp)) / 60000);
        return base44.asServiceRole.entities.AlertIncident.update(inc.id, {
          resolvido: true,
          resolvido_em: agora.toISOString(),
          duracao_minutos: duracao,
        }).catch(() => {});
      }),
      ...openEscalations.map(esc => 
        base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {})
      ),
      base44.asServiceRole.entities.AlertIncident.create({
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        local: terminal.local || '',
        cliente: terminal.cliente_nome || '',
        tipo: 'restored',
        timestamp: agora.toISOString(),
        resolvido: true,
        notificado: false,
      }).catch(() => {}),
    ]);
  }

  return { statusMudou: true };
}

/**
 * Processa marcações com deduplicação
 */
export async function processMarcacoes(base44, terminalId, terminal, marcacoes, enrollMap = {}, dedup_window_ms = 30000) {
  if (!Array.isArray(marcacoes) || marcacoes.length === 0) return 0;

  // Buscar marcações recentes para deduplicação
  const recentesRaw = await base44.asServiceRole.entities.Marcacao.filter({ terminal_id: terminalId }).catch(() => []);
  const dedupSet = new Set();
  recentesRaw.forEach(m => {
    if (m.timestamp) {
      const bucket = Math.floor(new Date(m.timestamp).getTime() / dedup_window_ms);
      dedupSet.add(`${m.enrollid}|${bucket}`);
    }
  });

  let saved = 0;
  for (const m of marcacoes) {
    try {
      const tsStr = m.timestamp || new Date().toISOString();
      const tsMs = new Date(tsStr).getTime();
      if (isNaN(tsMs)) continue;

      const enrollid = Number(m.enrollid) || 0;
      const bucket = Math.floor(tsMs / dedup_window_ms);
      const dedupKey = `${enrollid}|${bucket}`;

      if (dedupSet.has(dedupKey)) continue;
      dedupSet.add(dedupKey);

      // Normalizar tipo
      let tipo = 'desconhecido';
      const inoutVal = m.inout || m.tipo;
      if (inoutVal === 'entrada' || inoutVal === 0) tipo = 'entrada';
      else if (inoutVal === 'saida' || inoutVal === 1) tipo = 'saida';

      await base44.asServiceRole.entities.Marcacao.create({
        terminal_id: terminalId,
        terminal_nome: terminal.nome,
        enrollid,
        utilizador_nome: enrollMap[enrollid] || '',
        timestamp: tsStr,
        tipo,
        modo: m.mode || m.modo || 'desconhecido',
        raw_mode: m.raw_mode ?? null,
        local: terminal.local || '',
        exportado: false,
      });
      saved++;
    } catch (e) {
      console.warn(`[processMarcacoes] Erro enrollid=${m.enrollid}: ${e.message}`);
    }
  }

  return saved;
}

/**
 * Verifica terminal ativo com retry
 */
export async function checkTerminalActiveWithRetry(terminal, maxRetries = 3, CHECK_TIMEOUT_MS = 4000, RETRY_DELAY_MS = 1500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await checkTerminalActive(terminal, CHECK_TIMEOUT_MS);
    if (result.online) return { ...result, tentativas: attempt };
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return { online: false, tentativas: maxRetries };
}

/**
 * Verifica status de terminal ativo (TCP/HTTP/API)
 */
export async function checkTerminalActive(terminal, CHECK_TIMEOUT_MS = 4000) {
  const porta = terminal.porta || 5005;
  const inicio = Date.now();

  try {
    if (terminal.tipo_conexao === 'api' && terminal.api_endpoint) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(terminal.api_endpoint, { signal: controller.signal });
        clearTimeout(timer);
        return { online: res.ok || res.status < 500, latencia_ms: Date.now() - inicio };
      } catch {
        clearTimeout(timer);
        return { online: false };
      }
    }

    const host = terminal.tipo_conexao === 'ip_publico' ? terminal.ip_publico :
                 terminal.tipo_conexao === 'dns' ? terminal.dns : null;

    if (!host) return { online: false };

    // TCP
    try {
      const conn = await Promise.race([
        Deno.connect({ hostname: host, port: Number(porta) }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('tcp_timeout')), CHECK_TIMEOUT_MS))
      ]);
      conn.close();
      return { online: true, latencia_ms: Date.now() - inicio };
    } catch {}

    // Fallback HTTP
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
      await fetch(`http://${host}:${porta}`, { signal: controller.signal });
      clearTimeout(timer);
      return { online: true, latencia_ms: Date.now() - inicio };
    } catch {
      return { online: false };
    }
  } catch {
    return { online: false };
  }
}

/**
 * Verifica servidor WebSocket Timmy
 */
export async function checkTimmyWsServer(terminal, CHECK_TIMEOUT_MS = 4000) {
  const sn = (terminal.numero_serie || '').trim();
  if (!sn) return { serverReachable: false, online: false };

  const host = terminal.ip_publico || terminal.dns || Deno.env.get('NOC_SERVER_HOST') || null;
  if (!host) return { serverReachable: false, online: false };

  try {
    const ctrlPort = 7789;
    const resp = await fetch(`http://${host}:${ctrlPort}/status/${sn}`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!resp.ok) return { serverReachable: true, online: false };
    const data = await resp.json();
    return { serverReachable: true, online: data.connected === true };
  } catch {
    return { serverReachable: false, online: false };
  }
}