/**
 * agentGetTerminals — devolve os terminais ao Agente Local
 *
 * Headers obrigatórios:
 *   X-Api-Key: <api_key pessoal do utilizador, gerada em Configurações>
 *   X-App-Id:  <app_id global>
 *
 * Retorna apenas os terminais do utilizador dono da API Key.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('X-Api-Key');
        if (!apiKey) {
            return Response.json({ error: 'API Key ausente' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);

        // Encontrar utilizador dono da API Key (comparação exacta, case-sensitive)
        if (apiKey.length < 10) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }
        const users = await base44.asServiceRole.entities.User.list();
        const owner = users.find(u => u.api_key && u.api_key === apiKey);

        if (!owner) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        // Filtrar terminais pelo dono (admin vê todos os seus, user vê só os seus)
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
        }));

        return Response.json({ success: true, terminals: result, owner: owner.email });

    } catch (error) {
        console.error('agentGetTerminals erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});