/**
 * admsReport — Endpoint unificado para o adms_server.py e noc_server.py
 * Autenticação: X-Api-Key pessoal
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
        const body = await req.json();

        const authResult = await validateApiKey(req, base44);
        if (!authResult.valid) return Response.json({ error: authResult.error }, { status: authResult.status });
        const ownerEmail = authResult.ownerEmail;

        // ── MODO 2: Marcações ATTLOG ──────────────────────────────────────────
        if (Array.isArray(body.records) && body.records.length > 0) {
            const { terminal_id, terminal_nome, terminal_local, records } = body;
            if (!terminal_id) return Response.json({ error: 'terminal_id é obrigatório para gravação de marcações' }, { status: 400 });

            const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
            if (!terminal) return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });

            const isAdmin = await isUserAdmin(base44, ownerEmail);
            const terminalOwner = terminal.usuario_email || terminal.created_by;
            if (!isAdmin && terminalOwner !== ownerEmail) return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });

            const terminalUsers = await base44.asServiceRole.entities.TerminalUser.filter({ owner_email: ownerEmail }).catch(() => []);
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });

            let saved = 0, skipped = 0;
            for (const rec of records) {
                try {
                    const tsMs = new Date(rec.timestamp).getTime();
                    if (isNaN(tsMs)) { skipped++; continue; }
                    const enrollid = Number(rec.enrollid) || 0;
                    let tipo = rec.tipo || 'desconhecido';
                    if (tipo === 'desconhecido' && rec.timestamp) {
                        try {
                            const hora = new Date(rec.timestamp).getHours();
                            if (hora >= 7 && hora <= 12) tipo = 'entrada';
                            else if (hora >= 16 && hora <= 19) tipo = 'saida';
                        } catch (e) {}
                    }
                    await base44.asServiceRole.entities.Marcacao.create({
                        terminal_id: rec.terminal_id || terminal_id,
                        terminal_nome: rec.terminal_nome || terminal_nome || terminal.nome,
                        enrollid, utilizador_nome: rec.utilizador_nome || enrollMap[enrollid] || '',
                        timestamp: rec.timestamp, tipo,
                        modo: rec.modo || 'desconhecido',
                        raw_mode: rec.raw_mode != null ? Number(rec.raw_mode) : null,
                        local: rec.local || terminal_local || terminal.local || '',
                        exportado: false,
                    });
                    saved++;
                } catch (e) {
                    console.warn(`[admsReport] Erro enrollid=${rec.enrollid}: ${e.message}`);
                    skipped++;
                }
            }
            console.log(`[admsReport] ATTLOG "${terminal.nome}": ${saved} guardadas, ${skipped} ignoradas de ${records.length}`);
            return Response.json({ success: true, saved, skipped, total: records.length });
        }

        // ── MODO 1: Ping simples ──────────────────────────────────────────────
        const { terminal_id, numero_serie, status, ip_terminal } = body;
        let terminal = null;
        if (terminal_id) {
            terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
        } else if (numero_serie) {
            const matches = await base44.asServiceRole.entities.Terminal.filter({ numero_serie }).catch(() => []);
            terminal = matches.find(t => (t.usuario_email || t.created_by) === ownerEmail) || null;
        }
        if (!terminal) return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });

        const terminalOwner = terminal.usuario_email || terminal.created_by;
        if (terminalOwner !== ownerEmail) return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });
        if (terminal.tipo_conexao !== 'adms_push') return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo ADMS Server` }, { status: 400 });

        const agora = new Date();
        const emManutencao = await isInMaintenanceWindow(base44, terminal.id);
        const reportedStatus = status || 'online';
        if (emManutencao && reportedStatus === 'offline') return Response.json({ success: true, ignored: 'em_manutencao' });

        const updateData = { status: reportedStatus, ultimo_ping: agora.toISOString(), ultimo_check: agora.toISOString(), segundos_sem_ping: 0 };
        if (ip_terminal) updateData.ip_local = ip_terminal;
        await base44.asServiceRole.entities.Terminal.update(terminal.id, updateData);

        const statusAnterior = await updateStatusCache(base44, terminal.id, reportedStatus, agora);
        const { statusMudou } = await handleStatusChange(base44, terminal, reportedStatus, statusAnterior, agora);

        console.log(`[admsReport] ${ownerEmail} → "${terminal.nome}" → ${reportedStatus}`);
        return Response.json({ success: true, terminal_nome: terminal.nome, status: reportedStatus, mudou: statusMudou });

    } catch (error) {
        console.error('[admsReport] Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});