/**
 * agentGetTerminals — devolve os terminais ao Agente Local
 * Autenticação: X-Api-Key no header (POST ou GET)
 * Retorna apenas os terminais do utilizador dono da API Key.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        // Aceitar GET e POST
        let apiKey = req.headers.get('X-Api-Key') || req.headers.get('x-api-key');

        // Fallback: ler do body se POST
        if (!apiKey && req.method === 'POST') {
            try {
                const body = await req.json();
                apiKey = body?.api_key || null;
            } catch (_) {}
        }

        // Fallback: ler da query string
        if (!apiKey) {
            const url = new URL(req.url);
            apiKey = url.searchParams.get('api_key');
        }

        if (!apiKey || apiKey.length < 10) {
            console.error('agentGetTerminals: API Key ausente');
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);

        const allUsers = await base44.asServiceRole.entities.User.list();
        const owner = allUsers.find(u => u.api_key === apiKey) || null;

        if (!owner) {
            console.error('agentGetTerminals: API Key não encontrada em nenhum utilizador');
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const terminals = await base44.asServiceRole.entities.Terminal.filter({
            ativo: true,
            created_by: owner.email,
        });

        const result = terminals.map(t => ({
            id: t.id,
            nome: t.nome,
            local: t.local,
            tipo_conexao: t.tipo_conexao,
            ip_local: t.ip_local,
            ip_publico: t.ip_publico,
            dns: t.dns,
            porta: t.porta || 5005,
            api_endpoint: t.api_endpoint,
            ativo: t.ativo,
        }));

        console.log(`agentGetTerminals: ${owner.email} → ${result.length} terminais`);
        return Response.json({ success: true, terminals: result, owner: owner.email });

    } catch (error) {
        console.error('agentGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});