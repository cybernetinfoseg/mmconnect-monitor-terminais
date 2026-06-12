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
import { validateApiKey, isUserAdmin, isInMaintenanceWindow, updateStatusCache, handleStatusChange, processMarcacoes } from './helpers.js';

// Janela de deduplicação de marcações (ms) — tolerância para retries
const DEDUP_WINDOW_MS = 30000;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json();
        
        const authResult = await validateApiKey(req, base44);
        if (!authResult.valid) {
            return Response.json({ error: authResult.error }, { status: authResult.status });
        }

        const ownerEmail = authResult.ownerEmail;

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

            const isAdmin = await isUserAdmin(base44, ownerEmail);
            const terminalOwner = terminal.usuario_email || terminal.created_by;
            if (!isAdmin && terminalOwner !== ownerEmail) {
                return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });
            }

            // Buscar mapa enrollid → nome (apenas do owner para performance)
            const terminalUsers = await base44.asServiceRole.entities.TerminalUser.filter({ owner_email: ownerEmail }).catch(() => []);
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });

            // Processar marcações com helpers
            let saved = 0, skipped = 0;
            for (const rec of records) {
                try {
                    const tsMs = new Date(rec.timestamp).getTime();
                    if (isNaN(tsMs)) { skipped++; continue; }

                    const enrollid = Number(rec.enrollid) || 0;
                    const bucket = Math.floor(tsMs / DEDUP_WINDOW_MS);
                    const dedupKey = `${enrollid}|${bucket}`;

                    // Determinar tipo de marcação: se não vem, inferir por hora
                    let tipo = rec.tipo || 'desconhecido';
                    if (tipo === 'desconhecido' && rec.timestamp) {
                        try {
                            const dt = new Date(rec.timestamp);
                            const hora = dt.getHours();
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
        const emManutencao = await isInMaintenanceWindow(base44, terminal.id);

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

        // Atualizar terminal primeiro
        // Obter status anterior e lidar com mudanças
        const statusAnterior = await updateStatusCache(base44, terminal.id, reportedStatus, new Date(agora));
        const { statusMudou } = await handleStatusChange(base44, terminal, reportedStatus, statusAnterior, new Date(agora));

        console.log(`[admsReport] ${ownerEmail} → "${terminal.nome}" (SN: ${terminal.numero_serie || '?'}) → ${reportedStatus}`);
        return Response.json({ success: true, terminal_nome: terminal.nome, status: reportedStatus, mudou: mudouDeEstado });

    } catch (error) {
        console.error('[admsReport] Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});