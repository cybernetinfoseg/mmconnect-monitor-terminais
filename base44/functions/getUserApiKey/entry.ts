import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Retorna a api_key do utilizador autenticado
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fazer fetch completo do utilizador via service role para garantir todos os campos
        const fullUser = await base44.asServiceRole.entities.User.get(user.id);

        // api_key pode estar no campo raiz ou em data.api_key
        const api_key = fullUser?.api_key || fullUser?.data?.api_key || user?.api_key || null;

        return Response.json({ api_key });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});