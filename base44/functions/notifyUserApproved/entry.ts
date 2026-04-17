import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { email, nome, role } = await req.json();

    // Valida se email foi fornecido
    if (!email) {
      return Response.json({ error: 'Email é obrigatório' }, { status: 400 });
    }

    // Email de recusa
    if (role === 'rejected') {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: email,
        subject: '[NOC Monitor] Solicitação de Acesso Recusada',
        body: `Olá ${nome || ''},\n\nInfelizmente, a sua solicitação de acesso ao NOC Monitor foi recusada.\n\nSe tiver dúvidas, entre em contacto com o administrador do sistema.\n\n---\nNOC Monitor - Monitoramento de Terminais Biométricos`,
      });
      return Response.json({ success: true, message: 'Email de recusa enviado' });
    }

    // Envia email de aprovação
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: email,
      subject: 'Sua conta no NOC Monitor foi aprovada! ✅',
      body: `Olá ${nome || 'utilizador'},\n\nA sua solicitação de acesso ao NOC Monitor foi APROVADA!\n\nInformações da sua conta:\n- Email: ${email}\n- Papel: ${getRoleLabel(role)}\n- Status: Ativo\n\nPode fazer login no NOC Monitor usando as suas credenciais.\n\nSe tiver qualquer dúvida, entre em contacto com o administrador do sistema.\n\n---\nNOC Monitor - Monitoramento de Terminais Biométricos`,
    });

    return Response.json({ success: true, message: 'Email de aprovação enviado' });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getRoleLabel(role) {
  const labels = {
    admin: 'Administrador',
    user: 'Utilizador',
  };
  return labels[role] || role;
}