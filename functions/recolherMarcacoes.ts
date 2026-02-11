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

        const { terminal_id, data_inicio, data_fim } = await req.json();

        // Buscar terminal se especificado
        let terminal = null;
        if (terminal_id) {
            terminal = await base44.entities.Terminal.get(terminal_id);
            if (!terminal) {
                return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
            }
        }

        // Chamar API para recolher marcações
        const params = new URLSearchParams({
            clienteCloud: CLIENTE_CLOUD
        });

        if (terminal) {
            params.append('terminalNome', terminal.nome);
        }
        if (data_inicio) {
            params.append('dataInicio', data_inicio);
        }
        if (data_fim) {
            params.append('dataFim', data_fim);
        }

        const response = await fetch(
            `${API_BASE}/recolhermarcacoes?${params.toString()}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const marcacoes = await response.json();

        return Response.json({
            success: true,
            total: marcacoes.length || 0,
            terminal: terminal?.nome || 'Todos',
            marcacoes
        });

    } catch (error) {
        return Response.json({ 
            error: error.message,
            details: error.stack 
        }, { status: 500 });
    }
});