import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_BASE = 'https://api.timeaccess.pt:7260/api/User';
const CLIENTE_CLOUD = 'TimeCloud';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { terminal_id } = await req.json();

        if (!terminal_id) {
            return Response.json({ error: 'terminal_id é obrigatório' }, { status: 400 });
        }

        // Buscar terminal no banco
        const terminal = await base44.entities.Terminal.get(terminal_id);
        
        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        // Chamar API para acertar hora
        const response = await fetch(
            `${API_BASE}/acertarhora?clienteCloud=${CLIENTE_CLOUD}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    terminalNome: terminal.nome,
                    terminalId: terminal.numero_serie || terminal.nome
                })
            }
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        return Response.json({
            success: true,
            terminal: terminal.nome,
            result
        });

    } catch (error) {
        return Response.json({ 
            error: error.message,
            details: error.stack 
        }, { status: 500 });
    }
});