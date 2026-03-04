import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bell, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function AlertRulesWidget() {
  const { data: rules = [] } = useQuery({
    queryKey: ['alert-rules-widget'],
    queryFn: () => base44.entities.AlertRule.list('-created_date', 20),
    refetchInterval: 30000,
  });

  const active = rules.filter(r => r.ativo).length;
  const inactive = rules.length - active;

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-orange-500" />
            Regras de Alerta
          </span>
          <Link to={createPageUrl('Alertas')} className="text-xs font-normal text-blue-500 hover:underline normal-case">
            Ver todas
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-600">{active}</p>
            <p className="text-xs text-emerald-600 mt-0.5 flex items-center justify-center gap-1">
              <CheckCircle className="h-3 w-3" /> Ativas
            </p>
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-400">{inactive}</p>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" /> Inativas
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {rules.slice(0, 5).map(rule => (
            <div key={rule.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
              <span className="text-slate-600 truncate flex-1 mr-2">{rule.nome}</span>
              <Badge className={rule.ativo
                ? 'bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0'
                : 'bg-slate-100 text-slate-500 text-xs px-1.5 py-0'
              }>
                {rule.ativo ? 'Ativa' : 'Inativa'}
              </Badge>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-3">Nenhuma regra configurada</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}