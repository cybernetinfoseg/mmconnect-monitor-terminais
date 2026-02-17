import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Busca a versão ativa mais recente (sem autenticação necessária)
        const releases = await base44.asServiceRole.entities.AgentRelease.filter(
            { ativo: true },
            '-created_date',
            1
        );

        if (!releases || releases.length === 0) {
            return Response.json({ error: 'Nenhuma versão disponível' }, { status: 404 });
        }

        const latest = releases[0];

        return Response.json({
            version: latest.version,
            url: latest.download_url,
            release_notes: latest.release_notes || ''
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});