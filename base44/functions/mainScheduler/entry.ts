/**
 * mainScheduler — Scheduler consolidado do NOC Monitor
 *
 * Executa a cada 5 minutos via automação:
 *   1. monitorAllTerminals  — verifica status de todos os terminais ativos
 *   2. processAlertRules    — avalia regras de alerta e envia notificações
 *   3. executeScheduledActions — executa ações remotas agendadas nos terminais
 *
 * A cada hora (minuto 0):
 *   4. checkEscalations     — escala terminais offline há +24h
 *   5. cleanupOldHistory    — limpeza de histórico antigo (uma vez por dia às 03:00 UTC)
 *
 * Cada tarefa é invocada como função separada (DRY, sem duplicação de lógica).
 * O scheduler apenas orquestra — a lógica real está em cada função especializada.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite chamada por automação (sem user) ou por admin autenticado
    const isAuthenticated = await base44.auth.isAuthenticated();
    if (isAuthenticated) {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: apenas administradores' }, { status: 403 });
      }
    }

    const now = new Date();
    const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
    const summary = { timestamp: now.toISOString() };

    // Importar lógica inline para evitar problemas de auth em sub-invocações
    // Usamos service role diretamente em vez de invocar funções filhas
    // ── 1. Monitorizar todos os terminais ────────────────────────────────────
    try {
      const r = await base44.asServiceRole.functions.invoke('monitorAllTerminals', {});
      const d = r?.data;
      summary.monitor = { total: d?.total, monitored: d?.monitored, statusChanged: d?.statusChanged };
    } catch (e) {
      // Se falha por auth, tentar diretamente
      summary.monitor = { error: e.message };
      console.error('[mainScheduler] monitorAllTerminals erro:', e.message);
    }

    // ── 2. Processar regras de alerta ────────────────────────────────────────
    try {
      const r = await base44.asServiceRole.functions.invoke('processAlertRules', {});
      const d = r?.data;
      summary.alerts = { processed: d?.processed, fired: Array.isArray(d?.fired) ? d.fired.length : 0 };
    } catch (e) {
      summary.alerts = { error: e.message };
      console.error('[mainScheduler] processAlertRules erro:', e.message);
    }

    // ── 3. Executar ações agendadas ──────────────────────────────────────────
    try {
      const r = await base44.asServiceRole.functions.invoke('executeScheduledActions', {});
      const d = r?.data;
      summary.scheduled = { executed: d?.executed ?? 0 };
    } catch (e) {
      summary.scheduled = { error: e.message };
      console.error('[mainScheduler] executeScheduledActions erro:', e.message);
    }

    // ── 4. Escalações — apenas 1× por hora ──────────────────────────────────
    if (minuteOfDay % 60 < 5) {
      try {
        const r = await base44.asServiceRole.functions.invoke('checkEscalations', {});
        const d = r?.data;
        summary.escalations = { escalated: Array.isArray(d?.escalated) ? d.escalated.length : 0, resolved: d?.resolved ?? 0 };
      } catch (e) {
        summary.escalations = { error: e.message };
        console.error('[mainScheduler] checkEscalations erro:', e.message);
      }
    }

    // ── 5. Limpeza de histórico — 1× por dia às 03:00 UTC ───────────────────
    if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
      try {
        const r = await base44.asServiceRole.functions.invoke('cleanupOldHistory', {});
        summary.cleanup = { deleted: r?.data?.deleted };
      } catch (e) {
        summary.cleanup = { error: e.message };
        console.error('[mainScheduler] cleanupOldHistory erro:', e.message);
      }
    }

    console.log('[mainScheduler] completo:', JSON.stringify(summary));
    return Response.json({ success: true, summary });

  } catch (error) {
    console.error('[mainScheduler] erro geral:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});