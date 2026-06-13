/**
 * nocServerGetTerminals — retorna terminais para o NOC Server Windows
 * Tipos suportados: heartbeat, adms_push, sdk_tcp, websocket_cloud
 * Autenticação: X-Api-Key pessoal (no header)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

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
        console.log(`nocServerGetTerminals: autenticado como ${ownerEmail}`);

        // ── Verificar se admin ───────────────────────────────────────────────
        const users = await base44.asServiceRole.entities.User.filter({ email: ownerEmail }).catch(() => []);
        const ownerUser = users[0];
        const isAdmin = ownerUser?.role === 'admin';

        // ── Carregar terminais ───────────────────────────────────────────────
        const supported = ['heartbeat', 'adms_push', 'sdk_tcp', 'websocket_cloud'];
        let allTerminals = [];
        if (isAdmin) {
            allTerminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });
        } else {
            const [byUsuario, byCreated] = await Promise.all([
                base44.asServiceRole.entities.Terminal.filter({ ativo: true, usuario_email: ownerEmail }),
                base44.asServiceRole.entities.Terminal.filter({ ativo: true, created_by: ownerEmail }),
            ]);
            const seen = new Set();
            allTerminals = [...byUsuario, ...byCreated].filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        }
        const terminals = allTerminals.filter(t => supported.includes(t.tipo_conexao));

        console.log(`nocServerGetTerminals: ${ownerEmail} → ${terminals.length} terminais`);

        const result = terminals.map(t => ({
            id: t.id,
            nome: t.nome,
            local: t.local || '',
            tipo_conexao: t.tipo_conexao,
            ip_publico: t.ip_publico || '',
            ip_local: t.ip_local || '',
            dns: t.dns || '',
            porta: t.porta || 5005,
            numero_serie: t.numero_serie || '',
            fabricante: t.fabricante || 'zkteco',
            modelo: t.modelo || '',
            cliente_nome: t.cliente_nome || '',
            ativo: t.ativo,
        }));

        const user_timezone = ownerUser?.timezone || 'Europe/Lisbon';

        console.log(`nocServerGetTerminals OK: ${ownerEmail} → ${result.length} terminais | timezone=${user_timezone}`);
        return Response.json({ success: true, terminals: result, owner: ownerEmail, user_timezone });

    } catch (error) {
        console.error('nocServerGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});