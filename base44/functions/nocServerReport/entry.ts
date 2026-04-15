/**
 * nocServerReport — endpoint unificado de reporte para o NOC Server (Windows)
 *
 * Usado pelo noc_server.py para reportar status de terminais:
 *   - heartbeat  (TCP Heartbeat)
 *   - adms_push  (ADMS/Push ZKTeco, Anviz)
 *   - sdk_tcp    (SDK polling porta 4370)
 *
 * Autenticação: X-Api-Key pessoal
 * Payload: { terminal_id, status, latencia_ms?, segundos_sem_ping? }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const NOC_TYPES = ['heartbeat', 'adms_push', 'sdk_tcp'];

Deno.serve(async (req) => {
    try {
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();

        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const base44 = createClientFromRequest(req);
        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey);

        if (!keyRecord) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;
        const body = await req.json();
        const { terminal_id, status, latencia_ms, segundos_sem_ping } = body;

        if (!terminal_id || !status) {
            return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });
        }

        const statusValido = ['online', 'offline', 'warning'].includes(status) ? status : 'offline';
        const statusEfetivo = statusValido === 'warning' ? 'online' : statusValido;

        // Verificar ownership
        const terminaisDoUtilizador = await base44.asServiceRole.entities.Terminal.filter({
            ativo: true,
            created_by: ownerEmail,
        });

        const terminal = terminaisDoUtilizador.find(t => t.id === terminal_id);

        if (!terminal) {
            const terminalExiste = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
            if (!terminalExiste) {
                return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
            }
            return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
        }

        // Validar tipo — apenas tipos NOC Server
        if (!NOC_TYPES.includes(terminal.tipo_conexao)) {
            return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo NOC Server` }, { status: 400 });
        }

        const agora = new Date().toISOString();

        // Atualizar terminal
        await base44.asServiceRole.entities.Terminal.update(terminal_id, {
            status: statusValido,
            ultimo_check: agora,
            latencia_ms: latencia_ms ?? null,
            segundos_sem_ping: segundos_sem_ping ?? 0,
            ...(statusEfetivo === 'online' && { ultimo_ping: agora }),
        });

        // Verificar janela de manutenção
        const janelasManu = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id, ativo: true });
        const emManutencao = janelasManu.some(j => j.inicio <= agora && j.fim >= agora);

        // Verificar mudança de status via cache
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

        // Atualizar cache
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

        // Histórico
        await base44.asServiceRole.entities.StatusHistory.create({
            terminal_id,
            terminal_nome: terminal.nome,
            status: statusEfetivo === 'offline' ? 'offline' : 'online',
            timestamp: agora,
            local: terminal.local,
            cliente: terminal.cliente_nome,
        });

        console.log(`[nocServerReport] ${ownerEmail} → "${terminal.nome}" (${terminal.tipo_conexao}) → ${statusValido}`);
        return Response.json({ success: true, terminal: terminal.nome, status: statusValido });

    } catch (error) {
        console.error('nocServerReport erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});