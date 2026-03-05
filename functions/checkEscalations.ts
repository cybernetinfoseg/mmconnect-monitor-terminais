import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Scheduled function: checks for terminals offline for more than 24h
 * and escalates alerts to admins via push + email.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const now = new Date();
    const threshold24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get all open escalation alerts not yet escalated
    const openAlerts = await base44.asServiceRole.entities.EscalationAlert.filter({
      resolvido: false,
      escalado: false,
    });

    const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
    const adminEmails = admins.map(a => a.email).filter(Boolean);

    const allSubs = await base44.asServiceRole.entities.PushSubscription.filter({ ativo: true });
    const adminSubs = allSubs.filter(s => adminEmails.includes(s.user_email));

    const escalated = [];

    for (const alert of openAlerts) {
      const offlineSince = new Date(alert.offline_desde);
      if (offlineSince > threshold24h) continue; // Not yet 24h

      // Send push notifications to admins
      for (const sub of adminSubs) {
        await fetch(sub.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'TTL': '86400' },
          body: JSON.stringify({
            title: '🚨 ESCALAÇÃO: Terminal Offline +24h',
            body: `${alert.terminal_nome}${alert.local ? ' — ' + alert.local : ''} está offline há mais de 24h sem resolução!`,
            tag: `escalation-${alert.terminal_id}`,
          }),
        }).catch(() => {});
      }

      // Send escalation email to all admins
      for (const email of adminEmails) {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `[ESCALAÇÃO CRÍTICA] Terminal ${alert.terminal_nome} offline há +24h`,
          body: `⚠️ ALERTA ESCALADO AUTOMATICAMENTE\n\nO terminal "${alert.terminal_nome}" está OFFLINE há mais de 24 horas sem resolução.\n\nDetalhes:\n• Local: ${alert.local || '—'}\n• Cliente: ${alert.cliente || '—'}\n• Offline desde: ${new Date(alert.offline_desde).toLocaleString('pt-BR')}\n• Responsável: ${alert.owner_email || '—'}\n\nPor favor, tome as devidas providências.\n\n---\nNOC Monitor • Sistema de Escalação Automática`,
        }).catch(() => {});
      }

      await base44.asServiceRole.entities.EscalationAlert.update(alert.id, {
        escalado: true,
        escalado_em: now.toISOString(),
      });

      escalated.push(alert.terminal_nome);
    }

    // Resolve alerts for terminals now online
    const terminals = await base44.asServiceRole.entities.Terminal.list();
    const onlineIds = new Set(terminals.filter(t => t.status === 'online').map(t => t.id));
    const allOpen = await base44.asServiceRole.entities.EscalationAlert.filter({ resolvido: false });
    for (const alert of allOpen) {
      if (onlineIds.has(alert.terminal_id)) {
        await base44.asServiceRole.entities.EscalationAlert.update(alert.id, { resolvido: true });
      }
    }

    return Response.json({ success: true, checked: openAlerts.length, escalated });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});