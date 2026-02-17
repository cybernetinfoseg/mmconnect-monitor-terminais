import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        // Validar API Key
        const apiKey = req.headers.get('X-Monitor-API-Key');
        const expectedKey = Deno.env.get('MONITOR_API_KEY');
        
        if (!apiKey || apiKey !== expectedKey) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);

        // Buscar todos os terminais ativos com IP local ou P2S
        const terminais = await base44.asServiceRole.entities.Terminal.filter({ 
            ativo: true
        });

        // Filtrar apenas terminais com ip_local preenchido
        const terminaisLocais = terminais.filter(t => 
            (t.tipo_conexao === 'ip_local' || t.tipo_conexao === 'p2s') && 
            t.ip_local
        );

        return Response.json({
            success: true,
            count: terminaisLocais.length,
            terminals: terminaisLocais.map(t => ({
                id: t.id,
                nome: t.nome,
                local: t.local,
                ip_local: t.ip_local,
                porta: t.porta || 5005,
                tipo_conexao: t.tipo_conexao
            }))
        });

    } catch (error) {
        console.error('Erro ao buscar terminais:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});