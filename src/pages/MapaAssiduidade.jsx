import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { calcularDia } from '@/lib/calculoHoras';
import { LayoutGrid, Search, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  format, getDaysInMonth, startOfMonth, addMonths, subMonths,
  getDay, eachDayOfInterval, isWeekend, isSameDay
} from 'date-fns';
import { pt } from 'date-fns/locale';

const SYMBOL = {
  presente:  { s: 'P', cls: 'bg-emerald-500 text-white', title: 'Presente' },
  atrasado:  { s: 'A', cls: 'bg-amber-400 text-white', title: 'Atrasado' },
  faltou:    { s: 'F', cls: 'bg-red-500 text-white', title: 'Falta' },
  ausencia:  { s: 'O', cls: 'bg-blue-400 text-white', title: 'Ausência' },
  ferias:    { s: 'V', cls: 'bg-teal-400 text-white', title: 'Férias' },
  folga:     { s: 'D', cls: 'bg-slate-300 text-slate-600', title: 'Folga' },
  feriado:   { s: 'FE', cls: 'bg-purple-300 text-purple-800', title: 'Feriado' },
  weekend:   { s: '', cls: 'bg-slate-100', title: 'Fim de semana' },
  sem_turno: { s: '—', cls: 'bg-slate-50 text-slate-300', title: 'Sem turno' },
  extra:     { s: 'E', cls: 'bg-violet-400 text-white', title: 'Horas Extra' },
};

