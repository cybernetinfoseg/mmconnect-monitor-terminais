import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Key, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
import moment from 'moment';

export default function ApiKeyStatsWidget() {
  const { data: apiKeyLogs = [] } = useQuery({
    queryKey: ['api-key-logs'],
    queryFn: () => base44.entities.AuditLog.filter({ acao: 'api_key_gerada' }, '-timestamp', 50),
    refetchInterval: 30000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users-widget'],
    queryFn: () => base44.entities.User.list(),
    refetchInterval: 60000,
  });

  const usersWithKey = users.filter(u => u.api_key).length;
  const totalGenerated = apiKeyLogs.length;
  const last7Days = apiKeyLogs.filter(l =>
    moment(l.timestamp).isAfter(moment().subtract(7, 'days'))
  ).length;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Key className="h-4 w-4 text-amber-500" />
            API Keys
          </span>
          <Link to={createPageUrl('Administracao')} className="text-xs font-normal text-blue-500 hover:underline normal-case">
            Gerenciar
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{usersWithKey}</p>
            <p className="text-xs text-amber-600 mt-0.5">Com key</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-600">{totalGenerated}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total geradas</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{last7Days}</p>
            <p className="text-xs text-blue-600 mt-0.5">Últimos 7d</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Gerações recentes</p>
          {apiKeyLogs.slice(0, 4).map(log => (
            <div key={log.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
              <span className="text-slate-600 truncate flex-1 mr-2">{log.usuario_email}</span>
              <span className="text-slate-400 shrink-0">{moment(log.timestamp).fromNow()}</span>
            </div>
          ))}
          {apiKeyLogs.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">Nenhuma API Key gerada</p>
          )}
        </div>

        <div className="pt-1 flex items-center gap-2 text-xs text-slate-400">
          <Users className="h-3.5 w-3.5" />
          {users.length} usuário(s) cadastrado(s)
        </div>
      </CardContent>
    </Card>
  );
}