/**
 * nocServerGetTerminals — retorna terminais para o NOC Server Windows
 * Tipos suportados: heartbeat, adms_push, sdk_tcp, websocket_cloud
 * Autenticação: X-Api-Key pessoal (no header)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { validateApiKey, getTerminalsByOwner, isUserAdmin } from './helpers.js';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const authResult = await validateApiKey(req, base44);
        
        if (!authResult.valid) {
            return Response.json({ error: authResult.error }, { status: authResult.status });
        }

        const ownerEmail = authResult.ownerEmail;
        console.log(`nocServerGetTerminals: autenticado como ${ownerEmail}`);

        // Verificar se o utilizador é admin
        const isAdmin = await isUserAdmin(base44, ownerEmail);
        
        const supported = ['heartbeat', 'adms_push', 'sdk_tcp', 'websocket_cloud'];
        const terminals = await getTerminalsByOwner(base44, ownerEmail, supported, isAdmin);
        
        if (isAdmin) {
            console.log(`nocServerGetTerminals: ADMIN ${ownerEmail} → todos os terminais (${terminals.length})`);
        }
        console.log(`nocServerGetTerminals: ${ownerEmail} tem ${terminals.length} terminais ativos total`);

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

        // Buscar timezone do utilizador para sincronização com o servidor Timmy
        const users = await base44.asServiceRole.entities.User.filter({ email: ownerEmail }).catch(() => []);
        const ownerUser = users[0];
        const user_timezone = ownerUser?.timezone || 'Europe/Lisbon';

        console.log(`nocServerGetTerminals OK: ${ownerEmail} → ${result.length} terminais | timezone=${user_timezone}`);
        return Response.json({ success: true, terminals: result, owner: ownerEmail, user_timezone });

    } catch (error) {
        console.error('nocServerGetTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});