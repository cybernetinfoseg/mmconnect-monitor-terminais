/**
 * monitorTerminal — verificação pontual de um terminal via HTTP/TCP.
 * Terminais PASSIVOS não podem ser sondados diretamente.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PASSIVE_TYPES = new Set(['ip_local', 'heartbeat', 'adms_push', 'sdk_tcp', 'p2s', 'websocket_cloud']);
const CHECK_TIMEOUT_MS = 4000;
const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 1500;

// ── Helpers inline ────────────────────────────────────────────────────────────

async function checkTerminalActive(terminal) {
    const porta = terminal.porta || 5005;
    const inicio = Date.now();
    try {
        const host = terminal.tipo_conexao === 'ip_publico' ? terminal.ip_publico :
                     terminal.tipo_conexao === 'dns' ? terminal.dns : null;
        if (!host) return { online: false };
        try {
            const conn = await Promise.race([
                Deno.connect({ hostname: host, port: Number(porta) }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('tcp_timeout')), CHECK_TIMEOUT_MS))
            ]);
            conn.close();
            return { online: true, latencia_ms: Date.now() - inicio };
        } catch {}
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

async function checkTerminalActiveWithRetry(terminal) {
    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
        const result = await checkTerminalActive(terminal);
        if (result.online) return { ...result, tentativas: attempt };
        if (attempt < RETRY_COUNT) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
    return { online: false, tentativas: RETRY_COUNT };
}

async function updateStatusCache(base44, terminalId, novoStatus, agora) {
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

async function handleStatusChange(base44, terminal, novoStatus, statusAnterior, agora) {
    const statusMudou = statusAnterior !== null && statusAnterior !== novoStatus;
    if (!statusMudou) return { statusMudou: false };

    await base44.asServiceRole.entities.StatusHistory.create({
        terminal_id: terminal.id, terminal_nome: terminal.nome,
        status: novoStatus, timestamp: agora.toISOString(),
        local: terminal.local || '', cliente: terminal.cliente_nome || '',
    }).catch(() => {});

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
                owner_email: terminal.created_by || '', offline_desde: agora.toISOString(),
                escalado: false, resolvido: false, notificacao_inicial_enviada: false,
            }).catch(() => {}),
            base44.asServiceRole.functions.invoke('pushNotify', {
                action: 'notify_offline', terminal_id: terminal.id,
                terminal_nome: terminal.nome, local: terminal.local || '',
                cliente: terminal.cliente_nome || '', owner_email: terminal.created_by || '',
            }).catch(() => {}),
        ]);
    } else if (novoStatus === 'online') {
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
        ]);
    }
    return { statusMudou: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let callerUser = null;
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) callerUser = await base44.auth.me();

        const body = await req.json().catch(() => ({}));
        const terminal_id = body.terminal_id || body.terminalId;
        if (!terminal_id) return Response.json({ error: 'terminal_id obrigatório' }, { status: 400 });

        const terminalResults = await base44.asServiceRole.entities.Terminal.filter({ id: terminal_id });
        const terminal = terminalResults[0] || null;
        if (!terminal) return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });

        if (callerUser) {
            if (callerUser.role !== 'admin' && terminal.created_by !== callerUser.email && terminal.usuario_email !== callerUser.email) {
                return Response.json({ error: 'Forbidden: não é dono deste terminal' }, { status: 403 });
            }
        }

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

        const result = await checkTerminalActiveWithRetry(terminal);
        const agora = new Date();
        const novoStatus = result.online ? 'online' : 'offline';

        await base44.asServiceRole.entities.Terminal.update(terminal.id, {
            status: novoStatus, latencia_ms: result.latencia_ms || null,
            ultimo_check: agora.toISOString(),
            ...(result.online ? { ultimo_ping: agora.toISOString() } : {}),
        });

        const statusAnterior = await updateStatusCache(base44, terminal.id, novoStatus, agora);
        const { statusMudou } = await handleStatusChange(base44, terminal, novoStatus, statusAnterior, agora);

        return Response.json({ success: true, terminal_id, status: novoStatus, latencia_ms: result.latencia_ms, statusMudou, tentativas: result.tentativas });

    } catch (error) {
        console.error('[monitorTerminal] erro:', error.message);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});