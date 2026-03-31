/**
 * agentReport — endpoint seguro para o Agente Local
 *
 * SEGURANÇA: autenticação EXCLUSIVAMENTE por X-Api-Key pessoal.
 * Cada utilizador só pode reportar os terminais que criou (created_by).
 * Admin pode reportar qualquer terminal.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    try {
        // 1. Extrair e validar API Key
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();

        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey) || null;

        if (!keyRecord) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;

        // 2. Ler payload
        const body = await req.json();
        const { terminal_id, status, latencia_ms, segundos_sem_ping } = body;

        if (!terminal_id || !status) {
            return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });
        }

        // 3. Verificar que o terminal existe e pertence ao dono da API Key
        // Estratégia: buscar os terminais do utilizador e verificar que o terminal_id está na lista
        // Isto garante compatibilidade independente de como o SDK retorna created_by
        const terminaisDoUtilizador = await base44.asServiceRole.entities.Terminal.filter({
            ativo: true,
            created_by: ownerEmail,
        });

        const terminal = terminaisDoUtilizador.find(t => t.id === terminal_id);

        if (!terminal) {
            // Verificar se o terminal existe de todo (para dar erro diferente)
            const terminalExiste = await base44.asServiceRole.entities.Terminal.get(terminal_id);
            if (!terminalExiste) {
                return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
            }
            console.error(`[agentReport] 403: terminal ${terminal_id} não pertence a "${ownerEmail}"`);
            return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
        }

        console.log(`[agentReport] OK: ${ownerEmail} → terminal "${terminal.nome}" (${terminal_id})`);

        const agora = new Date().toISOString();
        const statusValido = ['online', 'offline', 'warning'].includes(status) ? status : 'offline';
        const statusEfetivo = statusValido === 'warning' ? 'online' : statusValido;

        // 5. Atualizar terminal
        await base44.asServiceRole.entities.Terminal.update(terminal_id, {
            status: statusValido,
            ultimo_check: agora,
            latencia_ms: latencia_ms ?? null,
            segundos_sem_ping: segundos_sem_ping ?? 0,
            ...(statusEfetivo === 'online' && { ultimo_ping: agora }),
        });

        // 6. Verificar janela de manutenção
        const janelasManu = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id, ativo: true });
        const emManutencao = janelasManu.some(j => j.inicio <= agora && j.fim >= agora);

        // 7. Verificar mudança de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;

        if (!emManutencao && cache && cache.ultimo_status === 'online' && statusEfetivo === 'offline') {
            await base44.asServiceRole.entities.AlertIncident.create({
                terminal_id,
                terminal_nome: terminal.nome,
                local: terminal.local,
                cliente: terminal.cliente_nome,
                tipo: 'offline',
                timestamp: agora,
                resolvido: false,
                notificado: false,
            });
            await base44.asServiceRole.functions.invoke('pushNotify', {
                action: 'notify_offline',
                terminal_id,
                terminal_nome: terminal.nome,
                local: terminal.local || '',
                cliente: terminal.cliente_nome || '',
                owner_email: terminal.created_by || '',
            }).catch(() => {});
        } else if (!emManutencao && cache && cache.ultimo_status === 'offline' && statusEfetivo === 'online') {
            await base44.asServiceRole.entities.AlertIncident.create({
                terminal_id,
                terminal_nome: terminal.nome,
                local: terminal.local,
                cliente: terminal.cliente_nome,
                tipo: 'restored',
                timestamp: agora,
                resolvido: true,
                notificado: false,
            });
            const openAlerts = await base44.asServiceRole.entities.EscalationAlert.filter({
                terminal_id, resolvido: false,
            }).catch(() => []);
            for (const alert of openAlerts) {
                await base44.asServiceRole.entities.EscalationAlert.update(alert.id, { resolvido: true }).catch(() => {});
            }
        }

        // 8. Atualizar cache
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, {
                ultimo_status: statusEfetivo,
                atualizado_em: agora,
            });
        } else {
            await base44.asServiceRole.entities.StatusCache.create({
                terminal_id,
                ultimo_status: statusEfetivo,
                atualizado_em: agora,
            });
        }

        // 9. Histórico
        await base44.asServiceRole.entities.StatusHistory.create({
            terminal_id,
            terminal_nome: terminal.nome,
            status: statusEfetivo === 'offline' ? 'offline' : 'online',
            timestamp: agora,
            local: terminal.local,
            cliente: terminal.cliente_nome,
        });

        return Response.json({ success: true, terminal: terminal.nome, status: statusValido });

    } catch (error) {
        console.error('agentReport erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});