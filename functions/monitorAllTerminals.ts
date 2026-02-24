import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        // Apenas admin pode executar monitoramento em massa
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Buscar todos os terminais ativos
        const terminals = await base44.asServiceRole.entities.Terminal.filter({ ativo: true });

        const results = [];

        // Monitorar cada terminal
        for (const terminal of terminals) {
            try {
                // Chamar função de monitoramento individual
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