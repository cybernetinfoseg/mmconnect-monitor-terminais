import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rules = await base44.asServiceRole.entities.AlertRule.filter({ ativo: true });
    const terminals = await base44.asServiceRole.entities.Terminal.list();

    const now = new Date();
    const results = [];

    for (const rule of rules) {
      // Check cooldown
      if (rule.ultima_disparada) {
        const lastFired = new Date(rule.ultima_disparada);
        const minutesSince = (now - lastFired) / 60000;
        if (minutesSince < (rule.cooldown_minutos || 30)) {
          continue;
        }
      }

      // Filter terminals
      let filteredTerminals = terminals;
      if (rule.filtro_local) {
        filteredTerminals = filteredTerminals.filter(t => t.local === rule.filtro_local);
      }
      if (rule.filtro_cliente) {
        filteredTerminals = filteredTerminals.filter(t =>
          t.cliente_nome === rule.filtro_cliente || t.cliente === rule.filtro_cliente
        );
      }

      let shouldFire = false;
      let messageBody = '';
      const ts = now.toLocaleString('pt-BR');

      if (rule.gatilho === 'terminal_offline') {
        const offlineTerminals = filteredTerminals.filter(t => t.status === 'offline');
        if (offlineTerminals.length > 0) {
          shouldFire = true;
          const list = offlineTerminals.map(t => `• ${t.nome} (${t.local || '—'})`).join('\n');
          messageBody = `Terminais offline detectados em ${ts}:\n\n${list}`;
        }
      } else if (rule.gatilho === 'terminal_online') {
        const onlineTerminals = filteredTerminals.filter(t => t.status === 'online');
        if (onlineTerminals.length > 0) {
          shouldFire = true;
          const list = onlineTerminals.map(t => `• ${t.nome} (${t.local || '—'})`).join('\n');
          messageBody = `Terminais online detectados em ${ts}:\n\n${list}`;
        }
      } else if (rule.gatilho === 'sem_ping_minutos') {
        const threshold = (rule.condicao_valor || 5) * 60;
        const staleTerminals = filteredTerminals.filter(t =>
          t.ativo && (t.segundos_sem_ping || 0) >= threshold
        );
        if (staleTerminals.length > 0) {
          shouldFire = true;
          const list = staleTerminals.map(t => `• ${t.nome} — sem ping há ${Math.floor((t.segundos_sem_ping || 0) / 60)} min`).join('\n');
          messageBody = `Terminais sem ping há mais de ${rule.condicao_valor} minutos:\n\n${list}`;
        }
      } else if (rule.gatilho === 'multiplos_offline') {
        const offlineCount = filteredTerminals.filter(t => t.status === 'offline').length;
        if (offlineCount >= (rule.condicao_valor || 2)) {
          shouldFire = true;
          messageBody = `${offlineCount} terminais estão offline em ${ts}.`;
        }
      }

      if (shouldFire) {
        // Send email
        const emails = rule.destinatarios_email.split(',').map(e => e.trim()).filter(Boolean);
        for (const email of emails) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: email,
            subject: `[NOC Monitor] Alerta: ${rule.nome}`,
            body: `Regra disparada: ${rule.nome}\n\n${messageBody}\n\n---\nNOC Monitor • Terminais Biométricos`,
          });
        }

        await base44.asServiceRole.entities.AlertRule.update(rule.id, {
          ultima_disparada: now.toISOString(),
          total_disparos: (rule.total_disparos || 0) + 1,
        });

        results.push({ rule: rule.nome, fired: true, emails });
      }
    }

    return Response.json({ success: true, processed: rules.length, fired: results });
  } catch (error) {
    console.error(error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});