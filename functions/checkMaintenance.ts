/**
 * checkMaintenance — verifica se um terminal está em janela de manutenção ativa
 * Pode ser chamado com { terminal_id } para verificar um terminal específico
 * ou sem parâmetros para obter todos os terminais em manutenção agora
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.json().catch(() => ({}));
        const { terminal_id } = body;

        const agora = new Date().toISOString();

        // Buscar janelas ativas onde agora está entre inicio e fim
        const janelas = await base44.asServiceRole.entities.MaintenanceWindow.filter({ ativo: true });
        const ativas = janelas.filter(j => j.inicio <= agora && j.fim >= agora);

        if (terminal_id) {
            const emManutencao = ativas.some(j => j.terminal_id === terminal_id);
            const janela = ativas.find(j => j.terminal_id === terminal_id) || null;
            return Response.json({ em_manutencao: emManutencao, janela });
        }

        // Retornar todos os terminal_ids em manutenção agora
        const terminaisEmManutencao = ativas.map(j => j.terminal_id);
        return Response.json({ terminais_em_manutencao: terminaisEmManutencao, janelas: ativas });

    } catch (error) {
        console.error('checkMaintenance erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});