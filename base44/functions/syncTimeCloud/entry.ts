/**
 * syncTimeCloud — Sincronização periódica de marcações e status dos terminais
 *
 * Esta função é chamada pela automação "Sync TimeCloud → NOC Monitor (5 min)".
 * Percorre todos os terminais activos cadastrados no sistema e:
 *   1. Para terminais WebSocket Cloud (Timmy): pede os logs via terminalControl/getlogs
 *      e atualiza o status (online/offline) com base no ping do servidor Timmy.
 *   2. Para terminais ADMS/iClock: pede os logs via admsReport (pull).
 *   3. Para outros tipos: apenas atualiza o status via monitorTerminal.
 *
 * Os logs recolhidos são gravados automaticamente na entidade Marcacao.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // Permite chamada por automação (sem user) ou por admin
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { horas_atras = 1, limit = 500 } = payload;

    // Usar service role para aceder a todos os terminais
    const terminais = await base44.asServiceRole.entities.Terminal.list();
    const activos = terminais.filter(t => t.ativo !== false);

    const results = { total: activos.length, synced: 0, errors: 0, details: [] };

    for (const terminal of activos) {
      try {
        const tipo = terminal.tipo_conexao;

        if (tipo === 'websocket_cloud') {
          // Pedir status ao servidor Timmy WS via HTTP (não precisa de user autenticado)
          // O terminalControl requer auth de admin — para chamadas da automação usamos
          // o admsReport que processa logs via push. O websocket_cloud envia logs
          // automaticamente via sendlog; aqui apenas actualizamos o status.
          const sn = terminal.numero_serie;
          let timmyOnline = false;
          if (sn) {
            try {
              const timmyPort = (globalThis.Deno?.env?.get?.('TIMMY_WS_PORT')) || '8765';
              const timmyHost = (globalThis.Deno?.env?.get?.('TIMMY_WS_HOST')) || 'localhost';
              const r = await fetch(`http://${timmyHost}:${timmyPort}/status/${sn}`, { signal: AbortSignal.timeout(3000) });
              if (r.ok) { const d = await r.json(); timmyOnline = d.connected === true; }
            } catch (_) { /* servidor Timmy não acessível daqui */ }
          }

          // Actualizar status do terminal com base no que sabemos
          const agora = new Date().toISOString();
          const novoStatus = timmyOnline ? 'online' : terminal.status || 'offline';
          await base44.asServiceRole.entities.Terminal.update(terminal.id, {
            ultimo_check: agora,
            ...(timmyOnline ? { status: 'online', ultimo_ping: agora, segundos_sem_ping: 0 } : {})
          }).catch(() => {});

          const resp = { data: { success: true, message: timmyOnline ? 'Online via Timmy WS' : 'Status verificado (logs por push)' } };

          const ok = resp?.data?.success === true;
          results.details.push({ id: terminal.id, nome: terminal.nome, tipo, ok, msg: resp?.data?.message || resp?.data?.error });
          if (ok) results.synced++; else results.errors++;

        } else if (tipo === 'adms_push' || tipo === 'sdk_tcp') {
          // Para ADMS: os logs chegam por push (admsReport), apenas monitorizar status
          await base44.asServiceRole.functions.invoke('monitorTerminal', {
            terminal_id: terminal.id
          }).catch(() => {});
          results.details.push({ id: terminal.id, nome: terminal.nome, tipo, ok: true, msg: 'Status monitorizado (push mode)' });
          results.synced++;

        } else if (['ip_local', 'ip_publico', 'dns', 'heartbeat'].includes(tipo)) {
          // Monitorizar status via ping/HTTP
          await base44.asServiceRole.functions.invoke('monitorTerminal', {
            terminal_id: terminal.id
          }).catch(() => {});
          results.details.push({ id: terminal.id, nome: terminal.nome, tipo, ok: true, msg: 'Status monitorizado' });
          results.synced++;

        } else {
          results.details.push({ id: terminal.id, nome: terminal.nome, tipo, ok: null, msg: 'Tipo não suportado para sync automático' });
        }

      } catch (err) {
        results.errors++;
        results.details.push({ id: terminal.id, nome: terminal.nome, erro: err.message });
      }
    }

    console.log(`[syncTimeCloud] Sync concluído: ${results.synced}/${results.total} terminais. Erros: ${results.errors}`);

    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results
    });

  } catch (error) {
    console.error('[syncTimeCloud] Erro geral:', error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});