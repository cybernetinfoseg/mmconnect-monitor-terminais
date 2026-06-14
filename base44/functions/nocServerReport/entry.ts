/**
 * nocServerReport — endpoint unificado para o NOC Server (noc_server.py)
 *                   e Timmy WebSocket Server (timmy_ws_server.py)
 * Autenticação: X-Api-Key pessoal
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const NOC_TYPES = ['heartbeat', 'adms_push', 'sdk_tcp', 'websocket_cloud'];
const OFFLINE_CONFIRM_COUNT = 2;
const DEDUP_WINDOW_MS = 30000;

// ── Helpers inline ────────────────────────────────────────────────────────────

async function validateApiKey(req, base44) {
    const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
    if (!apiKey || apiKey.length < 16) return { valid: false, error: 'API Key ausente ou inválida', status: 401 };
    const allKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
    const match = allKeys.find(k => k.key === apiKey);
    if (!match) return { valid: false, error: 'API Key inválida', status: 401 };
    return { valid: true, ownerEmail: match.user_email };
}

async function isUserAdmin(base44, ownerEmail) {
    const users = await base44.asServiceRole.entities.User.filter({ email: ownerEmail }).catch(() => []);
    return users[0]?.role === 'admin';
}

async function isInMaintenanceWindow(base44, terminalId) {
    const windows = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id: terminalId, ativo: true });
    const agora_ms = Date.now();
    return windows.some(j => {
        const ini = new Date(j.inicio).getTime();
        const fim = new Date(j.fim).getTime();
        return agora_ms >= ini && agora_ms <= fim;
    });
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

async function processMarcacoes(base44, terminalId, terminal, marcacoes, enrollMap) {
    if (!Array.isArray(marcacoes) || marcacoes.length === 0) return 0;
    const recentesRaw = await base44.asServiceRole.entities.Marcacao.filter({ terminal_id: terminalId }).catch(() => []);
    const dedupSet = new Set();
    recentesRaw.forEach(m => {
        if (m.timestamp) {
            const bucket = Math.floor(new Date(m.timestamp).getTime() / DEDUP_WINDOW_MS);
            dedupSet.add(`${m.enrollid}|${bucket}`);
        }
    });
    let saved = 0;
    for (const m of marcacoes) {
        try {
            const tsStr = m.timestamp || '';
            if (!tsStr) continue;
            const tsMs = new Date(tsStr).getTime();
            if (isNaN(tsMs)) continue;
            const enrollid = Number(m.enrollid) || 0;
            const bucket = Math.floor(tsMs / DEDUP_WINDOW_MS);
            const dedupKey = `${enrollid}|${bucket}`;
            if (dedupSet.has(dedupKey)) continue;
            dedupSet.add(dedupKey);
            let tipo = 'desconhecido';
            const inoutVal = m.inout || m.tipo;
            if (inoutVal === 'entrada' || inoutVal === 0) tipo = 'entrada';
            else if (inoutVal === 'saida' || inoutVal === 1) tipo = 'saida';
            await base44.asServiceRole.entities.Marcacao.create({
                terminal_id: terminalId, terminal_nome: terminal.nome,
                enrollid, utilizador_nome: enrollMap[enrollid] || '',
                timestamp: tsStr, tipo,
                modo: m.mode || m.modo || 'desconhecido',
                raw_mode: m.raw_mode ?? null,
                local: terminal.local || '', exportado: false,
            });
            saved++;
        } catch (e) {
            console.warn(`[processMarcacoes] Erro enrollid=${m.enrollid}: ${e.message}`);
        }
    }
    return saved;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        const base44 = createClientFromRequest(req);
        const authResult = await validateApiKey(req, base44);
        if (!authResult.valid) return Response.json({ error: authResult.error }, { status: authResult.status });

        const ownerEmail = authResult.ownerEmail;
        const { terminal_id, status, latencia_ms, segundos_sem_ping, marcacoes } = body;
        if (!terminal_id || !status) return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });

        const isAdmin = await isUserAdmin(base44, ownerEmail);
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
        if (!terminal) return Response.json({ error: `Terminal não encontrado: ${terminal_id}` }, { status: 404 });
        if (!isAdmin && !(terminal.usuario_email === ownerEmail || terminal.created_by === ownerEmail)) {
            return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
        }
        if (!NOC_TYPES.includes(terminal.tipo_conexao)) return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo NOC Server` }, { status: 400 });

        const agora = new Date().toISOString();
        const statusValido = ['online', 'offline', 'warning'].includes(status) ? status : 'offline';
        const statusEfetivo = statusValido === 'warning' ? 'online' : statusValido;

        const emManutencao = await isInMaintenanceWindow(base44, terminal_id);
        if (emManutencao && statusEfetivo === 'offline') {
            console.log(`[nocServerReport] '${terminal.nome}' em manutenção — ignorado`);
            return Response.json({ success: true, ignored: 'em_manutencao' });
        }

        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
        const offlineCount = cache?.offline_count ?? 0;
        const statusAnterior = cache?.ultimo_status ?? null;

        // ── ANTI-FALSO-OFFLINE ────────────────────────────────────────────────
        let offlineCountNovo = 0;
        let statusConfirmado = statusEfetivo;
        if (statusEfetivo === 'offline') {
            offlineCountNovo = offlineCount + 1;
            if (offlineCountNovo < OFFLINE_CONFIRM_COUNT) {
                console.log(`[nocServerReport] '${terminal.nome}' offline pendente (${offlineCountNovo}/${OFFLINE_CONFIRM_COUNT})`);
                if (cache) await base44.asServiceRole.entities.StatusCache.update(cache.id, { offline_count: offlineCountNovo, atualizado_em: agora });
                await base44.asServiceRole.entities.Terminal.update(terminal_id, { ultimo_check: agora, segundos_sem_ping: segundos_sem_ping ?? 0 });
                return Response.json({ success: true, terminal: terminal.nome, status: statusAnterior || 'online', pending_offline: true, offline_count: offlineCountNovo });
            }
            statusConfirmado = 'offline';
        } else {
            offlineCountNovo = 0;
            statusConfirmado = 'online';
        }
        // ─────────────────────────────────────────────────────────────────────

        await base44.asServiceRole.entities.Terminal.update(terminal_id, {
            status: statusConfirmado, ultimo_check: agora,
            latencia_ms: latencia_ms ?? null, segundos_sem_ping: segundos_sem_ping ?? 0,
            ...(statusConfirmado === 'online' && { ultimo_ping: agora }),
        });

        const mudouDeEstado = statusAnterior !== null && statusAnterior !== statusConfirmado;
        if (mudouDeEstado) {
            console.log(`[nocServerReport] '${terminal.nome}' mudou: ${statusAnterior} → ${statusConfirmado}`);
            await handleStatusChange(base44, terminal, statusConfirmado, statusAnterior, new Date(agora));
        }

        const cacheUpdate = { ultimo_status: statusConfirmado, atualizado_em: agora, offline_count: offlineCountNovo };
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, cacheUpdate);
        } else {
            await base44.asServiceRole.entities.StatusCache.create({ terminal_id, ...cacheUpdate });
        }

        // ── MARCAÇÕES ─────────────────────────────────────────────────────────
        let marcacoesGuardadas = 0;
        if (Array.isArray(marcacoes) && marcacoes.length > 0) {
            const terminalOwnerEmail = terminal.usuario_email || terminal.created_by || '';
            const terminalUsers = terminalOwnerEmail
                ? await base44.asServiceRole.entities.TerminalUser.filter({ owner_email: terminalOwnerEmail }).catch(() => [])
                : [];
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });
            marcacoesGuardadas = await processMarcacoes(base44, terminal_id, terminal, marcacoes, enrollMap);
            console.log(`[nocServerReport] '${terminal.nome}' → ${marcacoesGuardadas}/${marcacoes.length} marcações guardadas`);
        }

        console.log(`[nocServerReport] ${ownerEmail} → "${terminal.nome}" (${terminal.tipo_conexao}) → ${statusConfirmado}${mudouDeEstado ? ' [MUDANÇA]' : ''}${marcacoesGuardadas ? ` [${marcacoesGuardadas} marcações]` : ''}`);
        return Response.json({ success: true, terminal: terminal.nome, status: statusConfirmado, mudou: mudouDeEstado, marcacoes_guardadas: marcacoesGuardadas });

    } catch (error) {
        console.error('nocServerReport erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});