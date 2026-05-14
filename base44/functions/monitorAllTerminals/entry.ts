/**
 * monitorAllTerminals — verifica o status de todos os terminais ativos.
 *
 * Anti-falso-offline:
 *   - Passivos: timeout com margem 1.5× antes de declarar offline
 *   - Ativos (ip_publico/dns/api): 3 tentativas TCP/HTTP antes de declarar offline
 *   - WebSocket Cloud: usa servidor Timmy (/status/<sn>) com fallback pelo ultimo_ping
 *   - Throttle de histórico: só regista a cada 1h (a não ser em mudanças de estado)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Timeout base para terminais passivos (segundos sem ping → offline)
// Estes valores já têm margem. PASSIVE_TIMEOUT é o timeout REAL após o qual
// declaramos offline. Inclui margem de 1.5× sobre o ciclo normal do servidor.
const PASSIVE_TIMEOUT = {
    ip_local:         180,  // agente reporta a cada 30s → 6× margem
    heartbeat:        180,  // noc_server heartbeat TCP
    sdk_tcp:          180,  // noc_server SDK polling
    p2s:              180,  // p2s_server conexão inversa
    adms_push:        450,  // ADMS ciclo pode ser até 3min → 1.5× margem
    websocket_cloud:  360,  // timmy: heartbeat 3s, report 60s → margem de 6×
};

const PASSIVE_TYPES = new Set(['ip_local', 'heartbeat', 'adms_push', 'sdk_tcp', 'p2s']);
const ACTIVE_TYPES  = new Set(['ip_publico', 'dns', 'api']);

const HISTORY_THROTTLE_SECONDS = 3600;
const CHECK_TIMEOUT_MS = 4000;
const ACTIVE_RETRY_COUNT = 3;  // tentativas antes de declarar offline (ativos)
const ACTIVE_RETRY_DELAY_MS = 1500; // pausa entre tentativas

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const terminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });
        const agora = new Date();
        const results = [];

        const chunkSize = 10;
        for (let i = 0; i < terminals.length; i += chunkSize) {
            const chunk = terminals.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(chunk.map(async (terminal) => {
                try {
                    const tipo = terminal.tipo_conexao;
                    const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
                    const cache = cacheResults[0] || null;
                    const statusAnterior = cache?.ultimo_status || null;
                    let novoStatus;
                    let latencia_ms = null;
                    let timestampOffline = agora;

                    if (tipo === 'websocket_cloud') {
                        // ── WEBSOCKET CLOUD: consultar servidor Timmy em tempo real ──
                        const wsResult = await checkTimmyWsServer(terminal);
                        if (wsResult.serverReachable) {
                            novoStatus = wsResult.online ? 'online' : 'offline';
                        } else {
                            // Servidor inacessível — fallback: timeout conservador do último ping
                            if (terminal.ultimo_ping) {
                                const seg = Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000);
                                novoStatus = seg > PASSIVE_TIMEOUT.websocket_cloud ? 'offline' : 'online';
                            } else {
                                novoStatus = 'offline';
                            }
                        }
                        await base44.asServiceRole.entities.Terminal.update(terminal.id, {
                            status: novoStatus,
                            ultimo_check: agora.toISOString(),
                            ...(novoStatus === 'online' ? { ultimo_ping: agora.toISOString(), segundos_sem_ping: 0 } : {}),
                        });

                    } else if (PASSIVE_TYPES.has(tipo)) {
                        // ── PASSIVO: verificar timeout do último ping (com margem generosa) ──
                        const timeoutSec = PASSIVE_TIMEOUT[tipo] || 180;
                        if (terminal.ultimo_ping) {
                            const ultimoPing = new Date(terminal.ultimo_ping);
                            const segundosSemPing = Math.floor((agora - ultimoPing) / 1000);
                            novoStatus = segundosSemPing > timeoutSec ? 'offline' : 'online';
                            if (novoStatus === 'offline') {
                                timestampOffline = new Date(ultimoPing.getTime() + timeoutSec * 1000);
                            }
                            await base44.asServiceRole.entities.Terminal.update(terminal.id, {
                                status: novoStatus,
                                segundos_sem_ping: segundosSemPing,
                                ultimo_check: agora.toISOString(),
                            });
                        } else {
                            novoStatus = 'offline';
                            await base44.asServiceRole.entities.Terminal.update(terminal.id, {
                                status: 'offline',
                                ultimo_check: agora.toISOString(),
                            });
                        }

                    } else if (ACTIVE_TYPES.has(tipo)) {
                        // ── ATIVO: 3 tentativas antes de declarar offline ──────────
                        const checkResult = await checkTerminalActiveWithRetry(terminal, ACTIVE_RETRY_COUNT);
                        novoStatus = checkResult.online ? 'online' : 'offline';
                        latencia_ms = checkResult.latencia_ms || null;
                        await base44.asServiceRole.entities.Terminal.update(terminal.id, {
                            status: novoStatus,
                            latencia_ms,
                            ultimo_check: agora.toISOString(),
                            ...(checkResult.online ? { ultimo_ping: agora.toISOString() } : {}),
                        });

                    } else {
                        console.warn(`[monitorAllTerminals] tipo desconhecido: ${tipo} (terminal: ${terminal.nome})`);
                        return { terminal_id: terminal.id, terminal_nome: terminal.nome, tipo, success: true, status: terminal.status, statusMudou: false, skipped: true };
                    }

                    const statusMudou = statusAnterior !== null && statusAnterior !== novoStatus;

                    // Actualizar cache
                    const cacheUpdate = { ultimo_status: novoStatus, atualizado_em: agora.toISOString() };
                    if (cache) {
                        await base44.asServiceRole.entities.StatusCache.update(cache.id, cacheUpdate);
                    } else {
                        await base44.asServiceRole.entities.StatusCache.create({ terminal_id: terminal.id, ...cacheUpdate });
                    }

                    // Eventos de mudança → offline
                    if (statusMudou && novoStatus === 'offline') {
                        await Promise.all([
                            base44.asServiceRole.entities.AlertIncident.create({
                                terminal_id: terminal.id, terminal_nome: terminal.nome,
                                local: terminal.local || '', cliente: terminal.cliente_nome || '',
                                tipo: 'offline', timestamp: timestampOffline.toISOString(),
                                resolvido: false, notificado: false,
                            }),
                            base44.asServiceRole.entities.EscalationAlert.create({
                                terminal_id: terminal.id, terminal_nome: terminal.nome,
                                local: terminal.local || '', cliente: terminal.cliente_nome || '',
                                owner_email: terminal.created_by || '',
                                offline_desde: timestampOffline.toISOString(),
                                escalado: false, resolvido: false, notificacao_inicial_enviada: false,
                            }).catch(() => {}),
                            base44.asServiceRole.functions.invoke('pushNotify', {
                                action: 'notify_offline', terminal_id: terminal.id,
                                terminal_nome: terminal.nome, local: terminal.local || '',
                                cliente: terminal.cliente_nome || '', owner_email: terminal.created_by || '',
                            }).catch(() => {}),
                        ]);
                    }

                    // Eventos de mudança → online
                    if (statusMudou && novoStatus === 'online') {
                        const [openIncidents, openEscalations] = await Promise.all([
                            base44.asServiceRole.entities.AlertIncident.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
                            base44.asServiceRole.entities.EscalationAlert.filter({ terminal_id: terminal.id, resolvido: false }).catch(() => []),
                        ]);
                        await Promise.all([
                            ...openIncidents.map(inc => {
                                const duracao = Math.round((agora - new Date(inc.timestamp)) / 60000);
                                return base44.asServiceRole.entities.AlertIncident.update(inc.id, {
                                    resolvido: true, resolvido_em: agora.toISOString(), duracao_minutos: duracao,
                                }).catch(() => {});
                            }),
                            ...openEscalations.map(esc => base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {})),
                            base44.asServiceRole.entities.AlertIncident.create({
                                terminal_id: terminal.id, terminal_nome: terminal.nome,
                                local: terminal.local || '', cliente: terminal.cliente_nome || '',
                                tipo: 'restored', timestamp: agora.toISOString(), resolvido: true, notificado: false,
                            }).catch(() => {}),
                        ]);
                    }

                    // Throttle histórico
                    const ultimoHistorico = cache?.atualizado_em ? new Date(cache.atualizado_em) : null;
                    const segundosDesdeUltimo = ultimoHistorico
                        ? Math.floor((agora - ultimoHistorico) / 1000)
                        : HISTORY_THROTTLE_SECONDS + 1;

                    if (statusMudou || segundosDesdeUltimo >= HISTORY_THROTTLE_SECONDS) {
                        const tsHistorico = (statusMudou && novoStatus === 'offline') ? timestampOffline : agora;
                        await base44.asServiceRole.entities.StatusHistory.create({
                            terminal_id: terminal.id, terminal_nome: terminal.nome,
                            status: novoStatus, timestamp: tsHistorico.toISOString(),
                            local: terminal.local || '', cliente: terminal.cliente_nome || '',
                        }).catch(() => {});
                    }

                    return { terminal_id: terminal.id, terminal_nome: terminal.nome, tipo, success: true, status: novoStatus, statusMudou };
                } catch (error) {
                    return { terminal_id: terminal.id, terminal_nome: terminal.nome, success: false, error: error.message };
                }
            }));
            results.push(...chunkResults);
        }

        return Response.json({
            success: true,
            total: terminals.length,
            monitored: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            statusChanged: results.filter(r => r.statusMudou).length,
            results,
        });

    } catch (error) {
        console.error('Erro monitorAllTerminals:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});

/**
 * Verifica terminal activo com retry (até maxRetries tentativas).
 * Só declara offline se TODAS as tentativas falharem.
 */
async function checkTerminalActiveWithRetry(terminal, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const result = await checkTerminalActive(terminal);
        if (result.online) return result;
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, ACTIVE_RETRY_DELAY_MS));
        }
    }
    return { online: false };
}

async function checkTimmyWsServer(terminal) {
    const sn = (terminal.numero_serie || '').trim();
    if (!sn) return { serverReachable: false, online: false };
    const host = terminal.ip_publico || terminal.dns || null;
    if (!host) return { serverReachable: false, online: false };
    try {
        const port = terminal.porta || 7789;
        const ctrlPort = port + 1; // porta HTTP de controlo = WS_PORT + 1
        const resp = await fetch(`http://${host}:${ctrlPort}/status/${sn}`, { signal: AbortSignal.timeout(4000) });
        if (!resp.ok) return { serverReachable: true, online: false };
        const data = await resp.json();
        return { serverReachable: true, online: data.connected === true };
    } catch {
        return { serverReachable: false, online: false };
    }
}

async function checkTerminalActive(terminal) {
    const porta = terminal.porta || 5005;
    const inicio = Date.now();

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
}