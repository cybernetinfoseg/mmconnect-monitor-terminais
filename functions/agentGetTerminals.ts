/**
 * agentGetTerminals — devolve os terminais ao Agente Local
 *
 * Headers obrigatórios:
 *   X-Api-Key: <valor do segredo API_KEY configurado no painel>
 *   X-App-Id:  <app_id>
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const APP_ID = Deno.env.get('BASE44_APP_ID');
const API_KEY = Deno.env.get('API_KEY');

Deno.serve(async (req) => {
    try {
        const appIdHeader = req.headers.get('X-App-Id');
        if (!appIdHeader || appIdHeader !== APP_ID) {
            return Response.json({ error: 'APP ID inválido ou ausente' }, { status: 403 });
        }

        const apiKey = req.headers.get('X-Api-Key');
        if (!apiKey || !API_KEY || apiKey !== API_KEY) {
            return Response.json({ error: 'API Key inválida ou ausente' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const terminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });

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

        return Response.json({ success: true, terminals: result });

    } catch (error) {
        console.error('agentGetTerminals erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});