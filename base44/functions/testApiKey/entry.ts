/**
 * testApiKey — valida uma API Key e devolve quantos terminais lhe estão associados
 * Chamado pela página de Configurações para testar a chave do agente local.
 * Requer sessão autenticada (utilizador logado) + api_key no payload.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Verificar sessão do utilizador
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autenticado' }, { status: 401 });
        }

        const body = await req.json();
        const api_key = (body?.api_key || '').trim();

        if (!api_key || api_key.length < 16) {
            return Response.json({ success: false, error: 'API Key ausente ou inválida' });
        }

        // Verificar se a chave existe e pertence ao utilizador
        const allKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true, user_email: user.email });
        const keyRecord = allKeys.find(k => k.key === api_key);

        if (!keyRecord) {
            return Response.json({ success: false, error: 'API Key não reconhecida ou inativa' });
        }

        // Contar terminais do utilizador
        const terminais = await base44.asServiceRole.entities.Terminal.filter({
            ativo: true,
            created_by: user.email,
        });

        return Response.json({
            success: true,
            terminals: terminais.length,
            user_email: user.email,
        });

    } catch (error) {
        console.error('testApiKey erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});