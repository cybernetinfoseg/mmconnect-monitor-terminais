import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Automation: chamada quando um TerminalUser é criado ou atualizado.
// Atualiza o campo utilizador_nome nas Marcações existentes para esse enrollid.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Pode ser chamado via automation (payload.data) ou manualmente
    const terminalUser = body.data || body;

    if (!terminalUser?.enrollid || !terminalUser?.nome) {
      return Response.json({ error: 'Payload inválido: enrollid e nome obrigatórios' }, { status: 400 });
    }

    const enrollid = Number(terminalUser.enrollid);
    const nome = terminalUser.nome;

    // Buscar todas as marcações com esse enrollid sem nome ou com nome desatualizado
    const marcacoes = await base44.asServiceRole.entities.Marcacao.filter({ enrollid }, '-timestamp', 5000);

    const semNome = marcacoes.filter(m => !m.utilizador_nome || m.utilizador_nome !== nome);

    if (semNome.length === 0) {
      return Response.json({ updated: 0, message: 'Nada a atualizar' });
    }

    // Atualizar em lotes de 50
    let updated = 0;
    for (const m of semNome) {
      await base44.asServiceRole.entities.Marcacao.update(m.id, { utilizador_nome: nome });
      updated++;
    }

    console.log(`[syncNomes] enrollid=${enrollid} nome="${nome}" → ${updated} marcações atualizadas`);
    return Response.json({ updated, enrollid, nome });

  } catch (error) {
    console.error('[syncNomes] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});