/**
 * getMyTerminals — devolve os terminais do utilizador autenticado
 * Inclui terminais onde usuario_email == user.email OU created_by == user.email
 * Usa asServiceRole para contornar limitações do RLS com campos customizados
 * Suporta multi-tenant: super_admin vê todos, admin vê os do seu tenant
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const isSuperAdmin = user.role === 'super_admin';
        const isTenantAdmin = user.role === 'admin' || isSuperAdmin;

        // Super admins veem todos; admins veem os do seu tenant
        if (isTenantAdmin) {
            const all = await base44.asServiceRole.entities.Terminal.list('-created_date');
            // Para tenant admins, filtrar por tenant_id
            if (!isSuperAdmin && user.tenant_id) {
                const filtered = all.filter(t => t.tenant_id === user.tenant_id);
                return Response.json({ terminals: filtered, total: filtered.length });
            }
            return Response.json({ terminals: all, total: all.length });
        }

        // Utilizadores normais: terminais onde são o dono real (created_by ou usuario_email como fallback)
        const [byCreated, byOwner] = await Promise.all([
            base44.asServiceRole.entities.Terminal.filter({ created_by: user.email }, '-created_date'),
            base44.asServiceRole.entities.Terminal.filter({ usuario_email: user.email }, '-created_date'),
        ]);

        const seen = new Set();
        const terminals = [...byCreated, ...byOwner].filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
        });

        console.log(`getMyTerminals: ${user.email} → ${terminals.length} terminais`);
        return Response.json({ terminals, total: terminals.length });

    } catch (error) {
        console.error('getMyTerminals erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});