import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mail, Send, X, Check, Trash2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ContactMessagesPanel() {
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [viewMode, setViewMode] = useState('unread');

  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['contact-messages'],
    queryFn: () => base44.entities.ContactMessage.list(),
    refetchInterval: 30000,
  });

  const unreadMessages = messages.filter(m => !m.lido).sort((a, b) => 
    new Date(b.data_envio) - new Date(a.data_envio)
  );

  const allMessages = messages.sort((a, b) => 
    new Date(b.data_envio) - new Date(a.data_envio)
  );

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.ContactMessage.update(id, { lido: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contact-messages'] }),
    onError: () => toast.error('Erro ao marcar como lido'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ContactMessage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-messages'] });
      setSelectedMessage(null);
      toast.success('Mensagem excluída');
    },
    onError: () => toast.error('Erro ao excluir mensagem'),
  });

  const handleReply = async () => {
    if (!selectedMessage || !replyText.trim()) return;

    setSendingReply(true);
    try {
      const currentUser = await base44.auth.me();

      // Envia email de resposta
      await base44.integrations.Core.SendEmail({
        to: selectedMessage.from_email,
        subject: `Re: ${selectedMessage.message.substring(0, 50)}...`,
        body: replyText,
      });

      // Marca como respondido e salva a resposta
      await base44.entities.ContactMessage.update(selectedMessage.id, {
        respondido: true,
        lido: true,
        resposta_texto: replyText,
        respondido_em: new Date().toISOString(),
        respondido_por: currentUser?.email || 'admin',
      });

      toast.success('Email enviado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['contact-messages'] });
      setSelectedMessage(null);
      setReplyText('');
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      toast.error('Erro ao enviar email');
    } finally {
      setSendingReply(false);
    }
  };

  const displayMessages = viewMode === 'unread' ? unreadMessages : allMessages;
  const hasMessages = displayMessages.length > 0;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-5 w-5" />
            Mensagens de Contato
            <Badge className="ml-2 bg-blue-600">{unreadMessages.length}</Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={viewMode} onValueChange={setViewMode}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="unread">Não Lidas ({unreadMessages.length})</TabsTrigger>
            <TabsTrigger value="all">Todas ({allMessages.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {!selectedMessage ? (
          hasMessages ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {displayMessages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">{msg.from_email}</p>
                    <p className="text-xs text-slate-500 truncate">{msg.message}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {new Date(msg.data_envio).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {msg.respondido && (
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">Respondido</Badge>
                    )}
                    {!msg.lido && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs">Novo</Badge>
                    )}
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma mensagem {viewMode === 'unread' ? 'não lida' : ''}</p>
            </div>
          )
        ) : (
          <div className="space-y-4 border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900">{selectedMessage.from_email}</p>
                <p className="text-xs text-slate-500">
                  {new Date(selectedMessage.data_envio).toLocaleString('pt-BR')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedMessage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="bg-white rounded border border-slate-200 p-3">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{selectedMessage.message}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Sua Resposta</label>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Digite sua resposta..."
                className="min-h-[120px]"
              />
            </div>

            <div className="flex gap-2 justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('Tem certeza que deseja excluir esta mensagem?')) {
                    deleteMutation.mutate(selectedMessage.id);
                  }
                }}
                className="text-red-600 hover:bg-red-50"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedMessage(null)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleReply}
                  disabled={!replyText.trim() || sendingReply}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sendingReply ? 'Enviando...' : 'Enviar Resposta'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}