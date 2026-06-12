import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft, ChevronRight, Calendar, Loader2, Check, X, Coffee, Sun, Palmtree, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday, getDay, parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

const TIPO_CONFIG = {
  normal:   { label: 'Normal', color: null,       icon: null },
  folga:    { label: 'Folga',  color: '#94a3b8',  icon: Coffee },
  ferias:   { label: 'Férias', color: '#f59e0b',  icon: Palmtree },
  feriado:  { label: 'Feriado',color: '#3b82f6',  icon: Star },
  extra:    { label: 'Extra',  color: '#10b981',  icon: Sun },
};

function parseDias(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

export default function EscalaEditModal({ colaborador, horarios, open, onClose, ownerEmail }) {
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingDay, setEditingDay] = useState(null); // { date, escala }
  const [editForm, setEditForm] = useState({ horario_id: '', tipo: 'normal', observacao: '' });
  const queryClient = useQueryClient();

  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  // Date range to fetch
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      return { rangeStart: format(ws, 'yyyy-MM-dd'), rangeEnd: format(addDays(ws, 6), 'yyyy-MM-dd') };
    } else {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return { rangeStart: format(ms, 'yyyy-MM-dd'), rangeEnd: format(me, 'yyyy-MM-dd') };
    }
  }, [viewMode, currentDate]);

  const { data: escalas = [], isLoading } = useQuery({
    queryKey: ['escala-dia', colaborador?.id, rangeStart, rangeEnd],
    queryFn: () => base44.entities.EscalaDia.filter({ colaborador_id: colaborador.id }),
    enabled: !!colaborador && open,
    select: data => data.filter(e => e.data >= rangeStart && e.data <= rangeEnd),
  });

  const escalaDiaMap = useMemo(() => {
    const m = {};
    escalas.forEach(e => { m[e.data] = e; });
    return m;
  }, [escalas]);

  const saveMutation = useMutation({
    mutationFn: async ({ date, horario_id, tipo, observacao }) => {
      const existing = escalas.find(e => e.data === date);
      const payload = {
        colaborador_id: colaborador.id,
        enrollid: colaborador.enrollid,
        colaborador_nome: colaborador.nome,
        data: date,
        horario_id: horario_id || '',
        tipo,
        observacao,
        owner_email: ownerEmail,
      };
      if (existing) return base44.entities.EscalaDia.update(existing.id, payload);
      return base44.entities.EscalaDia.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['escala-dia', colaborador?.id]);
      toast.success('Dia atualizado');
      setEditingDay(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (date) => {
      const existing = escalas.find(e => e.data === date);
      if (existing) return base44.entities.EscalaDia.delete(existing.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['escala-dia', colaborador?.id]);
      toast.success('Escala do dia removida (voltou ao padrão)');
      setEditingDay(null);
    },
  });

  // Get horario for a day (specific override > turno base do colaborador)
  const getHorarioDia = (dateStr) => {
    const escala = escalaDiaMap[dateStr];
    if (escala) return { horario: horarioMap[escala.horario_id] || null, tipo: escala.tipo, custom: true, escala };
    // Fallback: turno padrão do colaborador
    const dow = getDay(parseISO(dateStr));
    if (colaborador?.horario_id) {
      const h = horarioMap[colaborador.horario_id];
      if (h) {
        const dias = parseDias(h.dias_semana);
        if (dias.includes(dow)) return { horario: h, tipo: 'normal', custom: false, escala: null };
      }
    }
    return { horario: null, tipo: null, custom: false, escala: null };
  };

  const openEdit = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const { horario, tipo, escala } = getHorarioDia(dateStr);
    setEditingDay({ date, dateStr });
    setEditForm({
      horario_id: escala?.horario_id || colaborador?.horario_id || '',
      tipo: escala?.tipo || tipo || 'normal',
      observacao: escala?.observacao || '',
    });
  };

  // Build days to render
  const days = useMemo(() => {
    if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    } else {
      const ms = startOfMonth(currentDate);
      const start = startOfWeek(ms, { weekStartsOn: 1 });
      const me = endOfMonth(currentDate);
      const end = endOfWeek(me, { weekStartsOn: 1 });
      const result = [];
      let d = start;
      while (d <= end) { result.push(d); d = addDays(d, 1); }
      return result;
    }
  }, [viewMode, currentDate]);

  const prev = () => viewMode === 'week'
    ? setCurrentDate(d => addDays(startOfWeek(d, { weekStartsOn: 1 }), -7))
    : setCurrentDate(d => subMonths(d, 1));

  const next = () => viewMode === 'week'
    ? setCurrentDate(d => addDays(startOfWeek(d, { weekStartsOn: 1 }), 7))
    : setCurrentDate(d => addMonths(d, 1));

  const DIAS_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  if (!colaborador) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
              style={{ backgroundColor: horarioMap[colaborador.horario_id]?.cor || '#8b5cf6' }}
            >
              {colaborador.nome.charAt(0)}
            </div>
            Escala — {colaborador.nome}
            <span className="text-slate-400 font-normal text-xs ml-1">#{colaborador.enrollid}</span>
          </DialogTitle>
        </DialogHeader>

        {/* View mode toggle + navigation */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                viewMode === 'week' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}
            >Semana</button>
            <button
              onClick={() => setViewMode('month')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                viewMode === 'month' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}
            >Mês</button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={prev} className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700 min-w-[140px] text-center">
              {viewMode === 'week'
                ? `${format(days[0], "d MMM", { locale: ptBR })} – ${format(days[6], "d MMM yyyy", { locale: ptBR })}`
                : format(currentDate, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button onClick={next} className="p-1 rounded-lg border border-slate-200 hover:bg-slate-100">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-[11px] text-violet-500 hover:underline px-1"
            >hoje</button>
          </div>
        </div>

        {/* Turno padrão info */}
        {colaborador.horario_id && horarioMap[colaborador.horario_id] && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: horarioMap[colaborador.horario_id]?.cor }} />
            <span>Turno padrão: <strong>{horarioMap[colaborador.horario_id]?.nome}</strong></span>
            <span className="text-slate-400">{horarioMap[colaborador.horario_id]?.hora_entrada}–{horarioMap[colaborador.horario_id]?.hora_saida}</span>
            <span className="ml-auto text-slate-300">Clique em qualquer dia para editar</span>
          </div>
        )}

        {/* Calendar grid */}
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-violet-400" /></div>
        ) : (
          <div>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-1">
              {DIAS_HEADER.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-slate-400 py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, i) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const { horario, tipo, custom } = getHorarioDia(dateStr);
                const inMonth = viewMode === 'week' || isSameMonth(day, currentDate);
                const tipoConfig = TIPO_CONFIG[tipo] || {};
                const TipoIcon = tipoConfig.icon;
                const bgColor = tipo === 'normal' ? horario?.cor : tipoConfig.color;

                return (
                  <button
                    key={i}
                    onClick={() => inMonth && openEdit(day)}
                    disabled={!inMonth}
                    className={cn(
                      'relative rounded-xl p-1.5 min-h-[64px] text-left transition-all border',
                      inMonth ? 'hover:shadow-md cursor-pointer' : 'opacity-20 cursor-default',
                      isToday(day) ? 'ring-2 ring-violet-400 ring-offset-1' : '',
                      custom ? 'border-violet-300' : 'border-slate-200',
                      horario || tipo ? 'bg-white' : 'bg-slate-50'
                    )}
                  >
                    {/* Date number */}
                    <span className={cn(
                      'text-[11px] font-bold block',
                      isToday(day) ? 'text-violet-600' : inMonth ? 'text-slate-600' : 'text-slate-300'
                    )}>
                      {format(day, 'd')}
                    </span>

                    {/* Content */}
                    {(horario || (tipo && tipo !== 'normal')) && inMonth && (
                      <div
                        className="mt-1 rounded-md px-1 py-0.5 text-[9px] font-semibold text-white truncate flex items-center gap-0.5"
                        style={{ backgroundColor: bgColor || '#8b5cf6' }}
                      >
                        {TipoIcon && <TipoIcon className="h-2.5 w-2.5 shrink-0" />}
                        <span className="truncate">
                          {tipo !== 'normal' ? tipoConfig.label : horario?.nome}
                        </span>
                      </div>
                    )}
                    {horario && tipo === 'normal' && inMonth && (
                      <span className="text-[8px] text-slate-400 block mt-0.5">
                        {horario.hora_entrada}–{horario.hora_saida}
                      </span>
                    )}

                    {/* Custom override indicator */}
                    {custom && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-500" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100">
          {Object.entries(TIPO_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color || '#8b5cf6' }} />
              {cfg.label}
            </div>
          ))}
          <div className="flex items-center gap-1 text-[10px] text-slate-400 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 inline-block" /> dia editado manualmente
          </div>
        </div>
      </DialogContent>

      {/* Day edit popover */}
      {editingDay && (
        <Dialog open={!!editingDay} onOpenChange={() => setEditingDay(null)}>
          <DialogContent className="w-[95vw] max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">
                Editar — {format(editingDay.date, "EEEE, d 'de' MMMM yyyy", { locale: ptBR })}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* Tipo do dia */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Tipo do dia</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(TIPO_CONFIG).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setEditForm(f => ({ ...f, tipo: key }))}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all',
                          editForm.tipo === key
                            ? 'text-white border-transparent'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        )}
                        style={editForm.tipo === key ? { backgroundColor: cfg.color || '#8b5cf6' } : {}}
                      >
                        {Icon && <Icon className="h-3 w-3" />}
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Turno (só se tipo = normal ou extra) */}
              {(editForm.tipo === 'normal' || editForm.tipo === 'extra') && (
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Turno</label>
                  <Select value={editForm.horario_id || 'none'} onValueChange={val => setEditForm(f => ({ ...f, horario_id: val === 'none' ? '' : val }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="— Sem turno —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem turno —</SelectItem>
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
                </div>
              )}

              {/* Observação */}
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Observação (opcional)</label>
                <Input
                  value={editForm.observacao}
                  onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))}
                  placeholder="Ex: substituição, turno extra..."
                  className="h-8 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                {/* Remove override */}
                {escalaDiaMap[editingDay.dateStr] && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-500 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => deleteMutation.mutate(editingDay.dateStr)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    Restaurar padrão
                  </Button>
                )}
                <Button
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-xs gap-1"
                  onClick={() => saveMutation.mutate({ date: editingDay.dateStr, ...editForm })}
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}