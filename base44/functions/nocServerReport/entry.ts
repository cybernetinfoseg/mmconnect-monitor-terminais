/**
 * nocServerReport — endpoint unificado para o NOC Server (noc_server.py)
 *                   e Timmy WebSocket Server (timmy_ws_server.py)
 *
 * Anti-falso-offline: só confirma transição → offline após 2 reports consecutivos offline.
 * O campo `offline_count` no StatusCache conta reports offline consecutivos.
 * Ao receber online, reset imediato.
 *
 * Tipos geridos: heartbeat, adms_push, sdk_tcp, websocket_cloud
 * Autenticação: X-Api-Key pessoal
 * Payload: { terminal_id, status, latencia_ms?, segundos_sem_ping?, marcacoes[]? }
 *
 * Versão v3 — suporte a marcacoes[] enviadas pelo timmy_ws_server.py via cmd:"sendlog":
 *   [{ enrollid, timestamp, mode, raw_mode, inout }]
 * Deduplicação: janela de ±30s por terminal+enrollid para tolerância a retries do terminal.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOC_TYPES = ['heartbeat', 'adms_push', 'sdk_tcp', 'websocket_cloud'];

// Número de reports offline consecutivos necessários para confirmar offline
const OFFLINE_CONFIRM_COUNT = 2;

// Janela de deduplicação de marcações (ms) — tolerância para retries do terminal
const DEDUP_WINDOW_MS = 30000;

Deno.serve(async (req) => {
    try {
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const body = await req.json();
        const base44 = createClientFromRequest(req);
        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey);

        if (!keyRecord) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;
        const { terminal_id, status, latencia_ms, segundos_sem_ping, marcacoes } = body;

        if (!terminal_id || !status) {
            return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });
        }

        const allUsers = await base44.asServiceRole.entities.User.filter({ email: ownerEmail });
        const isAdmin = allUsers[0]?.role === 'admin';

        const terminalResults = await base44.asServiceRole.entities.Terminal.filter({ id: terminal_id }).catch(() => []);
        const terminal = terminalResults[0] || null;

        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        if (!isAdmin) {
            const isOwner = terminal.usuario_email === ownerEmail || terminal.created_by === ownerEmail;
            if (!isOwner) {
                return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
            }
        }

        if (!NOC_TYPES.includes(terminal.tipo_conexao)) {
            return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo NOC Server` }, { status: 400 });
        }

        const agora = new Date().toISOString();
        const statusValido = ['online', 'offline', 'warning'].includes(status) ? status : 'offline';
        const statusEfetivo = statusValido === 'warning' ? 'online' : statusValido;

        // Verificar janela de manutenção
        const janelasManu = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id, ativo: true });
        const agora_ms = Date.now();
        const emManutencao = janelasManu.some(j => {
            const ini = new Date(j.inicio).getTime();
            const fim = new Date(j.fim).getTime();
            return agora_ms >= ini && agora_ms <= fim;
        });

        if (emManutencao && statusEfetivo === 'offline') {
            console.log(`[nocServerReport] '${terminal.nome}' em manutenção — ignorado`);
            return Response.json({ success: true, ignored: 'em_manutencao' });
        }

        // Verificar cache de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
        const statusAnterior = cache?.ultimo_status ?? null;
        const offlineCount = cache?.offline_count ?? 0;

        // ── ANTI-FALSO-OFFLINE ────────────────────────────────────────────────────
        let offlineCountNovo = 0;
        let statusConfirmado = statusEfetivo;

        if (statusEfetivo === 'offline') {
            offlineCountNovo = offlineCount + 1;
            if (offlineCountNovo < OFFLINE_CONFIRM_COUNT) {
                console.log(`[nocServerReport] '${terminal.nome}' offline pendente (${offlineCountNovo}/${OFFLINE_CONFIRM_COUNT}) — aguardando confirmação`);
                if (cache) {
                    await base44.asServiceRole.entities.StatusCache.update(cache.id, {
                        offline_count: offlineCountNovo,
                        atualizado_em: agora,
                    });
                }
                await base44.asServiceRole.entities.Terminal.update(terminal_id, {
                    ultimo_check: agora,
                    segundos_sem_ping: segundos_sem_ping ?? 0,
                });
                return Response.json({ success: true, terminal: terminal.nome, status: statusAnterior || 'online', pending_offline: true, offline_count: offlineCountNovo });
            }
            statusConfirmado = 'offline';
        } else {
            offlineCountNovo = 0;
            statusConfirmado = 'online';
        }
        // ─────────────────────────────────────────────────────────────────────────

        const mudouDeEstado = statusAnterior !== null && statusAnterior !== statusConfirmado;

        // Actualizar terminal com status confirmado
        await base44.asServiceRole.entities.Terminal.update(terminal_id, {
            status: statusConfirmado,
            ultimo_check: agora,
            latencia_ms: latencia_ms ?? null,
            segundos_sem_ping: segundos_sem_ping ?? 0,
            ...(statusConfirmado === 'online' && { ultimo_ping: agora }),
        });

        if (mudouDeEstado) {
            console.log(`[nocServerReport] '${terminal.nome}' mudou: ${statusAnterior} → ${statusConfirmado}`);

            await base44.asServiceRole.entities.StatusHistory.create({
                terminal_id,
                terminal_nome: terminal.nome,
                status: statusConfirmado,
                timestamp: agora,
                local: terminal.local || '',
                cliente: terminal.cliente_nome || '',
            });

            if (statusConfirmado === 'offline') {
                await Promise.all([
                    base44.asServiceRole.entities.AlertIncident.create({
                        terminal_id, terminal_nome: terminal.nome,
                        local: terminal.local || '', cliente: terminal.cliente_nome || '',
                        tipo: 'offline', timestamp: agora, resolvido: false, notificado: false,
                    }),
                    base44.asServiceRole.entities.EscalationAlert.create({
                        terminal_id, terminal_nome: terminal.nome,
                        local: terminal.local || '', cliente: terminal.cliente_nome || '',
                        owner_email: ownerEmail, offline_desde: agora,
                        escalado: false, resolvido: false, notificacao_inicial_enviada: false,
                    }).catch(() => {}),
                    base44.asServiceRole.functions.invoke('pushNotify', {
                        action: 'notify_offline', terminal_id, terminal_nome: terminal.nome,
                        local: terminal.local || '', cliente: terminal.cliente_nome || '',
                        owner_email: terminal.created_by || '',
                    }).catch(() => {}),
                ]);

            } else if (statusConfirmado === 'online') {
                const [incidentes, escalations] = await Promise.all([
                    base44.asServiceRole.entities.AlertIncident.filter({ terminal_id, resolvido: false }).catch(() => []),
                    base44.asServiceRole.entities.EscalationAlert.filter({ terminal_id, resolvido: false }).catch(() => []),
                ]);
                await Promise.all([
                    ...incidentes.map(inc => {
                        const duracao = Math.round((Date.now() - new Date(inc.timestamp).getTime()) / 60000);
                        return base44.asServiceRole.entities.AlertIncident.update(inc.id, {
                            resolvido: true, resolvido_em: agora, duracao_minutos: duracao,
                        }).catch(() => {});
                    }),
                    ...escalations.map(esc => base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {})),
                    base44.asServiceRole.entities.AlertIncident.create({
                        terminal_id, terminal_nome: terminal.nome,
                        local: terminal.local || '', cliente: terminal.cliente_nome || '',
                        tipo: 'restored', timestamp: agora, resolvido: true, notificado: false,
                    }).catch(() => {}),
                ]);
            }
        }

        // Actualizar cache com status confirmado e reset de contador
        const cacheUpdate = {
            ultimo_status: statusConfirmado,
            atualizado_em: agora,
            offline_count: offlineCountNovo,
        };
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, cacheUpdate);
        } else {
            await base44.asServiceRole.entities.StatusCache.create({ terminal_id, ...cacheUpdate });
        }

        // ── MARCAÇÕES (sendlog do Timmy WebSocket) ───────────────────────────────
        // O timmy_ws_server.py envia marcacoes[] quando recebe cmd:"sendlog"
        let marcacoesGuardadas = 0;
        if (Array.isArray(marcacoes) && marcacoes.length > 0) {
            // Buscar utilizadores do terminal para enriquecer com nome
            const terminalUsers = await base44.asServiceRole.entities.TerminalUser.filter({}).catch(() => []);
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });

            // Buscar marcações recentes do terminal (últimas 2 horas) para deduplicação eficiente
            const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const recentesRaw = await base44.asServiceRole.entities.Marcacao.filter({ terminal_id }).catch(() => []);
            // Índice de deduplicação: "enrollid|timestamp_ms_arredondado" → true
            const dedupSet = new Set();
            recentesRaw.forEach(m => {
                if (m.timestamp) {
                    const ms = new Date(m.timestamp).getTime();
                    // Arredondar para janela de 30s (DEDUP_WINDOW_MS)
                    const bucket = Math.floor(ms / DEDUP_WINDOW_MS);
                    dedupSet.add(`${m.enrollid}|${bucket}`);
                }
            });

            for (const m of marcacoes) {
                try {
                    const tsStr = m.timestamp || agora;
                    const tsMs = new Date(tsStr).getTime();
                    if (isNaN(tsMs)) continue;

                    const enrollid = Number(m.enrollid) || 0;
                    const bucket = Math.floor(tsMs / DEDUP_WINDOW_MS);
                    const dedupKey = `${enrollid}|${bucket}`;

                    if (dedupSet.has(dedupKey)) continue; // duplicado dentro da janela de 30s
                    dedupSet.add(dedupKey);

                    await base44.asServiceRole.entities.Marcacao.create({
                        terminal_id,
                        terminal_nome: terminal.nome,
                        enrollid,
                        utilizador_nome: enrollMap[enrollid] || '',
                        timestamp: tsStr,
                        modo: m.mode || 'desconhecido',
                        raw_mode: m.raw_mode ?? null,
                        tipo: m.inout || 'desconhecido',
                        local: terminal.local || '',
                        exportado: false,
                    });
                    marcacoesGuardadas++;
                } catch (e) {
                    console.warn(`[nocServerReport] Erro ao guardar marcação enrollid=${m.enrollid}: ${e.message}`);
                }
            }
            console.log(`[nocServerReport] '${terminal.nome}' → ${marcacoesGuardadas}/${marcacoes.length} marcações guardadas`);
        }
        // ─────────────────────────────────────────────────────────────────────────

        console.log(`[nocServerReport] ${ownerEmail} → "${terminal.nome}" (${terminal.tipo_conexao}) → ${statusConfirmado}${mudouDeEstado ? ' [MUDANÇA]' : ''}${marcacoesGuardadas ? ` [${marcacoesGuardadas} marcações]` : ''}`);
        return Response.json({ success: true, terminal: terminal.nome, status: statusConfirmado, mudou: mudouDeEstado, marcacoes_guardadas: marcacoesGuardadas });

    } catch (error) {
        console.error('nocServerReport erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});