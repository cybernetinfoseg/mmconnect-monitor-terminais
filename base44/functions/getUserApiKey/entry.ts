import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Retorna a api_key do utilizador autenticado
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Buscar utilizador completo via service role
        const fullUser = await base44.asServiceRole.entities.User.get(user.id);

        // A chave mais recente gerada pelo sistema tem prefixo noc_
        // Pode estar em data.api_key ou no campo raiz api_key
        const dataKey = fullUser?.data?.api_key;
        const rootKey = fullUser?.api_key;

        // Preferir chave com prefixo noc_ (gerada pelo sistema)
        let api_key = null;
        if (dataKey && dataKey.startsWith('noc_')) {
            api_key = dataKey;
        } else if (rootKey && rootKey.startsWith('noc_')) {
            api_key = rootKey;
        } else {
            api_key = dataKey || rootKey || null;
        }

        return Response.json({ api_key });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});