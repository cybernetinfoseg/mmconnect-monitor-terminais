import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Retorna terminais ip_local para o monitor Python
Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('X-Monitor-API-Key');
        const expectedKey = Deno.env.get('API_KEY');

        if (!apiKey || apiKey !== expectedKey) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const terminals = await base44.asServiceRole.entities.Terminal.filter({
            tipo_conexao: 'ip_local',
            ativo: true
        });

        return Response.json({
            success: true,
            terminals: terminals.map(t => ({
                id: t.id,
                nome: t.nome,
                ip_local: t.ip_local,
                porta: t.porta || 5005,
                timeout_segundos: t.timeout_segundos || 5,
                monitoramento_ativo: t.monitoramento_ativo !== false
            }))
        });

    } catch (error) {
        console.error('Erro getLocalTerminals:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});