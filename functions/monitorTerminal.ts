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
            // Determinar host e porta baseado no tipo de conexão
            let host = '';
            let port = terminal.porta || 5005;
            
            switch (terminal.tipo_conexao) {
                case 'ip_local':
                    host = terminal.ip_local;
                    break;
                case 'ip_publico':
                    host = terminal.ip_publico;
                    break;
                case 'dns':
                    host = terminal.dns;
                    break;
                case 'p2s':
                    host = terminal.ip_local;
                    break;
                case 'api':
                    // Para API, fazer request HTTP
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    
                    const response = await fetch(terminal.api_endpoint, {
                        method: 'GET',
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (response.ok) {
                        status = 'online';
                        latencia = Date.now() - startTime;
                    } else {
                        status = 'offline';
                        errorMsg = `HTTP ${response.status}`;
                    }
                    break;
                default:
                    throw new Error('Tipo de conexão não suportado');
            }

            // Para conexões baseadas em IP/porta, tentar conexão TCP
            if (terminal.tipo_conexao !== 'api' && host) {
                try {
                    // Tentar conectar via TCP com timeout
                    const conn = await Promise.race([
                        Deno.connect({ hostname: host, port: port }),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Connection timeout')), 5000)
                        )
                    ]);
                    
                    // Se conectou, está online
                    conn.close();
                    status = 'online';
                    latencia = Date.now() - startTime;
                    
                } catch (connError) {
                    // Erro de conexão = offline
                    status = 'offline';
                    errorMsg = connError.message;
                }
            }
            
        } catch (error) {
            status = 'offline';
            errorMsg = error.message;
        }

        // Calcular segundos sem ping
        const agora = new Date();
        const segundosSemPing = status === 'online' ? 0 : 
            (terminal.ultimo_ping ? Math.floor((agora - new Date(terminal.ultimo_ping)) / 1000) : 999999);

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
            // Terminal voltou online
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
            error: errorMsg,
            host: terminal.tipo_conexao !== 'api' ? `${host}:${terminal.porta}` : terminal.api_endpoint
        });

    } catch (error) {
        console.error('Erro ao monitorar terminal:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});