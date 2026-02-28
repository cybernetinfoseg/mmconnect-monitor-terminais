import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function checkTerminal(base44, terminal) {
    let status = 'offline';
    let latencia = null;
    let errorMsg = null;
    const startTime = Date.now();
    const agora = new Date();

    try {
        let host = '';
        const port = terminal.porta || 5005;

        switch (terminal.tipo_conexao) {
            case 'ip_local': host = terminal.ip_local; break;
            case 'ip_publico': host = terminal.ip_publico; break;
            case 'dns': host = terminal.dns; break;
            case 'p2s': host = terminal.ip_local; break;
            case 'api': host = null; break;
            default: throw new Error('Tipo de conexão não suportado');
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

    const segundosSemPing = status === 'online' ? 0 :
        (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);

    await base44.asServiceRole.entities.Terminal.update(terminal.id, {
        status,
        ultimo_check: agora.toISOString(),
        latencia_ms: latencia,
        segundos_sem_ping: segundosSemPing,
        ...(status === 'online' && { ultimo_ping: agora.toISOString() })
    });

    // Verificar mudança de status para criar alerta
    const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
    const cache = cacheResults.length > 0 ? cacheResults[0] : null;

    if (cache && cache.ultimo_status === 'online' && status === 'offline') {
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
    } else if (cache && cache.ultimo_status === 'offline' && status === 'online') {
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
            ultimo_status: status,
            atualizado_em: agora.toISOString()
        });
    } else {
        await base44.asServiceRole.entities.StatusCache.create({
            terminal_id: terminal.id,
            ultimo_status: status,
            atualizado_em: agora.toISOString()
        });
    }

    await base44.asServiceRole.entities.StatusHistory.create({
        terminal_id: terminal.id,
        terminal_nome: terminal.nome,
        status,
        timestamp: agora.toISOString(),
        local: terminal.local,
        cliente: terminal.cliente_nome
    });

    return { terminal_id: terminal.id, terminal_nome: terminal.nome, status, latencia, error: errorMsg };
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

        return Response.json({
            success: true,
            total: terminals.length,
            online: onlineCount,
            offline: offlineCount,
            results
        });

    } catch (error) {
        console.error('Erro ao monitorar terminais:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});