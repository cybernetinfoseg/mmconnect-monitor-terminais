import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupOldHistory — apaga registos de StatusHistory com mais de 30 dias.
 * Chamado pelo scheduler 1x por dia para manter a base de dados saudável.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Permite chamadas do scheduler (sem user) OU de admins autenticados
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) {
            const user = await base44.auth.me();
            if (user?.role !== 'admin') {
                return Response.json({ error: 'Forbidden: apenas admins' }, { status: 403 });
            }
        }
        // Se não autenticado, assume chamada do scheduler — prossegue

        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Buscar registos antigos em batches maiores (500 por batch)
        let deleted = 0;
        let batchHistory = await base44.asServiceRole.entities.StatusHistory.list('-timestamp', 500);
        let toDeleteHistory = batchHistory.filter(r => r.timestamp < cutoff);
        // Apagar em paralelo (grupos de 20)
        for (let i = 0; i < toDeleteHistory.length; i += 20) {
            const chunk = toDeleteHistory.slice(i, i + 20);
            await Promise.all(chunk.map(r => base44.asServiceRole.entities.StatusHistory.delete(r.id).catch(() => {})));
            deleted += chunk.length;
        }

        // Limpar também AlertIncidents resolvidos há mais de 60 dias
        const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const oldIncidents = await base44.asServiceRole.entities.AlertIncident.list('-timestamp', 500);
        const incidentsToDelete = oldIncidents.filter(i => i.resolvido && i.timestamp < cutoff60);

        let deletedIncidents = 0;
        for (let i = 0; i < incidentsToDelete.length; i += 20) {
            const chunk = incidentsToDelete.slice(i, i + 20);
            await Promise.all(chunk.map(inc => base44.asServiceRole.entities.AlertIncident.delete(inc.id).catch(() => {})));
            deletedIncidents += chunk.length;
        }

        // Limpar OperationLogs com mais de 90 dias
        const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const oldOpLogs = await base44.asServiceRole.entities.OperationLog.list('-timestamp', 500).catch(() => []);
        const opLogsToDelete = oldOpLogs.filter(l => l.timestamp < cutoff90);
        let deletedOpLogs = 0;
        for (let i = 0; i < opLogsToDelete.length; i += 20) {
            const chunk = opLogsToDelete.slice(i, i + 20);
            await Promise.all(chunk.map(l => base44.asServiceRole.entities.OperationLog.delete(l.id).catch(() => {})));
            deletedOpLogs += chunk.length;
        }

        return Response.json({
            success: true,
            deleted_history: deleted,
            deleted_incidents: deletedIncidents,
            deleted_operation_logs: deletedOpLogs,
            cutoff_history: cutoff,
            cutoff_incidents: cutoff60,
            cutoff_operation_logs: cutoff90,
        });

    } catch (error) {
        console.error('cleanupOldHistory erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});