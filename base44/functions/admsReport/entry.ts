/**
 * admsReport — Recebe heartbeats do adms_server.py
 * Tipos geridos: adms_push
 * Autenticação: X-Api-Key pessoal
 *
 * O adms_server.py corre no Windows Server e escuta os HTTP POST
 * dos terminais ZKTeco/Anviz em /iclock/cdata e /iclock/getrequest.
 * Quando recebe um POST, chama este endpoint para atualizar o último ping.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const apiKey = (req.headers.get('X-Api-Key') || req.headers.get('x-api-key') || '').trim();
        if (!apiKey || apiKey.length < 16) {
            return Response.json({ error: 'API Key ausente ou inválida' }, { status: 401 });
        }

        const allApiKeys = await base44.asServiceRole.entities.ApiKey.filter({ ativo: true });
        const keyRecord = allApiKeys.find(k => k.key === apiKey);
        if (!keyRecord) {
            return Response.json({ error: 'API Key não autorizada' }, { status: 401 });
        }

        const ownerEmail = keyRecord.user_email;
        const body = await req.json();
        const { terminal_id, numero_serie, status, ip_terminal } = body;

        // Aceita lookup por terminal_id ou por numero_serie (SN do terminal ADMS)
        let terminal = null;
        if (terminal_id) {
            terminal = await base44.asServiceRole.entities.Terminal.get(terminal_id).catch(() => null);
        } else if (numero_serie) {
            const matches = await base44.asServiceRole.entities.Terminal.filter({ numero_serie }).catch(() => []);
            terminal = matches.find(t =>
                (t.usuario_email || t.created_by) === ownerEmail
            ) || null;
        }

        if (!terminal) {
            return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
        }

        const terminalOwner = terminal.usuario_email || terminal.created_by;
        if (terminalOwner !== ownerEmail) {
            return Response.json({ error: 'Sem permissão para este terminal' }, { status: 403 });
        }

        if (terminal.tipo_conexao !== 'adms_push') {
            return Response.json({ error: `Tipo "${terminal.tipo_conexao}" não é gerido pelo ADMS Server` }, { status: 400 });
        }

        const agora = new Date().toISOString();
        const agora_ms = Date.now();

        // Verificar janela de manutenção
        const janelasManu = await base44.asServiceRole.entities.MaintenanceWindow.filter({ terminal_id: terminal.id, ativo: true });
        const emManutencao = janelasManu.some(j => {
            const ini = new Date(j.inicio).getTime();
            const fim = new Date(j.fim).getTime();
            return agora_ms >= ini && agora_ms <= fim;
        });

        const reportedStatus = status || 'online';

        if (emManutencao && reportedStatus === 'offline') {
            return Response.json({ success: true, ignored: 'em_manutencao' });
        }

        // Atualizar terminal com último ping
        const updateData = {
            status: reportedStatus,
            ultimo_ping: agora,
            ultimo_check: agora,
            segundos_sem_ping: 0,
        };
        if (ip_terminal) updateData.observacoes = `Último ADMS push de: ${ip_terminal} em ${agora}`;
        await base44.asServiceRole.entities.Terminal.update(terminal.id, updateData);

        // Verificar cache de status
        const cacheResults = await base44.asServiceRole.entities.StatusCache.filter({ terminal_id: terminal.id });
        const cache = cacheResults.length > 0 ? cacheResults[0] : null;
        const statusAnterior = cache?.ultimo_status ?? null;
        const mudouDeEstado = statusAnterior !== null && statusAnterior !== reportedStatus;

        if (mudouDeEstado) {
            await base44.asServiceRole.entities.StatusHistory.create({
                terminal_id: terminal.id,
                terminal_nome: terminal.nome,
                status: reportedStatus,
                timestamp: agora,
                local: terminal.local || '',
                cliente: terminal.cliente_nome || '',
            });

            if (reportedStatus === 'online' && statusAnterior === 'offline') {
                const incidentes = await base44.asServiceRole.entities.AlertIncident.filter({
                    terminal_id: terminal.id, resolvido: false,
                }).catch(() => []);
                for (const inc of incidentes) {
                    const duracao = Math.round((agora_ms - new Date(inc.timestamp).getTime()) / 60000);
                    await base44.asServiceRole.entities.AlertIncident.update(inc.id, {
                        resolvido: true, resolvido_em: agora, duracao_minutos: duracao,
                    }).catch(() => {});
                }
                const escalations = await base44.asServiceRole.entities.EscalationAlert.filter({
                    terminal_id: terminal.id, resolvido: false,
                }).catch(() => []);
                for (const esc of escalations) {
                    await base44.asServiceRole.entities.EscalationAlert.update(esc.id, { resolvido: true }).catch(() => {});
                }
                await base44.asServiceRole.entities.AlertIncident.create({
                    terminal_id: terminal.id, terminal_nome: terminal.nome,
                    local: terminal.local || '', cliente: terminal.cliente_nome || '',
                    tipo: 'restored', timestamp: agora, resolvido: true, notificado: false,
                }).catch(() => {});
            }
        }

        // Atualizar cache
        if (cache) {
            await base44.asServiceRole.entities.StatusCache.update(cache.id, {
                ultimo_status: reportedStatus, atualizado_em: agora,
            });
        } else {
            await base44.asServiceRole.entities.StatusCache.create({
                terminal_id: terminal.id, ultimo_status: reportedStatus, atualizado_em: agora,
            });
        }

        console.log(`[admsReport] ${ownerEmail} → "${terminal.nome}" (SN: ${terminal.numero_serie || '?'}) → ${reportedStatus}`);
        return Response.json({ success: true, terminal_nome: terminal.nome, status: reportedStatus, mudou: mudouDeEstado });

    } catch (error) {
        console.error('[admsReport] Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});