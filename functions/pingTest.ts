import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { host, port, count, timeout } = await req.json();
        
        if (!host || !port) {
            return Response.json({ error: 'host e port são obrigatórios' }, { status: 400 });
        }

        const pingCount = count || 4;
        const timeoutMs = timeout || 3000;
        const results = [];

        for (let i = 0; i < pingCount; i++) {
            const startTime = Date.now();
            let success = false;
            let latencia = null;

            try {
                // Tentar HTTP
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
                
                await fetch(`http://${host}:${port}`, {
                    method: 'GET',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                success = true;
                latencia = Date.now() - startTime;
                
            } catch (httpError) {
                // Tentar TCP
                try {
                    const conn = await Promise.race([
                        Deno.connect({ hostname: host, port: parseInt(port) }),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('timeout')), timeoutMs)
                        )
                    ]);
                    
                    conn.close();
                    success = true;
                    latencia = Date.now() - startTime;
                } catch (tcpError) {
                    success = false;
                }
            }

            results.push({
                attempt: i + 1,
                success,
                latencia,
                timestamp: new Date().toISOString()
            });

            // Aguardar 1 segundo entre pings
            if (i < pingCount - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const successful = results.filter(r => r.success).length;
        const latencias = results.filter(r => r.success).map(r => r.latencia);
        
        const stats = {
            sent: pingCount,
            received: successful,
            lost: pingCount - successful,
            lossPercent: ((pingCount - successful) / pingCount) * 100,
            minLatency: latencias.length > 0 ? Math.min(...latencias) : null,
            maxLatency: latencias.length > 0 ? Math.max(...latencias) : null,
            avgLatency: latencias.length > 0 ? latencias.reduce((a, b) => a + b, 0) / latencias.length : null
        };

        return Response.json({
            success: true,
            host,
            port,
            stats,
            results
        });

    } catch (error) {
        console.error('Erro ao executar ping test:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});