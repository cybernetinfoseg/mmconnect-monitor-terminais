import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, eachDayOfInterval, parseISO, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Loader2, Sun, Umbrella, CalendarOff, X, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

const TIPO_CONFIG = {
  trabalho: { label: 'T', color: '#8b5cf6', bg: 'bg-violet-100 border-violet-300 text-violet-700', icon: Briefcase },
  folga:    { label: 'F', color: '#10b981', bg: 'bg-emerald-100 border-emerald-300 text-emerald-700', icon: Sun },
  ferias:   { label: 'V', color: '#3b82f6', bg: 'bg-blue-100 border-blue-300 text-blue-700', icon: Umbrella },
  feriado:  { label: 'FE', color: '#f59e0b', bg: 'bg-amber-100 border-amber-300 text-amber-700', icon: CalendarOff },
  falta:    { label: '!', color: '#ef4444', bg: 'bg-red-100 border-red-300 text-red-700', icon: X },
};

const TIPOS_ORDEM = ['trabalho', 'folga', 'ferias', 'feriado', 'falta'];

export default function EscalaTable({ escala, colaboradores, horarios }) {
  const queryClient = useQueryClient();
  const [loadingCell, setLoadingCell] = useState(null); // "colaboradorId_data"

  const days = useMemo(() => {
    if (!escala) return [];
    return eachDayOfInterval({
      start: parseISO(escala.data_inicio),
      end: parseISO(escala.data_fim),
    });
  }, [escala]);

  const { data: entradas = [] } = useQuery({
    queryKey: ['escala-entradas', escala?.id],
    queryFn: () => base44.entities.EscalaEntrada.filter({ escala_id: escala.id }, 'data', 1000),
    enabled: !!escala?.id,
  });

  // Map: colaboradorId_data -> entrada
  const entradaMap = useMemo(() => {
    const m = {};
    entradas.forEach(e => { m[`${e.colaborador_id}_${e.data}`] = e; });
    return m;
  }, [entradas]);

  // Horario map
  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  const saveMutation = useMutation({
    mutationFn: async ({ colaborador, data, tipo, horario_id }) => {
      const key = `${colaborador.id}_${data}`;
      const existing = entradaMap[key];
      const horario = horario_id ? horarioMap[horario_id] : null;
      const payload = {
        escala_id: escala.id,
        colaborador_id: colaborador.id,
        colaborador_nome: colaborador.nome,
        data,
        tipo,
        horario_id: horario_id || '',
        horario_nome: horario?.nome || '',
      };
      if (existing) {
        return base44.entities.EscalaEntrada.update(existing.id, payload);
      }
      return base44.entities.EscalaEntrada.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['escala-entradas', escala?.id]);
    },
    onError: () => toast.error('Erro ao guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: (entradaId) => base44.entities.EscalaEntrada.delete(entradaId),
    onSuccess: () => queryClient.invalidateQueries(['escala-entradas', escala?.id]),
  });

  const handleCellClick = async (colaborador, day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const key = `${colaborador.id}_${dateStr}`;
    setLoadingCell(key);
    try {
      const existing = entradaMap[key];
      if (!existing) {
        // Create with default tipo = trabalho using colaborador's default horario
        await saveMutation.mutateAsync({
          colaborador, data: dateStr, tipo: 'trabalho',
          horario_id: colaborador.horario_id || '',
        });
      } else {
        // Cycle through tipos
        const idx = TIPOS_ORDEM.indexOf(existing.tipo);
        const nextTipo = TIPOS_ORDEM[(idx + 1) % TIPOS_ORDEM.length];
        if (nextTipo === 'trabalho' && idx === TIPOS_ORDEM.length - 1) {
          // Full cycle: delete entry (resets to empty)
          await deleteMutation.mutateAsync(existing.id);
        } else {
          await saveMutation.mutateAsync({
            colaborador, data: dateStr, tipo: nextTipo,
            horario_id: nextTipo === 'trabalho' ? (colaborador.horario_id || '') : '',
          });
        }
      }
    } finally {
      setLoadingCell(null);
    }
  };

  // Count stats per day
  const dayStats = useMemo(() => {
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const counts = { trabalho: 0, folga: 0, ferias: 0, feriado: 0, falta: 0, vazio: 0 };
      colaboradores.forEach(c => {
        const e = entradaMap[`${c.id}_${dateStr}`];
        if (e) counts[e.tipo] = (counts[e.tipo] || 0) + 1;
        else counts.vazio++;
      });
      return counts;
    });
  }, [days, colaboradores, entradaMap]);

  if (!escala) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          {/* Month/Day header */}
          <tr className="bg-slate-800 text-white">
            <th className="sticky left-0 z-20 bg-slate-800 px-3 py-2.5 text-left font-semibold min-w-[160px] border-r border-slate-700">
              Colaborador
            </th>
            {days.map((day, i) => {
              const weekend = isWeekend(day);
              return (
                <th key={i} className={cn(
                  'px-1 py-2 text-center min-w-[42px] border-r border-slate-700 font-normal',
                  weekend ? 'bg-slate-700' : 'bg-slate-800'
                )}>
                  <div className="text-[10px] text-slate-400 uppercase">
                    {format(day, 'EEE', { locale: ptBR }).slice(0, 3)}
                  </div>
                  <div className={cn('font-bold text-sm leading-tight', weekend ? 'text-amber-300' : 'text-white')}>
                    {format(day, 'd')}
                  </div>
                </th>
              );
            })}
          </tr>
          {/* Day stats row */}
          <tr className="bg-slate-50 border-b border-slate-200">
            <td className="sticky left-0 z-20 bg-slate-50 px-3 py-1 text-[10px] text-slate-400 font-medium border-r border-slate-200">
              Escalados
            </td>
            {dayStats.map((stats, i) => (
              <td key={i} className="text-center px-1 py-1 border-r border-slate-200">
                <span className={cn(
                  'text-[10px] font-bold',
                  stats.trabalho === 0 ? 'text-slate-300' : 'text-violet-600'
                )}>
                  {stats.trabalho}
                </span>
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {colaboradores.map((colab, rowIdx) => (
            <tr key={colab.id} className={cn('border-b border-slate-100', rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50')}>
              <td className={cn(
                'sticky left-0 z-10 px-3 py-2 border-r border-slate-200 font-medium',
                rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'
              )}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: colab.horario_id && horarioMap[colab.horario_id]?.cor || '#94a3b8' }}
                  >
                    {colab.nome.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-slate-800 truncate max-w-[110px]">{colab.nome}</p>
                    {colab.horario_id && horarioMap[colab.horario_id] && (
                      <p className="text-[10px] text-slate-400 truncate max-w-[110px]">
                        {horarioMap[colab.horario_id].nome}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              {days.map((day, colIdx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const key = `${colab.id}_${dateStr}`;
                const entrada = entradaMap[key];
                const isLoading = loadingCell === key;
                const weekend = isWeekend(day);
                const cfg = entrada ? TIPO_CONFIG[entrada.tipo] : null;

                return (
                  <td
                    key={colIdx}
                    onClick={() => !isLoading && !escala.publicada && handleCellClick(colab, day)}
                    className={cn(
                      'text-center px-0.5 py-1 border-r border-slate-100 transition-all',
                      !escala.publicada && 'cursor-pointer hover:bg-violet-50',
                      weekend && !entrada && 'bg-slate-50',
                      isLoading && 'opacity-50'
                    )}
                    title={cfg ? `${colab.nome} — ${cfg.label}` : `Clique para escalar ${colab.nome}`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 mx-auto animate-spin text-violet-400" />
                    ) : entrada ? (
                      <span className={cn(
                        'inline-flex items-center justify-center w-7 h-7 rounded-lg border text-[10px] font-bold',
                        cfg?.bg
                      )}>
                        {cfg?.label}
                      </span>
                    ) : (
                      <span className={cn(
                        'inline-flex items-center justify-center w-7 h-7 rounded-lg border border-dashed text-slate-200',
                        weekend ? 'border-slate-200' : 'border-slate-100'
                      )}>
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border-t border-slate-200">
        <span className="text-[10px] text-slate-400 font-medium mr-1">Clique para alternar:</span>
        {TIPOS_ORDEM.map(t => {
          const cfg = TIPO_CONFIG[t];
          return (
            <span key={t} className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold', cfg.bg)}>
              {cfg.label} {t.charAt(0).toUpperCase() + t.slice(1)}
            </span>
          );
        })}
        <span className="text-[10px] text-slate-400 ml-auto">Ciclo: Trabalho → Folga → Férias → Feriado → Falta → limpar</span>
      </div>
    </div>
  );
}