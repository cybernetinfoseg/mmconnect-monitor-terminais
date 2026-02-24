import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // This function runs as a scheduled automation (no user session).
        // Use service role for all operations.
        const terminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });

        const results = [];

        for (const terminal of terminals) {
            try {
                const monitorResult = await base44.asServiceRole.functions.invoke('monitorTerminal', {
                    terminalId: terminal.id
                });

                results.push({
                    terminal_id: terminal.id,
                    terminal_nome: terminal.nome,
                    success: true,
                    status: monitorResult.data?.status
                });
            } catch (error) {
                results.push({
                    terminal_id: terminal.id,
                    terminal_nome: terminal.nome,
                    success: false,
                    error: error.message
                });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        return Response.json({
            success: true,
            total: terminals.length,
            monitored: successCount,
            failed: failCount,
            results
        });

    } catch (error) {
        console.error('Erro ao monitorar terminais:', error);
        return Response.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
});