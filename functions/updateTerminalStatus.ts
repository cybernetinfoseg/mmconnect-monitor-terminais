import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Aceita requisições do monitor local Python via API Key
Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('X-Monitor-API-Key');
        const expectedKey = Deno.env.get('API_KEY');

        if (!apiKey || apiKey !== expectedKey) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { terminalId, status, latencia, errorMsg } = await req.json();

        if (!terminalId || !status) {
            return Response.json({ error: 'terminalId e status são obrigatórios' }, { status: 400 });
        }

        if (!['online', 'offline'].includes(status)) {
            return Response.json({ error: 'status deve ser "online" ou "offline"' }, { status: 400 });
        }

        const base44 = createClientFromRequest(req);
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminalId);

        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        const agora = new Date();

        // Buscar cache para verificar mudanças de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminalId });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
        const statusAnterior = cache?.ultimo_status ?? null;

        // Calcular segundos sem ping
        const segundosSemPing = status === 'online' ? 0 :
            (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);

        // Atualizar terminal diretamente com o status reportado pelo Python
        // (o anti-flap já está no script Python - não duplicar aqui)
        await base44.asServiceRole.entities.Terminal.update(terminalId, {
            status: status,
            ultimo_check: agora.toISOString(),
            latencia_ms: latencia ?? null,
            segundos_sem_ping: segundosSemPing,
            ...(status === 'online' && { ultimo_ping: agora.toISOString() })
        });

        // Criar incidente apenas quando há mudança real de status
        if (statusAnterior === 'online' && status === 'offline') {
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
        } else if (statusAnterior === 'offline' && status === 'online') {
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
                atualizado_em: agora.toISOString(),
                falhas_consecutivas: 0
            });
        } else {
            await base44.asServiceRole.entities.StatusCache.create({
                terminal_id: terminalId,
                ultimo_status: status,
                atualizado_em: agora.toISOString(),
                falhas_consecutivas: 0
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

        console.log(`[LocalMonitor] ${terminal.nome}: ${status.toUpperCase()}${latencia ? ` (${latencia}ms)` : ''}`);

        return Response.json({
            success: true,
            terminal: terminal.nome,
            status,
            latencia: latencia ?? null
        });

    } catch (error) {
        console.error('Erro updateTerminalStatus:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});