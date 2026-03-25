/**
 * agentReport — endpoint seguro para o Agente Local
 *
 * SEGURANÇA: autenticação EXCLUSIVAMENTE por X-Api-Key pessoal.
 * Usa asServiceRole para queries — mas a key é validada antes de qualquer acesso.
 * Sem key válida → 401 imediato, sem dados expostos.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
    try {
        // 1. Extrair e validar API Key — ÚNICO fator de autenticação
        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();

        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        // 2. Usar asServiceRole exclusivamente — ignora qualquer sessão de utilizador
        const base44 = createClientFromRequest(req);

        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey) || null;

        if (!keyRecord) {
            return Response.json({ error: 'API Key inválida' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;

        // 3. Ler payload
        const body = await req.json();
        const { terminal_id, status, latencia_ms, segundos_sem_ping } = body;

        if (!terminal_id || !status) {
            return Response.json({ error: 'terminal_id e status são obrigatórios' }, { status: 400 });
        }

        // 4. Verificar que o terminal existe e pertence ao dono da API Key
        const terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id);
        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        const allUsers = await base44.asServiceRole.entities.User.list();
        const owner = allUsers.find(u => u.email === ownerEmail) || { email: ownerEmail, role: 'user' };
        const isAdmin = owner.role === 'admin';

        if (!isAdmin && terminal.created_by !== ownerEmail) {
            return Response.json({ error: 'Sem permissão para reportar este terminal' }, { status: 403 });
        }

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

        // 7. Verificar mudança de status para criar incidentes/alertas
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

            const admins = allUsers.filter(u => u.role === 'admin' || u.email === terminal.created_by);
            for (const u of admins) {
                if (u.telegram_bot_token && u.telegram_chat_id) {
                    const msg = `🔴 <b>Terminal Offline</b>\n\n` +
                        `📟 <b>${terminal.nome}</b>\n` +
                        `📍 Local: ${terminal.local || '—'}\n` +
                        `🏢 Cliente: ${terminal.cliente_nome || '—'}\n` +
                        `🕐 ${new Date().toLocaleString('pt-PT', { timeZone: 'UTC' })} UTC`;
                    await base44.asServiceRole.functions.invoke('telegramNotify', {
                        bot_token: u.telegram_bot_token,
                        chat_id: u.telegram_chat_id,
                        message: msg,
                    }).catch(() => {});
                }
            }
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