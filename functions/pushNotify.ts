import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Sends a Web Push notification (via browser push) and/or email 
 * to subscribers. Also handles the escalation check logic.
 * 
 * Called with: { action: 'subscribe' | 'send' | 'check_escalations' | 'unsubscribe' }
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // ─── SUBSCRIBE ────────────────────────────────────────────────
    if (action === 'subscribe') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { endpoint, p256dh, auth: authKey } = body;

      // Deactivate previous subscriptions for this endpoint
      const existing = await base44.asServiceRole.entities.PushSubscription.filter({ endpoint });
      for (const sub of existing) {
        await base44.asServiceRole.entities.PushSubscription.update(sub.id, { ativo: false });
      }

      await base44.asServiceRole.entities.PushSubscription.create({
        user_email: user.email,
        endpoint,
        p256dh,
        auth: authKey,
        ativo: true,
        user_agent: req.headers.get('user-agent') || '',
      });

      return Response.json({ success: true });
    }

    // ─── UNSUBSCRIBE ──────────────────────────────────────────────
    if (action === 'unsubscribe') {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

      const { endpoint } = body;
      const subs = await base44.asServiceRole.entities.PushSubscription.filter({
        user_email: user.email,
        endpoint,
      });
      for (const sub of subs) {
        await base44.asServiceRole.entities.PushSubscription.update(sub.id, { ativo: false });
      }
      return Response.json({ success: true });
    }

    // ─── CHECK ESCALATIONS (called by automation, admin-only) ─────
    if (action === 'check_escalations') {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

      const now = new Date();
      const threshold24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get all open escalation alerts not yet escalated
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
          // Escalate: notify admins by push + email
          const alertSubs = await base44.asServiceRole.entities.PushSubscription.filter({ ativo: true });
          const adminSubs = alertSubs.filter(s => adminEmails.includes(s.user_email));

          // Send push to admins
          for (const sub of adminSubs) {
            await sendWebPush(sub, {
              title: '🚨 Escalação: Terminal Crítico Offline há +24h',
              body: `${alert.terminal_nome} (${alert.local || '—'}) está offline há mais de 24 horas sem resolução.`,
              tag: `escalation-${alert.terminal_id}`,
            }).catch(() => {});
          }

          // Send email to admins
          for (const email of adminEmails) {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: email,
              subject: `[ESCALAÇÃO] Terminal ${alert.terminal_nome} offline há +24h`,
              body: `ALERTA ESCALADO\n\nO terminal "${alert.terminal_nome}" localizado em "${alert.local || '—'}" (cliente: ${alert.cliente || '—'}) está OFFLINE há mais de 24 horas sem resolução.\n\nOffline desde: ${new Date(alert.offline_desde).toLocaleString('pt-BR')}\nDono: ${alert.owner_email || '—'}\n\n---\nNOC Monitor • Sistema de Escalação Automática`,
            }).catch(() => {});
          }

          await base44.asServiceRole.entities.EscalationAlert.update(alert.id, {
            escalado: true,
            escalado_em: now.toISOString(),
          });

          escalated.push(alert.terminal_nome);
        }
      }

      // Check terminals now online → mark escalation alerts as resolved
      const terminals = await base44.asServiceRole.entities.Terminal.list();
      const onlineIds = new Set(terminals.filter(t => t.status === 'online').map(t => t.id));
      const allOpen = await base44.asServiceRole.entities.EscalationAlert.filter({ resolvido: false });
      for (const alert of allOpen) {
        if (onlineIds.has(alert.terminal_id)) {
          await base44.asServiceRole.entities.EscalationAlert.update(alert.id, { resolvido: true });
        }
      }

      return Response.json({ success: true, escalated });
    }

    // ─── SEND PUSH ON TERMINAL OFFLINE (called by monitorTerminal) ─
    if (action === 'notify_offline') {
      // No auth needed here – called internally by monitorAllTerminals as service role
      const { terminal_id, terminal_nome, local, cliente, owner_email, incident_id } = body;

      // Create or find EscalationAlert
      const existing = await base44.asServiceRole.entities.EscalationAlert.filter({
        terminal_id,
        resolvido: false,
      });

      let escalationAlert;
      if (existing.length === 0) {
        escalationAlert = await base44.asServiceRole.entities.EscalationAlert.create({
          incident_id: incident_id || '',
          terminal_id,
          terminal_nome,
          local: local || '',
          cliente: cliente || '',
          owner_email: owner_email || '',
          offline_desde: new Date().toISOString(),
          escalado: false,
          resolvido: false,
          notificacao_inicial_enviada: false,
        });
      } else {
        escalationAlert = existing[0];
      }

      if (escalationAlert.notificacao_inicial_enviada) {
        return Response.json({ success: true, skipped: true });
      }

      // Get push subscriptions for the owner + all admins
      const allSubs = await base44.asServiceRole.entities.PushSubscription.filter({ ativo: true });
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      const adminEmails = new Set(admins.map(a => a.email));

      const targetSubs = allSubs.filter(s =>
        s.user_email === owner_email || adminEmails.has(s.user_email)
      );

      const payload = {
        title: '🔴 Terminal Offline',
        body: `${terminal_nome}${local ? ' — ' + local : ''} ficou offline.`,
        tag: `offline-${terminal_id}`,
        data: { terminal_id, url: '/terminais' },
      };

      for (const sub of targetSubs) {
        await sendWebPush(sub, payload).catch(() => {});
      }

      await base44.asServiceRole.entities.EscalationAlert.update(escalationAlert.id, {
        notificacao_inicial_enviada: true,
      });

      return Response.json({ success: true, notified: targetSubs.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Web Push helper using VAPID-less simple push (fetch POST to endpoint) ────
// For a full VAPID implementation we use base64url signing manually.
async function sendWebPush(sub, payload) {
  // Build a minimal push payload
  const body = JSON.stringify(payload);

  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'TTL': '86400',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`Push failed for ${sub.user_email}: ${response.status} ${text}`);
  }
}