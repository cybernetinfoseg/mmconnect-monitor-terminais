import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { calcularDia, fmtMin } from '@/lib/calculoHoras';
import { getDay } from 'date-fns';
import {
  Calendar, Search, RefreshCw, Download,
  AlertTriangle, CheckCircle2, XCircle, Clock, TrendingUp, Users
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  presente:  { label: 'Presente',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2, dot: 'bg-emerald-500' },
  atrasado:  { label: 'Atrasado',  color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: Clock,        dot: 'bg-amber-400' },
  faltou:    { label: 'Faltou',    color: 'bg-rose-100 text-rose-700 border-rose-200',          icon: XCircle,      dot: 'bg-rose-500' },
  ausencia:  { label: 'Ausência',  color: 'bg-blue-100 text-blue-700 border-blue-200',          icon: Calendar,     dot: 'bg-blue-400' },
  folga:     { label: 'Folga',     color: 'bg-slate-100 text-slate-600 border-slate-200',       icon: Calendar,     dot: 'bg-slate-400' },
};

function parseDias(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

function fmtHora(ts, tz) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('pt-PT', { timeZone: tz || 'UTC', hour: '2-digit', minute: '2-digit' });
}

export default function RelatorioPresencaDiaria() {
  const { timezone: userTimezone } = useUserTimezone();
  const [search, setSearch] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' })
  );
  const [currentUser, setCurrentUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';

  const { data: terminalUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['ponto-users', currentUser?.email, isAdmin],
    queryFn: () => isAdmin
      ? base44.entities.TerminalUser.list('nome', 500)
      : base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500),
    enabled: !!currentUser,
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['ponto-horarios'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });

  const { data: marcacoes = [], isLoading: loadingMarcacoes, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['ponto-marcacoes', selectedDate],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 2000),
    enabled: !!currentUser,
    refetchInterval: 60000,
  });

  const { data: ausencias = [] } = useQuery({
    queryKey: ['ponto-ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 300),
    enabled: !!currentUser,
  });

  const { data: escalasDia = [] } = useQuery({
    queryKey: ['ponto-escala', selectedDate],
    queryFn: () => base44.entities.EscalaDia.filter({ data: selectedDate }, '-created_date', 500),
    enabled: !!currentUser,
  });

  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  const ausenciaMap = useMemo(() => {
    const m = {};
    ausencias.forEach(a => {
      if (a.data_inicio <= selectedDate && a.data_fim >= selectedDate) {
        m[a.enrollid] = a;
      }
    });
    return m;
  }, [ausencias, selectedDate]);

  const escalaDiaMap = useMemo(() => {
    const m = {};
    escalasDia.forEach(e => { m[e.colaborador_id] = e; });
    return m;
  }, [escalasDia]);

  // Marcações do dia selecionado agrupadas por enrollid
  const marcacoesNoDia = useMemo(() => {
    const m = {};
    marcacoes.forEach(marc => {
      const diaTs = new Date(marc.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
      if (diaTs !== selectedDate) return;
      if (!m[marc.enrollid]) m[marc.enrollid] = [];
      m[marc.enrollid].push(marc);
    });
    return m;
  }, [marcacoes, selectedDate, userTimezone]);

  const dow = useMemo(() => getDay(new Date(selectedDate + 'T12:00:00')), [selectedDate]);

  // Construir linha por colaborador com horário
  const linhas = useMemo(() => {
    const result = [];
    terminalUsers.filter(u => u.ativo).forEach(u => {
      // Descobrir horário efectivo deste dia
      const escalaDia = escalaDiaMap[u.id];
      let horario = null;
      let tipoEscala = 'normal';

      if (escalaDia) {
        tipoEscala = escalaDia.tipo;
        if (escalaDia.tipo === 'normal' && escalaDia.horario_id) {
          horario = horarioMap[escalaDia.horario_id];
        } else if (escalaDia.tipo === 'folga' || escalaDia.tipo === 'ferias' || escalaDia.tipo === 'feriado') {
          horario = null;
        } else if (escalaDia.tipo === 'extra' && escalaDia.horario_id) {
          horario = horarioMap[escalaDia.horario_id];
        }
      } else {
        horario = u.horario_id ? horarioMap[u.horario_id] : null;
      }

      // Verificar se devia trabalhar hoje (horário tem este dia da semana)
      let deveTrabalhar = false;
      if (tipoEscala === 'folga' || tipoEscala === 'ferias' || tipoEscala === 'feriado') {
        deveTrabalhar = false;
      } else if (horario) {
        const dias = parseDias(horario.dias_semana);
        deveTrabalhar = dias.length === 0 || dias.includes(dow);
      }

      // Ausência activa
      const ausencia = ausenciaMap[u.enrollid];

      // Marcações do dia
      const marcs = marcacoesNoDia[u.enrollid] || [];

      // Só mostrar colaboradores que devem trabalhar, têm ausência, ou têm marcações
      if (!deveTrabalhar && !ausencia && marcs.length === 0) return;

      // Calcular métricas
      const calc = calcularDia(marcs, horario);
      const primeira = marcs.length > 0
        ? [...marcs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))[0]
        : null;
      const ultima = marcs.length > 0
        ? [...marcs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
        : null;

      // Determinar status
      let status;
      if (ausencia) {
        status = 'ausencia';
      } else if (tipoEscala === 'folga' || tipoEscala === 'ferias' || tipoEscala === 'feriado') {
        status = 'folga';
      } else if (marcs.length === 0 && deveTrabalhar) {
        status = 'faltou';
      } else if (calc.minutosAtraso > 0) {
        status = 'atrasado';
      } else {
        status = 'presente';
      }

      result.push({
        u, horario, calc, primeira, ultima, status,
        ausencia, tipoEscala, deveTrabalhar,
      });
    });

    // Ordenar: faltou/atrasado → presente → ausencia/folga
    const order = { faltou: 0, atrasado: 1, presente: 2, ausencia: 3, folga: 4 };
    return result.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || a.u.nome.localeCompare(b.u.nome));
  }, [terminalUsers, horarioMap, escalaDiaMap, ausenciaMap, marcacoesNoDia, dow]);

  // Resumo
  const summary = useMemo(() => ({
    total: linhas.length,
    faltou: linhas.filter(l => l.status === 'faltou').length,
    atrasado: linhas.filter(l => l.status === 'atrasado').length,
    presente: linhas.filter(l => l.status === 'presente').length,
    ausencia: linhas.filter(l => l.status === 'ausencia').length,
    folga: linhas.filter(l => l.status === 'folga').length,
    comExtra: linhas.filter(l => l.calc.minutosExtra > 0).length,
  }), [linhas]);

  // Filtro
  const filtered = useMemo(() => {
    return linhas.filter(l => {
      const matchStatus = filtroStatus === 'todos' || l.status === filtroStatus;
      const matchSearch = !search.trim() ||
        l.u.nome.toLowerCase().includes(search.toLowerCase()) ||
        String(l.u.enrollid).includes(search) ||
        (l.u.departamento || '').toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [linhas, filtroStatus, search]);

  const isLoading = loadingUsers || loadingMarcacoes;

  // Export CSV
  const exportCSV = () => {
    const headers = ['Nome', 'ID', 'Departamento', 'Horário', 'Status', 'Entrada Real', 'Saída Real', 'Entrada Prev.', 'Saída Prev.', 'Atraso', 'Horas Extra', 'Horas Efectivas'];
    const rows = filtered.map(l => [
      l.u.nome,
      l.u.enrollid,
      l.u.departamento || '',
      l.horario?.nome || '',
      STATUS_CONFIG[l.status]?.label || l.status,
      fmtHora(l.primeira?.timestamp, userTimezone),
      fmtHora(l.ultima?.tipo === 'saida' ? l.ultima?.timestamp : null, userTimezone),
      l.horario?.hora_entrada || '',
      l.horario?.hora_saida || '',
      l.calc.minutosAtraso > 0 ? fmtMin(l.calc.minutosAtraso) : '',
      l.calc.minutosExtra > 0 ? fmtMin(l.calc.minutosExtra) : '',
      fmtMin(l.calc.minutosEfetivos),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ponto_${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-100 rounded-xl shrink-0">
              <Calendar className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Relatório Diário de Ponto</h1>
              <p className="text-xs text-slate-500">
                Presenças, faltas, atrasos e horas extra por colaborador
                {dataUpdatedAt && ` · atualizado ${new Date(dataUpdatedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { key: 'total',    label: 'Total',      color: 'bg-slate-50 border-slate-200 text-slate-700',   val: summary.total },
            { key: 'presente', label: 'Presentes',  color: 'bg-emerald-50 border-emerald-200 text-emerald-700', val: summary.presente },
            { key: 'atrasado', label: 'Atrasados',  color: 'bg-amber-50 border-amber-200 text-amber-700',   val: summary.atrasado },
            { key: 'faltou',   label: 'Faltaram',   color: 'bg-rose-50 border-rose-200 text-rose-700',      val: summary.faltou },
            { key: 'ausencia', label: 'Ausências',  color: 'bg-blue-50 border-blue-200 text-blue-700',      val: summary.ausencia },
            { key: 'folga',    label: 'Folgas',     color: 'bg-slate-50 border-slate-300 text-slate-600',   val: summary.folga },
            { key: 'comExtra', label: 'Hora Extra', color: 'bg-violet-50 border-violet-200 text-violet-700',val: summary.comExtra },
          ].map(kpi => (
            <button
              key={kpi.key}
              onClick={() => setFiltroStatus(kpi.key === 'comExtra' || kpi.key === 'total' ? 'todos' : (filtroStatus === kpi.key ? 'todos' : kpi.key))}
              className={cn(
                'border rounded-xl p-3 text-center transition-all hover:shadow-sm',
                kpi.color,
                filtroStatus === kpi.key && 'ring-2 ring-offset-1 ring-violet-400'
              )}
            >
              <p className="text-xl font-bold">{kpi.val}</p>
              <p className="text-[11px] font-medium mt-0.5 opacity-80">{kpi.label}</p>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Pesquisar nome, ID ou departamento..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-white"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {['todos', 'faltou', 'atrasado', 'presente', 'ausencia', 'folga'].map(s => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg border transition-all font-medium',
                  filtroStatus === s
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                )}
              >
                {s === 'todos' ? 'Todos' : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sem dados para mostrar</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white shadow-sm">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="px-4 py-3 text-left">Colaborador</th>
                  <th className="px-3 py-3 text-left">Horário</th>
                  <th className="px-3 py-3 text-center">Estado</th>
                  <th className="px-3 py-3 text-center">Entrada Real</th>
                  <th className="px-3 py-3 text-center">Saída Real</th>
                  <th className="px-3 py-3 text-center">Entrada Prev.</th>
                  <th className="px-3 py-3 text-center">Saída Prev.</th>
                  <th className="px-3 py-3 text-center">Atraso</th>
                  <th className="px-3 py-3 text-center">Hora Extra</th>
                  <th className="px-3 py-3 text-center">Efectivas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(({ u, horario, calc, primeira, ultima, status, ausencia }) => {
                  const cfg = STATUS_CONFIG[status];
                  const Icon = cfg?.icon;
                  const saidaReal = ultima?.tipo === 'saida' ? ultima?.timestamp : null;
                  const aindaDentro = calc.aindaDentro && !saidaReal;
                  return (
                    <tr key={u.id} className={cn('hover:bg-slate-50 transition-colors', status === 'faltou' && 'bg-rose-50/40')}>
                      {/* Nome */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', cfg?.dot)} />
                          <div>
                            <p className="font-semibold text-slate-800">{u.nome}</p>
                            <p className="text-[10px] text-slate-400">#{u.enrollid}{u.departamento ? ` · ${u.departamento}` : ''}</p>
                          </div>
                        </div>
                      </td>

                      {/* Horário */}
                      <td className="px-3 py-3 text-slate-500">
                        {horario
                          ? <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: horario.cor || '#8b5cf6' }} />
                              {horario.nome}
                            </span>
                          : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Estado */}
                      <td className="px-3 py-3 text-center">
                        <Badge className={cn('text-[10px] px-2 py-0.5 border gap-1', cfg?.color)}>
                          {Icon && <Icon className="h-3 w-3" />}
                          {cfg?.label || status}
                        </Badge>
                        {ausencia && (
                          <p className="text-[9px] text-blue-500 mt-0.5">{ausencia.tipo}</p>
                        )}
                      </td>

                      {/* Entrada real */}
                      <td className="px-3 py-3 text-center font-mono text-slate-700">
                        {primeira ? fmtHora(primeira.timestamp, userTimezone) : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Saída real */}
                      <td className="px-3 py-3 text-center font-mono text-slate-700">
                        {aindaDentro
                          ? <span className="text-emerald-500 animate-pulse text-[10px]">● dentro</span>
                          : saidaReal
                            ? fmtHora(saidaReal, userTimezone)
                            : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Entrada prevista */}
                      <td className="px-3 py-3 text-center text-slate-400 font-mono">
                        {horario?.hora_entrada || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Saída prevista */}
                      <td className="px-3 py-3 text-center text-slate-400 font-mono">
                        {horario?.hora_saida || <span className="text-slate-200">—</span>}
                      </td>

                      {/* Atraso */}
                      <td className="px-3 py-3 text-center">
                        {calc.minutosAtraso > 0
                          ? <span className="font-semibold text-amber-600">+{fmtMin(calc.minutosAtraso)}</span>
                          : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Hora extra */}
                      <td className="px-3 py-3 text-center">
                        {calc.minutosExtra > 0
                          ? <span className="font-semibold text-violet-600 flex items-center justify-center gap-0.5">
                              <TrendingUp className="h-3 w-3" />{fmtMin(calc.minutosExtra)}
                            </span>
                          : <span className="text-slate-200">—</span>}
                      </td>

                      {/* Horas efectivas */}
                      <td className="px-3 py-3 text-center text-slate-600 font-semibold">
                        {calc.minutosEfetivos > 0 ? fmtMin(calc.minutosEfetivos) : <span className="text-slate-200">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}