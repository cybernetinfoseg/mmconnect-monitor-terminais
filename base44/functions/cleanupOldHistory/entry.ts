import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * cleanupOldHistory — apaga registos antigos de StatusHistory, AlertIncidents e OperationLogs.
 * Chamado pelo scheduler — corre várias vezes por dia para ir limpando gradualmente.
 * 
 * Rate limit: apaga no máximo 50 registos por execução com pausa de 300ms entre cada.
 * StatusHistory: retenção de 7 dias
 * AlertIncidents resolvidos: retenção de 60 dias
 * OperationLogs: retenção de 90 dias
 */

async function deleteSequential(entityApi, items, maxItems = 50) {
    const toDelete = items.slice(0, maxItems);
    let deleted = 0;
    for (const r of toDelete) {
        const ok = await entityApi.delete(r.id).then(() => true).catch(() => false);
        if (ok) deleted++;
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    return deleted;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Função interna — sem verificação de auth (acesso controlado pelo mainScheduler)

        const cutoff7  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
        const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
        const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        // Buscar registos mais antigos primeiro (ordenação ascendente por timestamp)
        const [allHistory, allIncidents, allOpLogs] = await Promise.all([
            base44.asServiceRole.entities.StatusHistory.list('timestamp', 100).catch(() => []),
            base44.asServiceRole.entities.AlertIncident.list('timestamp', 50).catch(() => []),
            base44.asServiceRole.entities.OperationLog.list('timestamp', 50).catch(() => []),
        ]);

        // StatusHistory: manter apenas 7 dias
        const historyToDelete = allHistory.filter(r => r.timestamp && r.timestamp < cutoff7);
        const deletedHistory = await deleteSequential(base44.asServiceRole.entities.StatusHistory, historyToDelete, 50);

        // AlertIncidents resolvidos há mais de 60 dias
        const incidentsToDelete = allIncidents.filter(i => i.resolvido && i.timestamp && i.timestamp < cutoff60);
        const deletedIncidents = await deleteSequential(base44.asServiceRole.entities.AlertIncident, incidentsToDelete, 20);

        // OperationLogs com mais de 90 dias
        const opLogsToDelete = allOpLogs.filter(l => l.timestamp && l.timestamp < cutoff90);
        const deletedOpLogs = await deleteSequential(base44.asServiceRole.entities.OperationLog, opLogsToDelete, 20);

        console.log(`Cleanup: history=${deletedHistory} incidents=${deletedIncidents} oplogs=${deletedOpLogs}`);

        return Response.json({
            success: true,
            deleted_history: deletedHistory,
            deleted_incidents: deletedIncidents,
            deleted_operation_logs: deletedOpLogs,
            remaining_history: historyToDelete.length - deletedHistory,
        });

    } catch (error) {
        console.error('cleanupOldHistory erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});