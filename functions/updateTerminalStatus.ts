import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        // Validar API Key do script Python local
        const apiKey = req.headers.get('X-Monitor-API-Key');
        const expectedKey = Deno.env.get('MONITOR_API_KEY');
        
        if (!apiKey || apiKey !== expectedKey) {
            return Response.json({ error: 'Unauthorized - Invalid API Key' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const { terminalId, status, latencia, errorMsg } = await req.json();
        
        if (!terminalId || !status) {
            return Response.json({ error: 'terminalId e status são obrigatórios' }, { status: 400 });
        }

        // Buscar terminal
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminalId);
        
        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        const agora = new Date();
        const segundosSemPing = status === 'online' ? 0 : 
            (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);

        // Atualizar terminal
        await base44.asServiceRole.entities.Terminal.update(terminalId, {
            status,
            ultimo_check: agora.toISOString(),
            latencia_ms: latencia || null,
            segundos_sem_ping: segundosSemPing,
            ...(status === 'online' && { ultimo_ping: agora.toISOString() })
        });

        // Verificar mudança de status para criar alerta
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminalId });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;

        if (cache && cache.ultimo_status === 'online' && status === 'offline') {
            await base44.asServiceRole.entities.AlertIncident.create({
                terminal_id: terminalId,
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
                terminal_id: terminalId,
                terminal_nome: terminal.nome,
                local: terminal.local,
                cliente: terminal.cliente_nome,
                tipo: 'restored',
                timestamp: agora.toISOString(),
                resolvido: true,
                notificado: false
            });
        }

        // Atualizar cache
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, {
                ultimo_status: status,
                atualizado_em: agora.toISOString()
            });
        } else {
            await base44.asServiceRole.entities.StatusCache.create({
                terminal_id: terminalId,
                ultimo_status: status,
                atualizado_em: agora.toISOString()
            });
        }

        // Registrar histórico
        await base44.asServiceRole.entities.StatusHistory.create({
            terminal_id: terminalId,
            terminal_nome: terminal.nome,
            status,
            timestamp: agora.toISOString(),
            local: terminal.local,
            cliente: terminal.cliente_nome
        });

        return Response.json({
            success: true,
            terminal: terminal.nome,
            status
        });

    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});