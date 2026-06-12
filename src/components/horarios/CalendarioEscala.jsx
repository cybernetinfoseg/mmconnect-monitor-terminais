import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { addDays, startOfWeek, format, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function CalendarioEscala({ horarios, colaboradores }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Map: horario_id -> horario object
  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  // For each day of the week, get list of { colaborador, horario }
  const escalaByDay = useMemo(() => {
    return weekDays.map(day => {
      const dow = day.getDay(); // 0=Sun, 6=Sat
      const escalados = [];
      colaboradores.forEach(c => {
        if (!c.horario_id) return;
        const h = horarioMap[c.horario_id];
        if (!h || !h.ativo) return;
        const dias = (() => { try { return JSON.parse(h.dias_semana || '[]'); } catch { return []; } })();
        if (dias.includes(dow)) {
          escalados.push({ colaborador: c, horario: h });
        }
      });
      // Sort by shift start time
      escalados.sort((a, b) => a.horario.hora_entrada.localeCompare(b.horario.hora_entrada));
      return escalados;
    });
  }, [weekDays, colaboradores, horarioMap]);

  const totalEscalados = useMemo(() =>
    new Set(colaboradores.filter(c => c.horario_id).map(c => c.id)).size,
    [colaboradores]
  );

  const totalSemHorario = colaboradores.length - totalEscalados;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-violet-700">{colaboradores.length}</p>
          <p className="text-xs text-violet-500 mt-0.5">Total Colaboradores</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{totalEscalados}</p>
          <p className="text-xs text-emerald-500 mt-0.5">Com Horário</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{totalSemHorario}</p>
          <p className="text-xs text-amber-500 mt-0.5">Sem Horário</p>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekOffset(w => w - 1)}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">
            {format(weekDays[0], "d 'de' MMM", { locale: ptBR })} – {format(weekDays[6], "d 'de' MMM yyyy", { locale: ptBR })}
          </p>
          {weekOffset === 0 && (
            <p className="text-xs text-violet-500 font-medium">Semana atual</p>
          )}
        </div>
        <button
          onClick={() => setWeekOffset(w => w + 1)}
          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-slate-600" />
        </button>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-7 gap-1.5">
        {weekDays.map((day, idx) => {
          const isCurrentDay = isToday(day);
          const escalados = escalaByDay[idx];

          return (
            <div
              key={idx}
              className={cn(
                'rounded-xl border flex flex-col min-h-[180px]',
                isCurrentDay
                  ? 'bg-violet-50 border-violet-300 shadow-sm'
                  : 'bg-white border-slate-200'
              )}
            >
              {/* Day header */}
              <div className={cn(
                'px-2 py-2 rounded-t-xl text-center border-b',
                isCurrentDay
                  ? 'bg-violet-600 border-violet-600'
                  : 'bg-slate-50 border-slate-200'
              )}>
                <p className={cn(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  isCurrentDay ? 'text-violet-200' : 'text-slate-400'
                )}>
                  {DIAS_CURTOS[day.getDay()]}
                </p>
                <p className={cn(
                  'text-base font-bold leading-tight',
                  isCurrentDay ? 'text-white' : 'text-slate-700'
                )}>
                  {format(day, 'd')}
                </p>
              </div>

              {/* Escalados */}
              <div className="flex-1 p-1.5 space-y-1 overflow-y-auto max-h-48">
                {escalados.length === 0 ? (
                  <p className="text-[10px] text-slate-300 text-center pt-3">—</p>
                ) : (
                  escalados.map(({ colaborador, horario }, i) => (
                    <div
                      key={colaborador.id + i}
                      className="rounded-lg px-1.5 py-1 text-[10px] leading-tight"
                      style={{
                        backgroundColor: (horario.cor || '#8b5cf6') + '20',
                        borderLeft: `2px solid ${horario.cor || '#8b5cf6'}`,
                      }}
                    >
                      <p className="font-semibold text-slate-700 truncate">{colaborador.nome}</p>
                      <p className="text-slate-400 flex items-center gap-0.5 mt-0.5">
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        {horario.hora_entrada}–{horario.hora_saida}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Count badge */}
              {escalados.length > 0 && (
                <div className={cn(
                  'px-2 py-1 border-t text-center',
                  isCurrentDay ? 'border-violet-200' : 'border-slate-100'
                )}>
                  <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
                    <Users className="h-2.5 w-2.5" />
                    {escalados.length}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Horarios legend */}
      {horarios.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {horarios.filter(h => h.ativo !== false).map(h => (
            <div key={h.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
              {h.nome}
              <span className="text-slate-400">{h.hora_entrada}–{h.hora_saida}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}