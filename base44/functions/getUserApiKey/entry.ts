import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Retorna a api_key do utilizador autenticado
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Tentar obter via entidade completa para garantir acesso a todos os campos
        let api_key = user?.api_key || user?.data?.api_key || null;

        if (!api_key) {
            try {
                const fullUser = await base44.asServiceRole.entities.User.get(user.id);
                api_key = fullUser?.api_key || fullUser?.data?.api_key || null;
            } catch {}
        }

        return Response.json({ api_key });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});