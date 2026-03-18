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

        // Dar prioridade a data.api_key (prefixo noc_) pois é onde generateUserApiKey persiste a chave mais recente
        const dataKey = fullUser?.data?.api_key;
        const rootKey = fullUser?.api_key;
        // Preferir a chave com prefixo noc_ (gerada pelo sistema)
        const api_key = (dataKey?.startsWith('noc_') ? dataKey : null) || (rootKey?.startsWith('noc_') ? rootKey : null) || dataKey || rootKey || null;

        return Response.json({ api_key });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});