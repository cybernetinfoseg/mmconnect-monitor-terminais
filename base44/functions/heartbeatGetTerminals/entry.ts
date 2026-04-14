/**
 * heartbeatGetTerminals — retorna terminais do tipo "heartbeat" ao Heartbeat Server
 * 
 * Autenticação: X-Api-Key pessoal (mesma chave do agente local)
 * Retorna apenas terminais do utilizador dono da chave, tipo "heartbeat"
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();

        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const allKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const match = allKeys.find(k => k.key === apiKey);

        if (!match) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const ownerEmail = match.user_email;

        // Buscar terminais do tipo heartbeat do utilizador
        const terminals = await base44.asServiceRole.entities.Terminal.filter({
            ativo: true,
            tipo_conexao: 'heartbeat',
            created_by: ownerEmail,
        });

        const result = terminals.map(t => ({
            id: t.id,
            nome: t.nome,
            local: t.local,
            tipo_conexao: t.tipo_conexao,
            ip_publico: t.ip_publico,
            porta: t.porta || 5005,
            ativo: t.ativo,
        }));

        console.log(`heartbeatGetTerminals OK: ${ownerEmail} → ${result.length} terminais`);
        return Response.json({ success: true, terminals: result, owner: ownerEmail });

    } catch (error) {
        console.error('heartbeatGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});