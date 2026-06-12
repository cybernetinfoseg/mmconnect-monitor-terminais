/**
 * monitorTerminal — verificação pontual de um terminal via HTTP/TCP.
 *
 * Anti-falso-offline:
 *   - Terminais ativos (ip_publico, dns, api): 3 tentativas com pausa entre elas
 *   - Só declara offline se TODAS as tentativas falharem
 *
 * Pode ser chamado:
 *   - Pelo frontend (utilizador autenticado, dono ou admin)
 *   - Pelo scheduler/automação (sem user — usa service role)
 *
 * Terminais PASSIVOS não podem ser sondados diretamente:
 *   - ip_local, heartbeat, adms_push, sdk_tcp, p2s, websocket_cloud
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { checkTerminalActiveWithRetry, updateStatusCache, handleStatusChange } from './helpers.js';

const PASSIVE_TYPES = new Set(['ip_local', 'heartbeat', 'adms_push', 'sdk_tcp', 'p2s', 'websocket_cloud']);
const CHECK_TIMEOUT_MS = 4000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1500;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

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

    const terminalResults = await base44.asServiceRole.entities.Terminal.filter({ id: terminal_id });
    const terminal = terminalResults[0] || null;
    if (!terminal) {
      return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
    }

    if (callerUser) {
      if (callerUser.role !== 'admin' && terminal.created_by !== callerUser.email && terminal.usuario_email !== callerUser.email) {
        return Response.json({ error: 'Forbidden: não é dono deste terminal' }, { status: 403 });
      }
    }

    // Terminais passivos: informar motivo
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

    // Terminais ativos: 3 tentativas antes de declarar offline
    const result = await checkTerminalActiveWithRetry(terminal, RETRY_COUNT);
    const agora = new Date();
    const novoStatus = result.online ? 'online' : 'offline';

    // Actualizar terminal
    await base44.asServiceRole.entities.Terminal.update(terminal.id, {
      status: novoStatus,
      latencia_ms: result.latencia_ms || null,
      ultimo_check: agora.toISOString(),
      ...(result.online ? { ultimo_ping: agora.toISOString() } : {}),
    });

    // Atualizar cache e obter status anterior
    const statusAnterior = await updateStatusCache(base44, terminal.id, novoStatus, agora);
    const { statusMudou } = await handleStatusChange(base44, terminal, novoStatus, statusAnterior, agora);

    return Response.json({ success: true, terminal_id, status: novoStatus, latencia_ms: result.latencia_ms, statusMudou, tentativas: result.tentativas });

  } catch (error) {
    console.error('[monitorTerminal] erro:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});