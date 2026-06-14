import React, { useState, useEffect, useMemo } from 'react';
import { LogIn, LogOut, Clock, Moon, TrendingUp, AlertCircle, CalendarOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { calcularDia, fmtMin } from '@/lib/calculoHoras';

const AUSENCIA_LABELS = { ferias: '🌴 Férias', baixa_medica: '🏥 Baixa', feriado: '🎉 Feriado', justificada: '📋 Justificada', injustificada: '⚠️ Injustificada' };

export default function PresencaCard({ pessoa, timezone, horarioMap, ausenciaAtiva }) {
  const dentro = pessoa.dentro;
  const [now, setNow] = useState(new Date());

  // Tick a cada minuto para actualizar horas em tempo real quando dentro
  useEffect(() => {
    if (!dentro) return;
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, [dentro]);

  const fmtTime = (ts) => {
    if (!ts) return '—';
    const raw = ts.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
    const d = new Date(raw);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  };

  // Encontrar horário do colaborador
  const horario = pessoa.horario_id ? horarioMap?.[pessoa.horario_id] : null;

  // Calcular horas com base nas marcações do dia
  const calculo = React.useMemo(() => {
    if (!pessoa.marcacoesHoje || pessoa.marcacoesHoje.length === 0) return null;
    return calcularDia(pessoa.marcacoesHoje, horario);
  }, [pessoa.marcacoesHoje, horario, dentro ? now : null]);

  const temExtra = calculo && calculo.minutosExtra > 0;
  const temNoturno = calculo && calculo.minutosNoturnos > 0;
  const temAtraso = calculo && calculo.minutosAtraso > 0;

  return (
    <Card className={cn(
      'border transition-all',
      dentro ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white opacity-80'
    )}>
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start gap-2.5">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
            dentro ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-500'
          )}>
            {pessoa.nome[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-800 truncate">{pessoa.nome}</p>
              <span className={cn('w-2 h-2 rounded-full shrink-0', dentro ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
            </div>
            {(pessoa.departamento || pessoa.cargo) && (
              <p className="text-[11px] text-slate-500 truncate">{[pessoa.departamento, pessoa.cargo].filter(Boolean).join(' · ')}</p>
            )}
            {horario && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: horario.cor || '#8b5cf6' }} />
                <span className="text-[10px] text-slate-400">{horario.nome} · {horario.hora_entrada}–{horario.hora_saida}</span>
              </div>
            )}
          </div>
        </div>

        {/* Marcações */}
        <div className="space-y-0.5">
          {pessoa.primeiraMarcacao && (
            <div className="flex items-center gap-1 text-[11px]">
              <LogIn className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
              <span className="text-slate-600">{fmtTime(pessoa.primeiraMarcacao.timestamp)}</span>
              {pessoa.primeiraMarcacao.terminal_nome && (
                <span className="text-slate-400 truncate">· {pessoa.primeiraMarcacao.terminal_nome}</span>
              )}
            </div>
          )}
          {!dentro && pessoa.ultimaMarcacao && (
            <div className="flex items-center gap-1 text-[11px]">
              <LogOut className="h-2.5 w-2.5 text-rose-400 shrink-0" />
              <span className="text-slate-600">{fmtTime(pessoa.ultimaMarcacao.timestamp)}</span>
              {pessoa.ultimaMarcacao.terminal_nome && (
                <span className="text-slate-400 truncate">· {pessoa.ultimaMarcacao.terminal_nome}</span>
              )}
            </div>
          )}
        </div>

        {/* Cálculo de horas */}
        {calculo && (
          <div className="pt-1.5 border-t border-slate-100 space-y-1">
            {/* Horas efectivas */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Clock className="h-3 w-3" />
                <span>Trabalhadas{calculo.aindaDentro ? ' (est.)' : ''}</span>
              </div>
              <span className={cn('text-xs font-semibold',
                temExtra ? 'text-violet-700' : 'text-slate-700'
              )}>
                {fmtMin(calculo.minutosEfetivos)}
              </span>
            </div>

            {/* Extra */}
            {temExtra && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-violet-500">
                  <TrendingUp className="h-3 w-3" />
                  <span>Extra (+{Math.round(calculo.fatorPrimeiraHora * 100 - 100)}%)</span>
                </div>
                <span className="text-xs font-semibold text-violet-600">+{fmtMin(calculo.minutosExtra)}</span>
              </div>
            )}

            {/* Noturno */}
            {temNoturno && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-indigo-500">
                  <Moon className="h-3 w-3" />
                  <span>Noturno (+25%)</span>
                </div>
                <span className="text-xs font-semibold text-indigo-600">{fmtMin(calculo.minutosNoturnos)}</span>
              </div>
            )}

            {/* Atraso */}
            {temAtraso && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[11px] text-amber-500">
                  <AlertCircle className="h-3 w-3" />
                  <span>Atraso</span>
                </div>
                <span className="text-xs font-semibold text-amber-600">{fmtMin(calculo.minutosAtraso)}</span>
              </div>
            )}
          </div>
        )}

        {/* Badge status */}
        <div className="pt-1 border-t border-slate-100 flex gap-1 flex-wrap">
          <Badge className={cn('text-[10px]', dentro ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {dentro ? '✓ Presente' : '← Saiu'}
          </Badge>
          {temExtra && <Badge className="text-[10px] bg-violet-100 text-violet-700">Extra</Badge>}
          {temNoturno && <Badge className="text-[10px] bg-indigo-100 text-indigo-700">Noturno</Badge>}
          {temAtraso && <Badge className="text-[10px] bg-amber-100 text-amber-700">Atraso</Badge>}
          {ausenciaAtiva && (
            <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 flex items-center gap-0.5">
              <CalendarOff className="h-2.5 w-2.5" />
              {AUSENCIA_LABELS[ausenciaAtiva.tipo] || ausenciaAtiva.tipo}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}