import React, { useState, useMemo } from 'react';
import {
  Search, Filter, Users,
  ChevronLeft, ChevronRight, RefreshCw,
  SortAsc, SortDesc, X, Check, Zap, Pencil, Printer
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { addDays, startOfWeek, format, isToday, addWeeks, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import EscalaEditModal from './EscalaEditModal';
import EscalaImpressao from './EscalaImpressao';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getWeekDays(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

function parseDias(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

export default function EscalaTrabalho({ colaboradores, horarios, onAssign, assigningId, ownerEmail }) {
  const [editModalColab, setEditModalColab] = useState(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState('');
  const [filterDep, setFilterDep] = useState('all');
  const [filterHorario, setFilterHorario] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all | com | sem
  const [sortField, setSortField] = useState('nome');
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(new Set()); // selected colaborador ids
  const [bulkHorario, setBulkHorario] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printColabs, setPrintColabs] = useState([]); // colaboradores a imprimir

  // Carregar todas as EscalaDia para uso na impressão
  const { data: todasEscalas = [] } = useQuery({
    queryKey: ['escala-dia-todas'],
    queryFn: () => base44.entities.EscalaDia.list('-data', 2000),
  });

  // Mapa: colaborador_id → { dateStr → escala }
  const escalaDiaMap = useMemo(() => {
    const m = {};
    todasEscalas.forEach(e => {
      if (!m[e.colaborador_id]) m[e.colaborador_id] = {};
      m[e.colaborador_id][e.data] = e;
    });
    return m;
  }, [todasEscalas]);

  const openPrint = (colabs) => {
    setPrintColabs(colabs);
    setPrintModalOpen(true);
  };

  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  const departamentos = useMemo(() => {
    const set = new Set(colaboradores.map(c => c.departamento).filter(Boolean));
    return Array.from(set).sort();
  }, [colaboradores]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = colaboradores.filter(c => {
      const matchSearch = !search ||
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        String(c.enrollid).includes(search);
      const matchDep = filterDep === 'all' || c.departamento === filterDep;
      const matchHorario = filterHorario === 'all' || c.horario_id === filterHorario;
      const matchStatus = filterStatus === 'all' ||
        (filterStatus === 'com' && !!c.horario_id) ||
        (filterStatus === 'sem' && !c.horario_id);
      return matchSearch && matchDep && matchHorario && matchStatus;
    });

    list.sort((a, b) => {
      let va = sortField === 'nome' ? a.nome : sortField === 'enrollid' ? a.enrollid : (a.departamento || '');
      let vb = sortField === 'nome' ? b.nome : sortField === 'enrollid' ? b.enrollid : (b.departamento || '');
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [colaboradores, search, filterDep, filterHorario, filterStatus, sortField, sortDir]);

  const stats = useMemo(() => {
    const com = colaboradores.filter(c => c.horario_id).length;
    return { total: colaboradores.length, com, sem: colaboradores.length - com };
  }, [colaboradores]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  };

  const applyBulk = async () => {
    if (!bulkHorario || selected.size === 0) return;
    setApplyingBulk(true);
    const ids = Array.from(selected);
    for (const id of ids) {
      await onAssign(id, bulkHorario === 'none' ? '' : bulkHorario);
    }
    setSelected(new Set());
    setBulkHorario('');
    setApplyingBulk(false);
  };

  const clearFilters = () => {
    setSearch('');
    setFilterDep('all');
    setFilterHorario('all');
    setFilterStatus('all');
  };

  const hasFilters = search || filterDep !== 'all' || filterHorario !== 'all' || filterStatus !== 'all';

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <SortAsc className="h-3 w-3 text-slate-300" />;
    return sortDir === 'asc'
      ? <SortAsc className="h-3 w-3 text-violet-500" />
      : <SortDesc className="h-3 w-3 text-violet-500" />;
  };

  return (
    <div className="space-y-4">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-slate-700">{stats.total}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Total</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">{stats.com}</p>
          <p className="text-[11px] text-emerald-500 mt-0.5">Com Turno</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{stats.sem}</p>
          <p className="text-[11px] text-amber-500 mt-0.5">Sem Turno</p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nome ou ID do colaborador..."
              className="pl-8 h-8 text-xs bg-white"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Departamento */}
          <Select value={filterDep} onValueChange={setFilterDep}>
            <SelectTrigger className="h-8 text-xs w-[150px] bg-white">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os depto.</SelectItem>
              {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Horário */}
          <Select value={filterHorario} onValueChange={setFilterHorario}>
            <SelectTrigger className="h-8 text-xs w-[160px] bg-white">
              <SelectValue placeholder="Filtrar turno" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os turnos</SelectItem>
              {horarios.map(h => (
                <SelectItem key={h.id} value={h.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
                    {h.nome}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 text-xs w-[130px] bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="com">Com horário</SelectItem>
              <SelectItem value="sem">Sem horário</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500 gap-1" onClick={clearFilters}>
              <X className="h-3 w-3" /> Limpar
            </Button>
          )}
        </div>

        {/* Result count */}
        <p className="text-[11px] text-slate-400 flex items-center gap-1">
          <Filter className="h-3 w-3" />
          {filtered.length} colaborador(es) {hasFilters ? 'filtrado(s)' : ''}
          {selected.size > 0 && <span className="ml-1 text-violet-600 font-semibold">• {selected.size} selecionado(s)</span>}
        </p>
      </div>

      {/* Bulk assign bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl flex-wrap">
          <Zap className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="text-xs font-semibold text-violet-700">{selected.size} selecionado(s)</span>
          <Select value={bulkHorario} onValueChange={setBulkHorario}>
            <SelectTrigger className="h-7 text-xs w-[200px] bg-white border-violet-300">
              <SelectValue placeholder="Escolher turno em massa..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Remover horário —</SelectItem>
              {horarios.map(h => (
                <SelectItem key={h.id} value={h.id}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
                    {h.nome} ({h.hora_entrada}–{h.hora_saida})
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-7 text-xs bg-violet-600 hover:bg-violet-700 gap-1"
            disabled={!bulkHorario || applyingBulk}
            onClick={applyBulk}
          >
            {applyingBulk ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Aplicar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-violet-300 text-violet-700 hover:bg-violet-100 gap-1"
            onClick={() => openPrint(filtered.filter(c => selected.has(c.id)))}
          >
            <Printer className="h-3 w-3" />
            Imprimir selecionados
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Week navigation + print all */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setWeekStart(w => subWeeks(w, 1))} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
          <ChevronLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-700">
            {format(weekDays[0], "d MMM", { locale: ptBR })} – {format(weekDays[6], "d MMM yyyy", { locale: ptBR })}
          </p>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="text-[10px] text-violet-500 hover:underline"
          >
            Semana atual
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setWeekStart(w => addWeeks(w, 1))} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100">
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 border-slate-300 text-slate-600"
            onClick={() => openPrint(filtered)}
            title="Imprimir escala dos colaboradores visíveis"
          >
            <Printer className="h-3 w-3" />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </div>

      {/* Main table */}
      <div className="rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* Select all */}
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 w-3.5 h-3.5 accent-violet-600"
                />
              </th>
              {/* Colaborador */}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 whitespace-nowrap min-w-[160px]">
                <button className="flex items-center gap-1 hover:text-slate-800" onClick={() => toggleSort('nome')}>
                  Colaborador <SortIcon field="nome" />
                </button>
              </th>
              {/* ID */}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-16">
                <button className="flex items-center gap-1 hover:text-slate-800" onClick={() => toggleSort('enrollid')}>
                  ID <SortIcon field="enrollid" />
                </button>
              </th>
              {/* Depto */}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 hidden sm:table-cell">
                <button className="flex items-center gap-1 hover:text-slate-800" onClick={() => toggleSort('departamento')}>
                  Depto. <SortIcon field="departamento" />
                </button>
              </th>
              {/* Turno atribuído */}
              <th className="px-3 py-2.5 text-left font-semibold text-slate-600 min-w-[180px]">
                Turno Atribuído
              </th>
              {/* Editar escala */}
              <th className="px-3 py-2.5 w-10"></th>
              {/* Days of week */}
              {weekDays.map((day, i) => (
                <th key={i} className={cn(
                  'px-1.5 py-2.5 text-center font-semibold w-12',
                  isToday(day) ? 'text-violet-600' : 'text-slate-500'
                )}>
                  <div>{DIAS_CURTOS[day.getDay()]}</div>
                  <div className={cn(
                    'text-[10px] font-normal',
                    isToday(day) ? 'text-violet-400' : 'text-slate-300'
                  )}>
                    {format(day, 'd/M')}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-10 text-slate-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Nenhum colaborador encontrado
                </td>
              </tr>
            ) : filtered.map(c => {
              const horarioAtual = c.horario_id ? horarioMap[c.horario_id] : null;
              const diasAtivos = horarioAtual ? parseDias(horarioAtual.dias_semana) : [];
              const isSelected = selected.has(c.id);
              const isAssigning = assigningId === c.id;

              return (
                <tr
                  key={c.id}
                  className={cn(
                    'transition-colors',
                    isSelected ? 'bg-violet-50' : 'hover:bg-slate-50',
                    isAssigning && 'opacity-50'
                  )}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded border-slate-300 w-3.5 h-3.5 accent-violet-600"
                    />
                  </td>

                  {/* Nome */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 text-white"
                        style={{ backgroundColor: horarioAtual?.cor || '#cbd5e1' }}
                      >
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <p className="font-medium text-slate-800 truncate max-w-[120px]">{c.nome}</p>
                    </div>
                  </td>

                  {/* ID */}
                  <td className="px-3 py-2.5 font-mono text-slate-400">
                    #{c.enrollid}
                  </td>

                  {/* Depto */}
                  <td className="px-3 py-2.5 text-slate-500 hidden sm:table-cell truncate max-w-[100px]">
                    {c.departamento || <span className="text-slate-200">—</span>}
                  </td>

                  {/* Turno select */}
                  <td className="px-3 py-2.5">
                    <Select
                      value={c.horario_id || 'none'}
                      onValueChange={val => onAssign(c.id, val === 'none' ? '' : val)}
                      disabled={isAssigning}
                    >
                      <SelectTrigger className={cn(
                        'h-7 text-[11px] w-[175px]',
                        horarioAtual ? 'border-violet-200 bg-violet-50 text-violet-800' : 'text-slate-400'
                      )}>
                        <SelectValue placeholder="— Sem turno —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sem turno —</SelectItem>
                        {horarios.map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
                              {h.nome} ({h.hora_entrada}–{h.hora_saida})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Editar + imprimir individual */}
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditModalColab(c)}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 transition-colors"
                        title="Editar escala semanal/mensal"
                      >
                        <Pencil className="h-3 w-3 text-slate-400" />
                      </button>
                      <button
                        onClick={() => openPrint([c])}
                        className="p-1 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                        title="Imprimir escala deste colaborador"
                      >
                        <Printer className="h-3 w-3 text-slate-400" />
                      </button>
                    </div>
                  </td>

                  {/* Day cells */}
                  {weekDays.map((day, i) => {
                    const dow = day.getDay();
                    const escalado = diasAtivos.includes(dow);
                    const today = isToday(day);
                    return (
                      <td key={i} className={cn(
                        'text-center px-1 py-2',
                        today ? 'bg-violet-50/40' : ''
                      )}>
                        {escalado ? (
                          <div
                            className="w-6 h-6 rounded-full mx-auto flex items-center justify-center shadow-sm"
                            style={{ backgroundColor: horarioAtual?.cor || '#8b5cf6' }}
                            title={`${horarioAtual?.hora_entrada}–${horarioAtual?.hora_saida}`}
                          >
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full mx-auto bg-slate-100 flex items-center justify-center">
                            <span className="text-slate-200 text-[8px]">—</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editModalColab && (
        <EscalaEditModal
          colaborador={editModalColab}
          horarios={horarios}
          open={!!editModalColab}
          onClose={() => setEditModalColab(null)}
          ownerEmail={ownerEmail}
        />
      )}

      {/* Impressão modal */}
      {printModalOpen && (
        <EscalaImpressao
          colaboradores={printColabs}
          horarios={horarios}
          escalaDiaMap={escalaDiaMap}
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          titulo="Escala de Trabalho"
        />
      )}

      {/* Legend */}
      {horarios.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {horarios.map(h => {
            const count = colaboradores.filter(c => c.horario_id === h.id).length;
            return (
              <div
                key={h.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600 cursor-pointer hover:border-violet-300 transition-colors"
                onClick={() => setFilterHorario(filterHorario === h.id ? 'all' : h.id)}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
                <span className="font-medium">{h.nome}</span>
                <span className="text-slate-400">{h.hora_entrada}–{h.hora_saida}</span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}