function parseDias(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

export default function MapaAssiduidade() {
  const { timezone: userTimezone } = useUserTimezone();
  const [currentUser, setCurrentUser] = useState(null);
  const [mesBase, setMesBase] = useState(startOfMonth(new Date()));
  const [search, setSearch] = useState('');
  const [depFilter, setDepFilter] = useState('all');

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';

  const anoMes = format(mesBase, 'yyyy-MM');
  const numDias = getDaysInMonth(mesBase);
  const dias = eachDayOfInterval({ start: mesBase, end: new Date(mesBase.getFullYear(), mesBase.getMonth(), numDias) });

  const { data: terminalUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['mapa-users', currentUser?.email, isAdmin],
    queryFn: () => isAdmin
      ? base44.entities.TerminalUser.list('nome', 500)
      : base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500),
    enabled: !!currentUser,
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['mapa-horarios'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });

  const { data: marcacoes = [], isLoading: loadingMarc } = useQuery({
    queryKey: ['mapa-marcacoes', anoMes],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 5000),
    enabled: !!currentUser,
  });

  const { data: ausencias = [] } = useQuery({
    queryKey: ['mapa-ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 500),
    enabled: !!currentUser,
  });

  const { data: escalasDia = [] } = useQuery({
    queryKey: ['mapa-escala', anoMes],
    queryFn: () => base44.entities.EscalaDia.list('-data', 2000),
    enabled: !!currentUser,
  });

  const horarioMap = useMemo(() => Object.fromEntries(horarios.map(h => [h.id, h])), [horarios]);

  const marcMap = useMemo(() => {
    const m = {};
    marcacoes.forEach(marc => {
      const dia = new Date(marc.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
      if (!dia.startsWith(anoMes)) return;
      const key = `${marc.enrollid}_${dia}`;
      if (!m[key]) m[key] = [];
      m[key].push(marc);
    });
    return m;
  }, [marcacoes, anoMes, userTimezone]);

  const ausenciasPorEnrollid = useMemo(() => {
    const m = {};
    ausencias.forEach(a => { if (!m[a.enrollid]) m[a.enrollid] = []; m[a.enrollid].push(a); });
    return m;
  }, [ausencias]);

  const escalaMap = useMemo(() => {
    const m = {};
    escalasDia.forEach(e => { m[`${e.colaborador_id}_${e.data}`] = e; });
    return m;
  }, [escalasDia]);

  const departamentos = useMemo(() => [...new Set(terminalUsers.map(u => u.departamento).filter(Boolean))].sort(), [terminalUsers]);

  const users = useMemo(() => terminalUsers.filter(u => {
    if (!u.ativo) return false;
    if (search && !u.nome?.toLowerCase().includes(search.toLowerCase()) && !String(u.enrollid).includes(search)) return false;
    if (depFilter !== 'all' && u.departamento !== depFilter) return false;
    return true;
  }), [terminalUsers, search, depFilter]);

  const getStatus = (user, dia) => {
    const dStr = format(dia, 'yyyy-MM-dd');
    const dow = getDay(dia);
    const escala = escalaMap[`${user.id}_${dStr}`];
    if (escala?.tipo === 'ferias') return 'ferias';
    if (escala?.tipo === 'feriado') return 'feriado';
    if (escala?.tipo === 'folga') return 'folga';
    const aus = (ausenciasPorEnrollid[user.enrollid] || []).find(a => a.data_inicio <= dStr && a.data_fim >= dStr);
    if (aus) return aus.tipo === 'ferias' ? 'ferias' : 'ausencia';
    if (isWeekend(dia)) return 'weekend';
    const horario = escala?.horario_id ? horarioMap[escala.horario_id] : user.horario_id ? horarioMap[user.horario_id] : null;
    if (!horario) return 'sem_turno';
    const diasTurno = parseDias(horario.dias_semana);
    if (diasTurno.length > 0 && !diasTurno.includes(dow)) return 'folga';
    const marcs = marcMap[`${user.enrollid}_${dStr}`] || [];
    if (marcs.length === 0) return dia <= new Date() ? 'faltou' : 'sem_turno';
    const calc = calcularDia(marcs, horario);
    if (calc.minutosExtra > 0 && calc.minutosAtraso === 0) return 'extra';
    if (calc.minutosAtraso > 0) return 'atrasado';
    return 'presente';
  };

  const resumoPorUser = useMemo(() => {
    const m = {};
    users.forEach(u => {
      let presentes = 0, faltas = 0, atrasos = 0;
      dias.forEach(dia => {
        const s = getStatus(u, dia);
        if (s === 'presente' || s === 'extra') presentes++;
        else if (s === 'atrasado') { presentes++; atrasos++; }
        else if (s === 'faltou') faltas++;
      });
      m[u.id] = { presentes, faltas, atrasos };
    });
    return m;
  }, [users, dias]);

  const exportCSV = () => {
    const header = ['Colaborador', 'ID', ...dias.map(d => format(d, 'dd'))];
    const rows = users.map(u => [u.nome, u.enrollid, ...dias.map(d => SYMBOL[getStatus(u, d)]?.s || '')]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `mapa_${anoMes}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const isLoading = loadingUsers || loadingMarc;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-xl"><LayoutGrid className="h-5 w-5 text-indigo-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Mapa Mensal de Assiduidade</h1>
              <p className="text-xs text-slate-500">{format(mesBase, 'MMMM yyyy', { locale: pt })} · {users.length} colaborador(es)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setMesBase(subMonths(mesBase, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium text-slate-700 min-w-[120px] text-center">{format(mesBase, 'MMMM yyyy', { locale: pt })}</span>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setMesBase(addMonths(mesBase, 1))}><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" /> CSV</Button>
          </div>
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(SYMBOL).filter(([k]) => k !== 'weekend').map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className={cn('w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center', v.cls)}>{v.s}</span>
              <span className="text-xs text-slate-500">{v.title}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          <Select value={depFilter} onValueChange={setDepFilter}>
            <SelectTrigger className="bg-white w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os departamentos</SelectItem>
              {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : users.length === 0 ? (
          <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><LayoutGrid className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>Nenhum colaborador encontrado</p></CardContent></Card>
        ) : (
          <Card className="bg-white border-slate-200 overflow-x-auto">
            <table className="text-xs border-collapse" style={{ minWidth: `${180 + numDias * 28}px` }}>
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 border-b border-r border-slate-200 min-w-[160px]">Colaborador</th>
                  {dias.map(d => (
                    <th key={d.toISOString()} className={cn('px-0.5 py-2 text-center border-b border-slate-200 w-7 font-semibold', isWeekend(d) ? 'text-slate-300' : 'text-slate-500', isSameDay(d, new Date()) ? 'bg-indigo-50' : '')}>
                      <div>{format(d, 'd')}</div>
                      <div className="text-[8px] uppercase">{format(d, 'EEE', { locale: pt })}</div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center border-b border-l border-slate-200 font-semibold text-slate-500 text-[10px]">Pres.</th>
                  <th className="px-2 py-2 text-center border-b border-slate-200 font-semibold text-slate-500 text-[10px]">Falt.</th>
                  <th className="px-2 py-2 text-center border-b border-slate-200 font-semibold text-slate-500 text-[10px]">Atr.</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const resumo = resumoPorUser[u.id] || {};
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white hover:bg-slate-50 px-3 py-1.5 border-r border-slate-200 font-medium text-slate-700">
                        <p className="truncate max-w-[155px]">{u.nome}</p>
                        {u.departamento && <p className="text-[9px] text-slate-400 truncate">{u.departamento}</p>}
                      </td>
                      {dias.map(d => {
                        const s = getStatus(u, d);
                        const sym = SYMBOL[s] || SYMBOL.sem_turno;
                        return (
                          <td key={d.toISOString()} className={cn('border border-slate-100 text-center p-0', isSameDay(d, new Date()) ? 'ring-1 ring-inset ring-indigo-300' : '')}>
                            <div className={cn('w-6 h-6 mx-auto rounded text-[9px] font-bold flex items-center justify-center', sym.cls)} title={sym.title}>{sym.s}</div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-center border-l border-slate-200 font-semibold text-emerald-600">{resumo.presentes || 0}</td>
                      <td className="px-2 py-1.5 text-center font-semibold text-red-500">{resumo.faltas || 0}</td>
                      <td className="px-2 py-1.5 text-center font-semibold text-amber-500">{resumo.atrasos || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
}