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
import { validateApiKey, isUserAdmin, isInMaintenanceWindow, updateStatusCache, handleStatusChange, processMarcacoes } from './helpers.js';

const NOC_TYPES = ['heartbeat', 'adms_push', 'sdk_tcp', 'websocket_cloud'];

// Número de reports offline consecutivos necessários para confirmar offline
const OFFLINE_CONFIRM_COUNT = 2;

// Janela de deduplicação de marcações (ms) — tolerância para retries do terminal
const DEDUP_WINDOW_MS = 30000;

Deno.serve(async (req) => {
    try {
        const body = await req.json();
        const base44 = createClientFromRequest(req);
        const authResult = await validateApiKey(req, base44);

        if (!authResult.valid) {
            return Response.json({ error: authResult.error }, { status: authResult.status });
        }

        const ownerEmail = authResult.ownerEmail;
        const { terminal_id, status, latencia_ms, segundos_sem_ping, marcacoes } = body;

        if (!terminal_id || !status) {
            return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });
        }

        const isAdmin = await isUserAdmin(base44, ownerEmail);
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);

        if (!terminal) {
            return Response.json({ error: `Terminal não encontrado: ${terminal_id}` }, { status: 404 });
        }

        if (!isAdmin && !(terminal.usuario_email === ownerEmail || terminal.created_by === ownerEmail)) {
            return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
        }

        if (!NOC_TYPES.includes(terminal.tipo_conexao)) {
            return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo NOC Server` }, { status: 400 });
        }

        const agora = new Date().toISOString();
        const statusValido = ['online', 'offline', 'warning'].includes(status) ? status : 'offline';
        const statusEfetivo = statusValido === 'warning' ? 'online' : statusValido;

        // Verificar janela de manutenção
        const emManutencao = await isInMaintenanceWindow(base44, terminal_id);

        if (emManutencao && statusEfetivo === 'offline') {
            console.log(`[nocServerReport] '${terminal.nome}' em manutenção — ignorado`);
            return Response.json({ success: true, ignored: 'em_manutencao' });
        }

        // Verificar cache de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
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

        // Actualizar terminal com status confirmado
        await base44.asServiceRole.entities.Terminal.update(terminal_id, {
            status: statusConfirmado,
            ultimo_check: agora,
            latencia_ms: latencia_ms ?? null,
            segundos_sem_ping: segundos_sem_ping ?? 0,
            ...(statusConfirmado === 'online' && { ultimo_ping: agora }),
        });

        // Obter status anterior e lidar com mudanças
        const statusAnterior = cache?.ultimo_status ?? null;
        const mudouDeEstado = statusAnterior !== null && statusAnterior !== statusConfirmado;
        
        if (mudouDeEstado) {
            console.log(`[nocServerReport] '${terminal.nome}' mudou: ${statusAnterior} → ${statusConfirmado}`);
            const agoraObj = new Date(agora);
            await handleStatusChange(base44, terminal, statusConfirmado, statusAnterior, agoraObj);
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
            // Buscar utilizadores do terminal para enriquecer marcações com nome
            const terminalOwnerEmail = terminal.usuario_email || terminal.created_by || '';
            const terminalUsers = terminalOwnerEmail
                ? await base44.asServiceRole.entities.TerminalUser.filter({ owner_email: terminalOwnerEmail }).catch(() => [])
                : [];
            const enrollMap = {};
            terminalUsers.forEach(u => { enrollMap[u.enrollid] = u.nome; });

            marcacoesGuardadas = await processMarcacoes(base44, terminal_id, terminal, marcacoes, enrollMap, DEDUP_WINDOW_MS);
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