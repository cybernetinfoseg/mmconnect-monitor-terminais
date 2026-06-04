/**
 * assignTerminal — transfere a propriedade de um terminal para um utilizador
 * Actualiza created_by e usuario_email para o email do utilizador destino
 * Só admins podem chamar esta função
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: apenas admins podem associar terminais' }, { status: 403 });
        }

        const { terminalId, targetEmail } = await req.json();

        if (!terminalId || !targetEmail) {
            return Response.json({ error: 'terminalId e targetEmail são obrigatórios' }, { status: 400 });
        }

        // Actualiza created_by e usuario_email para o utilizador destino
        await base44.asServiceRole.entities.Terminal.update(terminalId, {
            usuario_email: targetEmail,
            created_by: targetEmail,
        });

        console.log(`assignTerminal: terminal ${terminalId} transferido para ${targetEmail} por ${user.email}`);

        return Response.json({ success: true, terminalId, targetEmail });

    } catch (error) {
        console.error('assignTerminal erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});