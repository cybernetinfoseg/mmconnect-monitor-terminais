import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { terminalId } = await req.json();
        
        if (!terminalId) {
            return Response.json({ error: 'Terminal ID é obrigatório' }, { status: 400 });
        }

        // Buscar terminal
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminalId);
        
        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        let status = 'offline';
        let latencia = null;
        let errorMsg = null;
        const startTime = Date.now();

        try {
            // Determinar endpoint baseado no tipo de conexão
            let endpoint = '';
            
            switch (terminal.tipo_conexao) {
                case 'ip_local':
                    endpoint = `http://${terminal.ip_local}:${terminal.porta || 5005}`;
                    break;
                case 'ip_publico':
                    endpoint = `http://${terminal.ip_publico}:${terminal.porta || 5005}`;
                    break;
                case 'dns':
                    endpoint = `http://${terminal.dns}:${terminal.porta || 5005}`;
                    break;
                case 'p2s':
                    // Para P2S, usar IP local após conexão VPN
                    endpoint = `http://${terminal.ip_local}:${terminal.porta || 5005}`;
                    break;
                case 'api':
                    endpoint = terminal.api_endpoint;
                    break;
                default:
                    throw new Error('Tipo de conexão não suportado');
            }

            // Tentar conexão com timeout de 5 segundos
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${endpoint}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                status = 'online';
                latencia = Date.now() - startTime;
            } else {
                status = 'warning';
                errorMsg = `HTTP ${response.status}`;
            }
            
        } catch (error) {
            status = 'offline';
            errorMsg = error.message;
            
            // Se for timeout ou conexão recusada, é offline
            if (error.name === 'AbortError') {
                errorMsg = 'Timeout';
            }
        }

        // Calcular segundos sem ping
        const agora = new Date();
        const ultimoPing = terminal.ultimo_ping ? new Date(terminal.ultimo_ping) : null;
        const segundosSemPing = ultimoPing 
            ? Math.floor((agora - ultimoPing) / 1000)
            : 999999;

        // Atualizar terminal
        await base44.asServiceRole.entities.Terminal.update(terminalId, {
            status,
            ultimo_check: agora.toISOString(),
            latencia_ms: latencia,
            segundos_sem_ping: segundosSemPing,
            ...(status === 'online' && { ultimo_ping: agora.toISOString() })
        });

        // Verificar mudança de status para criar alerta
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminalId });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;

        if (cache && cache.ultimo_status === 'online' && status === 'offline') {
            // Criar incidente
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
            // Terminal voltou online - criar incidente de restauração
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
            status,
            latencia,
            error: errorMsg
        });

    } catch (error) {
        console.error('Erro ao monitorar terminal:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});