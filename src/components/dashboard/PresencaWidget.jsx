import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Building2, LogIn, AlertTriangle, CalendarOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PresencaWidget() {
  const { timezone } = useUserTimezone();

  const { data: marcacoes = [] } = useQuery({
    queryKey: ['presenca-widget-marcacoes'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 1000),
    refetchInterval: 30000,
  });

  const { data: ausencias = [] } = useQuery({
    queryKey: ['presenca-widget-ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 100),
    refetchInterval: 60000,
  });

  const stats = useMemo(() => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });

    const marcoesHoje = marcacoes.filter(m => {
      if (!m.timestamp) return false;
      return new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' }) === hoje;
    });

    const porColab = {};
    marcoesHoje.forEach(m => {
      if (!porColab[m.enrollid]) porColab[m.enrollid] = [];
      porColab[m.enrollid].push(m);
    });

    let dentro = 0, fora = 0;
    Object.values(porColab).forEach(mlist => {
      const sorted = [...mlist].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (sorted[sorted.length - 1].tipo === 'entrada') dentro++;
      else fora++;
    });

    const ausenciasHoje = ausencias.filter(a => a.data_inicio <= hoje && a.data_fim >= hoje && a.aprovado).length;

    return { dentro, fora, total: Object.keys(porColab).length, ausenciasHoje };
  }, [marcacoes, ausencias, timezone]);

  return (
    <Link to={createPageUrl('Presenca')} className="block group">
      <div className="bg-white/80 backdrop-blur-sm border border-slate-200/50 rounded-xl p-4 hover:border-emerald-300 hover:shadow-md transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Presença Hoje</span>
          </div>
          <span className="text-[10px] text-slate-400 group-hover:text-emerald-500 transition-colors">Ver tudo →</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 rounded-lg p-2">
            <p className="text-lg font-bold text-emerald-700">{stats.dentro}</p>
            <p className="text-[10px] text-emerald-600 flex items-center justify-center gap-0.5"><LogIn className="h-2.5 w-2.5" /> Dentro</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-600">{stats.total}</p>
            <p className="text-[10px] text-slate-500">Marcaram</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-lg font-bold text-orange-600">{stats.ausenciasHoje}</p>
            <p className="text-[10px] text-orange-500 flex items-center justify-center gap-0.5"><CalendarOff className="h-2.5 w-2.5" /> Ausentes</p>
          </div>
        </div>
      </div>
    </Link>
  );
}