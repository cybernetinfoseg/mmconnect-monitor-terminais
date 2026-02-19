import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { terminalId, terminalNome, interval, unit } = await req.json();

        if (!terminalId || !interval || !unit) {
            return Response.json({ error: 'Parâmetros inválidos' }, { status: 400 });
        }

        // Verify terminal exists
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminalId);
        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        // Create the automation via service role
        const result = await base44.asServiceRole.automations.create({
            automation_type: 'scheduled',
            name: `Verificação: ${terminalNome || terminal.nome}`,
            function_name: 'monitorTerminal',
            function_args: { terminalId },
            repeat_interval: interval,
            repeat_unit: unit,
            is_active: true,
        });

        // Log the scheduled check creation in history
        await base44.asServiceRole.entities.StatusHistory.create({
            terminal_id: terminalId,
            terminal_nome: terminal.nome,
            status: terminal.status || 'offline',
            timestamp: new Date().toISOString(),
            local: terminal.local,
            cliente: terminal.cliente_nome,
        });

        return Response.json({
            success: true,
            automation_id: result?.id,
            message: `Verificação agendada a cada ${interval} ${unit} para ${terminal.nome}`,
        });

    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        return Response.json({ success: false, error: error.message }, { status: 500 });
    }
});