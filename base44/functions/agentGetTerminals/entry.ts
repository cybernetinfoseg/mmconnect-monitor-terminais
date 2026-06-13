/**
 * agentGetTerminals — devolve os terminais ao Agente Local
 * Tipos geridos pelo agente: ip_local, ip_publico, dns, api
 * Autenticação: X-Api-Key pessoal
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const AGENT_TYPES = ['ip_local', 'ip_publico', 'dns', 'api'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // ── Validar API Key ──────────────────────────────────────────────────
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }
        const allKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const match = allKeys.find(k => k.key === apiKey);
        if (!match) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }
        const ownerEmail = match.user_email;

        // ── Carregar terminais ───────────────────────────────────────────────
        const [byUsuario, byCreated] = await Promise.all([
            base44.asServiceRole.entities.Terminal.filter({ ativo: true, usuario_email: ownerEmail }),
            base44.asServiceRole.entities.Terminal.filter({ ativo: true, created_by: ownerEmail }),
        ]);
        const seen = new Set();
        const allTerminals = [...byUsuario, ...byCreated].filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
        });
        const terminals = allTerminals.filter(t => AGENT_TYPES.includes(t.tipo_conexao));

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

        console.log(`agentGetTerminals OK: ${ownerEmail} → ${result.length} terminais`);
        return Response.json({ success: true, terminals: result, owner: ownerEmail });

    } catch (error) {
        console.error('agentGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});