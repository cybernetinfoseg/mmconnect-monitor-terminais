import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { terminalId, data } = await req.json();

    if (terminalId) {
      // UPDATE — verify the user owns this terminal (created_by OR usuario_email)
      const terminal = await base44.asServiceRole.entities.Terminal.get(terminalId);
      if (!terminal) {
        return Response.json({ error: 'Terminal não encontrado' }, { status: 404 });
      }
      const isOwner = terminal.created_by === user.email || terminal.usuario_email === user.email;
      const isAdmin = user.role === 'admin';
      if (!isOwner && !isAdmin) {
        return Response.json({ error: 'Sem permissão para editar este terminal' }, { status: 403 });
      }
      const updated = await base44.asServiceRole.entities.Terminal.update(terminalId, data);
      return Response.json({ terminal: updated });
    } else {
      // CREATE — set usuario_email to current user if not admin
      const createData = { ...data };
      if (user.role !== 'admin') {
        createData.usuario_email = user.email;
      }
      const created = await base44.asServiceRole.entities.Terminal.create(createData);
      return Response.json({ terminal: created });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});