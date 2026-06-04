/**
 * admsReport — Endpoint unificado para o adms_server.py e noc_server.py
 *
 * Dois modos de uso:
 *   1. Ping simples (adms_server.py standalone):
 *      { terminal_id?, numero_serie?, status?, ip_terminal? }
 *
 *   2. Marcações ATTLOG (noc_server.py integrado):
 *      { terminal_id, terminal_nome?, terminal_local?, records[], source? }
 *      records: [{ terminal_id, enrollid, timestamp, tipo, modo, raw_mode, local, exportado }]
 *
 * Autenticação: X-Api-Key pessoal
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Janela de deduplicação de marcações (ms) — tolerância para retries
const DEDUP_WINDOW_MS = 30000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey);
        if (!keyRecord) {
            return Response.json({ error: 'API Key não autorizada' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;
        const body = await req.json();

        // ── MODO 2: Marcações ATTLOG (records[]) ────────────────────────────────
        if (Array.isArray(body.records) && body.records.length > 0) {
            const { terminal_id, terminal_nome, terminal_local, records } = body;

            if (!terminal_id) {
                return Response.json({ error: 'terminal_id é obrigatório para gravação de marcações' }, { status: 400 });
            }

            // Verificar permissão no terminal
            const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
            if (!terminal) {
                return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
            }

            const allUsers = await base44.asServiceRole.entities.User.filter({ email: ownerEmail });
            const isAdmin = allUsers[0]?.role === 'admin';
            const terminalOwner = terminal.usuario_email || terminal.created_by;
            if (!isAdmin && terminalOwner !== ownerEmail) {
                return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });
            }

            // Buscar mapa enrollid → nome
            const terminalUsers = await base44.asServiceRole.entities.TerminalUser.filter({}).catch(() => []);
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });

            // Deduplicação: buscar marcações recentes do terminal
            const recentesRaw = await base44.asServiceRole.entities.Marcacao.filter({ terminal_id }).catch(() => []);
            const dedupSet = new Set();
            recentesRaw.forEach(m => {
                if (m.timestamp) {
                    const bucket = Math.floor(new Date(m.timestamp).getTime() / DEDUP_WINDOW_MS);
                    dedupSet.add(`${m.enrollid}|${bucket}`);
                }
            });

            let saved = 0, skipped = 0;
            for (const rec of records) {
                try {
                    const tsMs = new Date(rec.timestamp).getTime();
                    if (isNaN(tsMs)) { skipped++; continue; }

                    const enrollid = Number(rec.enrollid) || 0;
                    const bucket = Math.floor(tsMs / DEDUP_WINDOW_MS);
                    const dedupKey = `${enrollid}|${bucket}`;

                    if (dedupSet.has(dedupKey)) { skipped++; continue; }
                    dedupSet.add(dedupKey);

                    // Determinar tipo de marcação: se não vem, inferir por hora
                    let tipo = rec.tipo || 'desconhecido';
                    if (tipo === 'desconhecido' && rec.timestamp) {
                        try {
                            const dt = new Date(rec.timestamp);
                            const hora = dt.getHours();
                            // Heurística: 7-12h entrada, 16-19h saída
                            if (hora >= 7 && hora <= 12) tipo = 'entrada';
                            else if (hora >= 16 && hora <= 19) tipo = 'saida';
                        } catch (e) {}
                    }

                    await base44.asServiceRole.entities.Marcacao.create({
                        terminal_id: rec.terminal_id || terminal_id,
                        terminal_nome: rec.terminal_nome || terminal_nome || terminal.nome,
                        enrollid,
                        utilizador_nome: rec.utilizador_nome || enrollMap[enrollid] || '',
                        timestamp: rec.timestamp,
                        tipo,
                        modo: rec.modo || 'desconhecido',
                        raw_mode: rec.raw_mode != null ? Number(rec.raw_mode) : null,
                        local: rec.local || terminal_local || terminal.local || '',
                        exportado: false,
                    });
                    saved++;
                } catch (e) {
                    console.warn(`[admsReport] Erro ao guardar marcação enrollid=${rec.enrollid}: ${e.message}`);
                    skipped++;
                }
            }

            console.log(`[admsReport] ATTLOG "${terminal.nome}": ${saved} guardadas, ${skipped} ignoradas de ${records.length} recebidas`);
            return Response.json({ success: true, saved, skipped, total: records.length });
        }

        // ── MODO 1: Ping simples (status do terminal) ────────────────────────────
        const { terminal_id, numero_serie, status, ip_terminal } = body;

        // Aceita lookup por terminal_id ou por numero_serie (SN do terminal ADMS)
        let terminal = null;
        if (terminal_id) {
            terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
        } else if (numero_serie) {
            const matches = await base44.asServiceRole.entities.Terminal.filter({ numero_serie }).catch(() => []);
            terminal = matches.find(t =>
                (t.usuario_email || t.created_by) === ownerEmail
            ) || null;
        }

        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        const terminalOwner = terminal.usuario_email || terminal.created_by;
        if (terminalOwner !== ownerEmail) {
            return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });
        }

        if (terminal.tipo_conexao !== 'adms_push') {
            return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo ADMS Server` }, { status: 400 });
        }

        const agora = new Date().toISOString();
        const agora_ms = Date.now();

        // Verificar janela de manutenção
        const janelasManu = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id: terminal.id, ativo: true });
        const emManutencao = janelasManu.some(j => {
            const ini = new Date(j.inicio).getTime();
            const fim = new Date(j.fim).getTime();
            return agora_ms >= ini && agora_ms <= fim;
        });

        const reportedStatus = status || 'online';

        if (emManutencao && reportedStatus === 'offline') {
            return Response.json({ success: true, ignored: 'em_manutencao' });
        }

        // Atualizar terminal com último ping
        const updateData = {
            status: reportedStatus,
            ultimo_ping: agora,
            ultimo_check: agora,
            segundos_sem_ping: 0,
        };
        if (ip_terminal) updateData.ip_local = ip_terminal;
        await base44.asServiceRole.entities.Terminal.update(terminal.id, updateData);

        // Verificar cache de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
        const statusAnterior = cache?.ultimo_status ?? null;
        const mudouDeEstado = statusAnterior !== null && statusAnterior !== reportedStatus;

        if (mudouDeEstado) {
            await base44.asServiceRole.entities.StatusHistory.create({
                terminal_id: terminal.id,
                terminal_nome: terminal.nome,
                status: reportedStatus,
                timestamp: agora,
                local: terminal.local || '',
                cliente: terminal.cliente_nome || '',
            });

            if (reportedStatus === 'online' && statusAnterior === 'offline') {
                const incidentes = await base44.asServiceRole.entities.AlertIncident.filter({
                    terminal_id: terminal.id, resolvido: false,
                }).catch(() => []);
                for (const inc of incidentes) {
                    const duracao = Math.round((agora_ms - new Date(inc.timestamp).getTime()) / 60000);
                    await base44.asServiceRole.entities.AlertIncident.update(inc.id, {
                        resolvido: true, resolvido_em: agora, duracao_minutos: duracao,
                    }).catch(() => {});
                }
                const escalations = await base44.asServiceRole.entities.EscalationAlert.filter({
                    terminal_id: terminal.id, resolvido: false,
                }).catch(() => []);
                for (const esc of escalations) {
                    await base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {});
                }
                await base44.asServiceRole.entities.AlertIncident.create({
                    terminal_id: terminal.id, terminal_nome: terminal.nome,
                    local: terminal.local || '', cliente: terminal.cliente_nome || '',
                    tipo: 'restored', timestamp: agora, resolvido: true, notificado: false,
                }).catch(() => {});
            }
        }

        // Atualizar cache
        const cacheData = { ultimo_status: reportedStatus, atualizado_em: agora, offline_count: 0 };
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, cacheData);
        } else {
            await base44.asServiceRole.entities.StatusCache.create({
                terminal_id: terminal.id, ...cacheData,
            });
        }

        console.log(`[admsReport] ${ownerEmail} → "${terminal.nome}" (SN: ${terminal.numero_serie || '?'}) → ${reportedStatus}`);
        return Response.json({ success: true, terminal_nome: terminal.nome, status: reportedStatus, mudou: mudouDeEstado });

    } catch (error) {
        console.error('[admsReport] Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});