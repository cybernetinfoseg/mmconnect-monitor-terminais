import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function checkTerminal(base44, terminal) {
    let status = 'offline';
    let latencia = null;
    let errorMsg = null;
    const startTime = Date.now();
    const agora = new Date();

    try {
        const port = terminal.porta || 5005;
        let host = '';

        switch (terminal.tipo_conexao) {
            case 'ip_local':
                // ip_local NUNCA é checado pelo servidor - gerenciado pelo script Python local
                // Apenas atualiza segundos_sem_ping para manter o dashboard correto
                const segundosSemPingLocal = terminal.status === 'online' ? 
                    Math.floor((agora - new Date(terminal.ultimo_ping || agora)) / 1000) : 
                    (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);
                await base44.asServiceRole.entities.Terminal.update(terminal.id, {
                    segundos_sem_ping: terminal.status === 'online' ? segundosSemPingLocal : (terminal.segundos_sem_ping || 0),
                    ultimo_check: agora.toISOString()
                });
                return { terminal_id: terminal.id, terminal_nome: terminal.nome, status: 'skipped', reason: 'ip_local - gerenciado pelo Monitor Local' };
            case 'ip_publico': host = terminal.ip_publico; break;
            case 'dns': host = terminal.dns; break;
            case 'api': host = null; break;
            default:
                return { terminal_id: terminal.id, terminal_nome: terminal.nome, status: 'skipped', reason: 'tipo de conexão não suportado' };
        }

        if (terminal.tipo_conexao === 'api') {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            try {
                const response = await fetch(terminal.api_endpoint, { method: 'GET', signal: controller.signal });
                clearTimeout(timeoutId);
                if (response.ok) {
                    status = 'online';
                    latencia = Date.now() - startTime;
                } else {
                    errorMsg = `HTTP ${response.status}`;
                }
            } catch (fetchError) {
                clearTimeout(timeoutId);
                errorMsg = fetchError.message;
            }
        } else if (host) {
            try {
                const connectPromise = Deno.connect({ hostname: host, port });
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout após 5 segundos')), 5000)
                );
                const conn = await Promise.race([connectPromise, timeoutPromise]);
                conn.close();
                status = 'online';
                latencia = Date.now() - startTime;
            } catch (socketError) {
                errorMsg = socketError.message || 'Porta fechada ou inacessível';
            }
        }
    } catch (error) {
        errorMsg = error.message;
    }

    // Buscar cache para anti-flap (apenas terminais não-locais)
    const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
    const cache = cacheResults.length > 0 ? cacheResults[0] : null;

    // Anti-flap: só marca offline após 3 falhas consecutivas
    let falhasConsecutivas = cache?.falhas_consecutivas ?? 0;
    let statusEfetivo = status;

    if (status === 'offline') {
        falhasConsecutivas += 1;
        if (falhasConsecutivas < 3) {
            statusEfetivo = cache?.ultimo_status ?? 'offline';
        }
    } else {
        falhasConsecutivas = 0;
    }

    const segundosSemPing = statusEfetivo === 'online' ? 0 :
        (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);

    await base44.asServiceRole.entities.Terminal.update(terminal.id, {
        status: statusEfetivo,
        ultimo_check: agora.toISOString(),
        latencia_ms: latencia,
        segundos_sem_ping: segundosSemPing,
        ...(status === 'online' && { ultimo_ping: agora.toISOString() })
    });

    const statusAnterior = cache?.ultimo_status ?? null;

    if (statusAnterior === 'online' && statusEfetivo === 'offline') {
        await base44.asServiceRole.entities.AlertIncident.create({
            terminal_id: terminal.id,
            terminal_nome: terminal.nome,
            local: terminal.local,
            cliente: terminal.cliente_nome,
            tipo: 'offline',
            timestamp: agora.toISOString(),
            resolvido: false,
            notificado: false
        });
    } else if (statusAnterior === 'offline' && statusEfetivo === 'online') {
        await base44.asServiceRole.entities.AlertIncident.create({
            terminal_id: terminal.id,
            terminal_nome: terminal.nome,
            local: terminal.local,
            cliente: terminal.cliente_nome,
            tipo: 'restored',
            timestamp: agora.toISOString(),
            resolvido: true,
            notificado: false
        });
    }

    if (cache) {
        await base44.asServiceRole.entities.StatusCache.update(cache.id, {
            ultimo_status: statusEfetivo,
            atualizado_em: agora.toISOString(),
            falhas_consecutivas: falhasConsecutivas
        });
    } else {
        await base44.asServiceRole.entities.StatusCache.create({
            terminal_id: terminal.id,
            ultimo_status: statusEfetivo,
            atualizado_em: agora.toISOString(),
            falhas_consecutivas: falhasConsecutivas
        });
    }

    await base44.asServiceRole.entities.StatusHistory.create({
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        status: statusEfetivo,
        timestamp: agora.toISOString(),
        local: terminal.local,
        cliente: terminal.cliente_nome
    });

    return { terminal_id: terminal.id, terminal_nome: terminal.nome, status: statusEfetivo, latencia, error: errorMsg };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const terminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });

        const results = [];
        const chunkSize = 10;
        for (let i = 0; i < terminals.length; i += chunkSize) {
            const chunk = terminals.slice(i, i + chunkSize);
            const chunkResults = await Promise.all(
                chunk.map(terminal => checkTerminal(base44, terminal).catch(err => ({
                    terminal_id: terminal.id,
                    terminal_nome: terminal.nome,
                    success: false,
                    error: err.message
                })))
            );
            results.push(...chunkResults);
        }

        const onlineCount = results.filter(r => r.status === 'online').length;
        const offlineCount = results.filter(r => r.status === 'offline').length;
        const skippedCount = results.filter(r => r.status === 'skipped').length;

        return Response.json({
            success: true,
            total: terminals.length,
            online: onlineCount,
            offline: offlineCount,
            skipped: skippedCount,
            results
        });

    } catch (error) {
        console.error('Erro ao monitorar terminais:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});