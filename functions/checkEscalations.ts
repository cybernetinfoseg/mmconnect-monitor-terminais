import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * checkEscalations — chamado pelo scheduler a cada hora.
 * Escala terminais offline há mais de 24h e resolve alertas de terminais que voltaram online.
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        // Permite chamada do scheduler (sem auth) ou admin autenticado
        const isAuthenticated = await base44.auth.isAuthenticated();
        if (isAuthenticated) {
            const user = await base44.auth.me();
            if (user?.role !== 'admin') {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        const now = new Date();
        const threshold24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Buscar alertas abertos ainda não escalados
        const openAlerts = await base44.asServiceRole.entities.EscalationAlert.filter({
            resolvido: false,
            escalado: false,
        });

        const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
        const adminEmails = admins.map(a => a.email).filter(Boolean);

        const escalated = [];

        for (const alert of openAlerts) {
            const offlineSince = new Date(alert.offline_desde);
            if (offlineSince <= threshold24h) {
                // Notificar admins por email
                for (const email of adminEmails) {
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: email,
                        subject: `[ESCALAÇÃO] Terminal ${alert.terminal_nome} offline há +24h`,
                        body: `ALERTA ESCALADO\n\nO terminal "${alert.terminal_nome}" localizado em "${alert.local || '—'}" (cliente: ${alert.cliente || '—'}) está OFFLINE há mais de 24 horas sem resolução.\n\nOffline desde: ${new Date(alert.offline_desde).toLocaleString('pt-BR')}\nDono: ${alert.owner_email || '—'}\n\n---\nNOC Monitor • Sistema de Escalação Automática`,
                    }).catch(() => {});
                }

                // Notificar admins com Telegram configurado
                const users = await base44.asServiceRole.entities.User.list().catch(() => []);
                for (const u of users) {
                    if (u.telegram_bot_token && u.telegram_chat_id) {
                        const msg = `🚨 <b>Escalação: Terminal Crítico Offline +24h</b>\n\n` +
                            `📟 <b>${alert.terminal_nome}</b>\n` +
                            `📍 Local: ${alert.local || '—'}\n` +
                            `🏢 Cliente: ${alert.cliente || '—'}\n` +
                            `⏱ Offline desde: ${new Date(alert.offline_desde).toLocaleString('pt-PT', { timeZone: 'UTC' })} UTC`;
                        await base44.asServiceRole.functions.invoke('telegramNotify', {
                            bot_token: u.telegram_bot_token,
                            chat_id: u.telegram_chat_id,
                            message: msg,
                        }).catch(() => {});
                    }
                }

                await base44.asServiceRole.entities.EscalationAlert.update(alert.id, {
                    escalado: true,
                    escalado_em: now.toISOString(),
                });

                escalated.push(alert.terminal_nome);
            }
        }

        // Resolver alertas de terminais que voltaram online
        const terminals = await base44.asServiceRole.entities.Terminal.list();
        const onlineIds = new Set(terminals.filter(t => t.status === 'online').map(t => t.id));
        const allOpen = await base44.asServiceRole.entities.EscalationAlert.filter({ resolvido: false });
        for (const alert of allOpen) {
            if (onlineIds.has(alert.terminal_id)) {
                await base44.asServiceRole.entities.EscalationAlert.update(alert.id, { resolvido: true });
            }
        }

        return Response.json({ success: true, escalated, checked: openAlerts.length });

    } catch (error) {
        console.error('checkEscalations erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});