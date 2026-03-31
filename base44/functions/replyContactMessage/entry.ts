import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const { message_id, reply_text, to_email, original_message } = await req.json();

    if (!message_id || !reply_text || !to_email) {
      return Response.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const emailBody = `Olá,

Recebeu uma resposta da equipa NOC Monitor:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${reply_text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${original_message ? `A sua mensagem original:\n"${original_message}"\n` : ''}
Atenciosamente,
Equipa NOC Monitor`;

    await base44.integrations.Core.SendEmail({
      to: to_email,
      subject: '[NOC Monitor] Resposta à sua mensagem',
      body: emailBody,
      from_name: 'NOC Monitor - Suporte',
    });

    await base44.entities.ContactMessage.update(message_id, {
      respondido: true,
      lido: true,
      resposta_texto: reply_text,
      respondido_em: new Date().toISOString(),
      respondido_por: user.email,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[replyContactMessage] Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});