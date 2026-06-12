/**
 * agentGetTerminals — devolve os terminais ao Agente Local
 *
 * Tipos geridos pelo agente: ip_local, ip_publico, dns, api
 * SEGURANÇA: autenticação EXCLUSIVAMENTE por X-Api-Key pessoal.
 * Cada utilizador vê apenas os terminais que criou (created_by).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { validateApiKey, getTerminalsByOwner } from './helpers.js';

const AGENT_TYPES = ['ip_local', 'ip_publico', 'dns', 'api'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const authResult = await validateApiKey(req, base44);
        
        if (!authResult.valid) {
            return Response.json({ error: authResult.error }, { status: authResult.status });
        }

        const ownerEmail = authResult.ownerEmail;
        const terminals = await getTerminalsByOwner(base44, ownerEmail, AGENT_TYPES, false);

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

        console.log(`agentGetTerminals OK: ${ownerEmail} → ${result.length} terminais (${result.map(t=>t.tipo_conexao).join(', ')})`);
        return Response.json({ success: true, terminals: result, owner: ownerEmail });

    } catch (error) {
        console.error('agentGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});