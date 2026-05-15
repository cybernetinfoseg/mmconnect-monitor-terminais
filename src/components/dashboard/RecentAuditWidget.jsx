import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';


const ACAO_COLORS = {
  terminal_criado: 'bg-emerald-100 text-emerald-700',
  terminal_editado: 'bg-blue-100 text-blue-700',
  terminal_excluido: 'bg-red-100 text-red-700',
  terminal_verificado: 'bg-slate-100 text-slate-500',
  api_key_gerada: 'bg-amber-100 text-amber-700',
  usuario_convidado: 'bg-purple-100 text-purple-700',
  permissao_atualizada: 'bg-indigo-100 text-indigo-700',
};

const ACAO_SHORT = {
  terminal_criado: 'Criado',
  terminal_editado: 'Editado',
  terminal_excluido: 'Excluído',
  terminal_verificado: 'Verificado',
  api_key_gerada: 'API Key',
  usuario_convidado: 'Convite',
  permissao_atualizada: 'Permissão',
};

export default function RecentAuditWidget({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';

  const { data: logs = [] } = useQuery({
    queryKey: ['audit-widget', currentUser?.email],
    queryFn: () => isAdmin
      ? base44.entities.AuditLog.list('-timestamp', 10)
      : base44.entities.AuditLog.filter({ usuario_email: currentUser?.email }, '-timestamp', 10),
    enabled: !!currentUser,
    refetchInterval: 15000,
  });

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-slate-500" />
            Auditoria Recente
          </span>
          <Link to={createPageUrl('Auditoria')} className="text-xs font-normal text-blue-500 hover:underline normal-case">
            Ver tudo
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {logs.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Nenhum registro</p>
          )}
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <Badge className={`${ACAO_COLORS[log.acao] || 'bg-slate-100 text-slate-500'} text-xs px-1.5 py-0 shrink-0 mt-0.5`}>
                {ACAO_SHORT[log.acao] || log.acao}
              </Badge>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 truncate">{log.descricao || log.entidade}</p>
                <p className="text-xs text-slate-400 truncate">{log.usuario_email} · {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}