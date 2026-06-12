import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Building2, LogIn, AlertTriangle, CalendarOff, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getDay } from 'date-fns';

export default function PresencaWidget() {
  const { timezone } = useUserTimezone();

  const { data: marcacoes = [] } = useQuery({
    queryKey: ['presenca-widget-marcacoes'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 1000),
    refetchInterval: 30000,
  });

  const { data: ausencias = [] } = useQuery({
    queryKey: ['presenca-widget-ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 200),
    refetchInterval: 60000,
  });

  const { data: terminalUsers = [] } = useQuery({
    queryKey: ['presenca-widget-users'],
    queryFn: () => base44.entities.TerminalUser.list('nome', 500),
    refetchInterval: 120000,
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['presenca-widget-horarios'],
    queryFn: () => base44.entities.Horario.list('nome'),
  });

  const stats = useMemo(() => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' });
    const dowHoje = getDay(new Date());

    const marcoesHoje = marcacoes.filter(m => {
      if (!m.timestamp) return false;
      return new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: timezone || 'UTC' }) === hoje;
    });

    const porColab = {};
    marcoesHoje.forEach(m => {
      if (!porColab[m.enrollid]) porColab[m.enrollid] = [];
      porColab[m.enrollid].push(m);
    });

    let dentro = 0;
    Object.values(porColab).forEach(mlist => {
      const sorted = [...mlist].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (sorted[sorted.length - 1].tipo === 'entrada') dentro++;
    });

    const ausenciasMap = {};
    ausencias.filter(a => a.data_inicio <= hoje && a.data_fim >= hoje).forEach(a => { ausenciasMap[a.enrollid] = a; });

    const horarioMap = {};
    horarios.forEach(h => { horarioMap[h.id] = h; });

    const enrollidsComMarcacao = new Set(Object.keys(porColab).map(Number));
    const naoMarcaram = terminalUsers.filter(u => {
      if (!u.ativo) return false;
      if (enrollidsComMarcacao.has(u.enrollid)) return false;
      if (ausenciasMap[u.enrollid]) return false;
      if (!u.horario_id) return false;
      const h = horarioMap[u.horario_id];
      if (!h) return false;
      const dias = (() => { try { return JSON.parse(h.dias_semana || '[]'); } catch { return []; } })();
      return dias.length === 0 || dias.includes(dowHoje);
    }).length;

    const ausenciasHoje = Object.keys(ausenciasMap).length;

    return { dentro, total: Object.keys(porColab).length, ausenciasHoje, naoMarcaram };
  }, [marcacoes, ausencias, timezone, terminalUsers, horarios]);

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
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-emerald-50 rounded-lg p-2">
            <p className="text-lg font-bold text-emerald-700">{stats.dentro}</p>
            <p className="text-[10px] text-emerald-600 flex items-center justify-center gap-0.5"><LogIn className="h-2.5 w-2.5" /> Dentro</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-600">{stats.total}</p>
            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5"><Users className="h-2.5 w-2.5" /> Marcaram</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-2">
            <p className="text-lg font-bold text-orange-600">{stats.ausenciasHoje}</p>
            <p className="text-[10px] text-orange-500 flex items-center justify-center gap-0.5"><CalendarOff className="h-2.5 w-2.5" /> Ausentes</p>
          </div>
          <div className={`rounded-lg p-2 ${stats.naoMarcaram > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
            <p className={`text-lg font-bold ${stats.naoMarcaram > 0 ? 'text-red-600' : 'text-slate-400'}`}>{stats.naoMarcaram}</p>
            <p className={`text-[10px] flex items-center justify-center gap-0.5 ${stats.naoMarcaram > 0 ? 'text-red-500' : 'text-slate-400'}`}>
              <AlertTriangle className="h-2.5 w-2.5" /> Faltam
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}