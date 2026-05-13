/**
 * monitorTerminal — verificação pontual de um terminal via HTTP/TCP.
 *
 * Pode ser chamado:
 *   - Pelo frontend (utilizador autenticado, dono ou admin)
 *   - Pelo scheduler/automação (sem user — usa service role)
 *
 * Terminais PASSIVOS não podem ser sondados diretamente:
 *   - ip_local   → Agente Local (agentReport)
 *   - heartbeat  → NOC Server TCP heartbeat
 *   - adms_push  → NOC Server ADMS push
 *   - sdk_tcp    → NOC Server SDK polling
 *   - p2s        → P2S Server (conexão inversa)
 *   - websocket_cloud → Timmy WS Server
 *
 * Terminais ATIVOS (sondagem direta):
 *   - ip_publico, dns, api
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PASSIVE_TYPES = new Set(['ip_local', 'heartbeat', 'adms_push', 'sdk_tcp', 'p2s', 'websocket_cloud']);
const CHECK_TIMEOUT_MS = 5000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: aceita chamada sem user (automação/scheduler) ou user autenticado (dono/admin)
    let callerUser = null;
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      callerUser = await base44.auth.me();
    }

    const body = await req.json().catch(() => ({}));
    const terminal_id = body.terminal_id || body.terminalId;
    if (!terminal_id) {
      return Response.json({ error: 'terminal_id obrigatório' }, { status: 400 });
    }

    const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id);
    if (!terminal) {
      return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
    }

    // Se chamado por utilizador autenticado, verificar permissão
    if (callerUser) {
      if (callerUser.role !== 'admin' && terminal.created_by !== callerUser.email && terminal.usuario_email !== callerUser.email) {
        return Response.json({ error: 'Forbidden: não é dono deste terminal' }, { status: 403 });
      }
    }

    // Terminais passivos: informar o motivo
    if (PASSIVE_TYPES.has(terminal.tipo_conexao)) {
      const agente = terminal.tipo_conexao === 'ip_local' ? 'Agente Local' :
                     terminal.tipo_conexao === 'p2s' ? 'P2S Server' :
                     terminal.tipo_conexao === 'websocket_cloud' ? 'Timmy WS Server' : 'NOC Server';
      return Response.json({
        success: false,
        error: `Terminais "${terminal.tipo_conexao}" são monitorizados pelo ${agente} (push) — sondagem direta não disponível.`,
        status: terminal.status || 'unknown',
        ultimo_ping: terminal.ultimo_ping,
      }, { status: 400 });
    }

    const result = await checkTerminalActive(terminal);
    const agora = new Date();
    const novoStatus = result.online ? 'online' : 'offline';

    // Buscar status anterior via cache
    const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
    const cache = cacheResults[0] || null;
    const statusAnterior = cache?.ultimo_status || null;
    const statusMudou = statusAnterior !== novoStatus;

    // Actualizar terminal
    await base44.asServiceRole.entities.Terminal.update(terminal.id, {
      status: novoStatus,
      latencia_ms: result.latencia_ms || null,
      ultimo_check: agora.toISOString(),
      ...(result.online ? { ultimo_ping: agora.toISOString() } : {}),
    });

    // Actualizar cache
    if (cache) {
      await base44.asServiceRole.entities.StatusCache.update(cache.id, { ultimo_status: novoStatus, atualizado_em: agora.toISOString() });
    } else {
      await base44.asServiceRole.entities.StatusCache.create({ terminal_id: terminal.id, ultimo_status: novoStatus, atualizado_em: agora.toISOString() });
    }

    // Eventos de mudança de estado
    if (statusMudou) {
      if (novoStatus === 'offline') {
        await Promise.all([
          base44.asServiceRole.entities.AlertIncident.create({
            terminal_id: terminal.id, terminal_nome: terminal.nome,
            local: terminal.local || '', cliente: terminal.cliente_nome || '',
            tipo: 'offline', timestamp: agora.toISOString(), resolvido: false, notificado: false,
          }),
          base44.asServiceRole.entities.EscalationAlert.create({
            terminal_id: terminal.id, terminal_nome: terminal.nome,
            local: terminal.local || '', cliente: terminal.cliente_nome || '',
            owner_email: terminal.created_by || '',
            offline_desde: agora.toISOString(), escalado: false, resolvido: false, notificacao_inicial_enviada: false,
          }).catch(() => {}),
          base44.asServiceRole.functions.invoke('pushNotify', {
            action: 'notify_offline', terminal_id: terminal.id,
            terminal_nome: terminal.nome, local: terminal.local || '',
            cliente: terminal.cliente_nome || '', owner_email: terminal.created_by || '',
          }).catch(() => {}),
          base44.asServiceRole.entities.StatusHistory.create({
            terminal_id: terminal.id, terminal_nome: terminal.nome,
            status: novoStatus, timestamp: agora.toISOString(),
            local: terminal.local || '', cliente: terminal.cliente_nome || '',
          }).catch(() => {}),
        ]);
      } else {
        // Voltou online — resolver incidentes abertos
        const [openIncidents, openEscalations] = await Promise.all([
          base44.asServiceRole.entities.AlertIncident.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
          base44.asServiceRole.entities.EscalationAlert.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
        ]);
        await Promise.all([
          ...openIncidents.map(inc => {
            const duracao = Math.round((agora - new Date(inc.timestamp)) / 60000);
            return base44.asServiceRole.entities.AlertIncident.update(inc.id, { resolvido: true, resolvido_em: agora.toISOString(), duracao_minutos: duracao }).catch(() => {});
          }),
          ...openEscalations.map(esc => base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {})),
          base44.asServiceRole.entities.AlertIncident.create({
            terminal_id: terminal.id, terminal_nome: terminal.nome,
            local: terminal.local || '', cliente: terminal.cliente_nome || '',
            tipo: 'restored', timestamp: agora.toISOString(), resolvido: true, notificado: false,
          }).catch(() => {}),
          base44.asServiceRole.entities.StatusHistory.create({
            terminal_id: terminal.id, terminal_nome: terminal.nome,
            status: novoStatus, timestamp: agora.toISOString(),
            local: terminal.local || '', cliente: terminal.cliente_nome || '',
          }).catch(() => {}),
        ]);
      }
    }

    return Response.json({ success: true, terminal_id, status: novoStatus, latencia_ms: result.latencia_ms, statusMudou });

  } catch (error) {
    console.error('[monitorTerminal] erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});

async function checkTerminalActive(terminal) {
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

    // TCP primeiro
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