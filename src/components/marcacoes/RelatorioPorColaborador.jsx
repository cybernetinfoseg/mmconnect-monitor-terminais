import React, { useMemo } from 'react';
import { format, startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getModeInfo } from '@/lib/timmyModels';
import { cn } from '@/lib/utils';
import { Clock, User, TrendingUp } from 'lucide-react';

const TIPO_COLORS = {
  entrada: 'bg-emerald-100 text-emerald-700',
  saida: 'bg-rose-100 text-rose-700',
  desconhecido: 'bg-slate-100 text-slate-500',
};

/**
 * RelatorioPorColaborador — Agrupa marcações por colaborador e mostra estatísticas.
 * Props:
 *   marcacoes: Marcacao[]
 *   terminalUsers: TerminalUser[]
 *   userMap: { [enrollid]: nome }
 *   dateFrom: string (yyyy-MM-dd)
 *   dateTo: string (yyyy-MM-dd)
 */
export default function RelatorioPorColaborador({ marcacoes, userMap, dateFrom, dateTo }) {
  const agrupado = useMemo(() => {
    const mapa = {};
    marcacoes.forEach(m => {
      const id = m.enrollid;
      if (!mapa[id]) {
        mapa[id] = {
          enrollid: id,
          nome: m.utilizador_nome || userMap[id] || `ID:${id}`,
          marcacoes: [],
          porModo: {},
          entradas: 0,
          saidas: 0,
          desconhecidos: 0,
        };
      }
      mapa[id].marcacoes.push(m);
      if (m.tipo === 'entrada') mapa[id].entradas++;
      else if (m.tipo === 'saida') mapa[id].saidas++;
      else mapa[id].desconhecidos++;
      // Agrupar por modo biométrico
      const modeKey = m.raw_mode ?? m.modo ?? 'desconhecido';
      mapa[id].porModo[modeKey] = (mapa[id].porModo[modeKey] || 0) + 1;
    });
    // Ordenar por total decrescente
    return Object.values(mapa).sort((a, b) => b.marcacoes.length - a.marcacoes.length);
  }, [marcacoes, userMap]);

  // Dias no intervalo para calcular dias com marcações
  const diasIntervalo = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    try {
      return eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
    } catch { return []; }
  }, [dateFrom, dateTo]);

  if (!agrupado.length) {
    return (
      <div className="py-10 text-center text-slate-400">
        <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Sem marcações no período selecionado</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sumário rápido */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2">
          <p className="text-xl font-bold text-slate-800">{agrupado.length}</p>
          <p className="text-xs text-slate-500">Colaboradores</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
          <p className="text-xl font-bold text-emerald-700">{marcacoes.filter(m => m.tipo === 'entrada').length}</p>
          <p className="text-xs text-emerald-600">Entradas</p>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2">
          <p className="text-xl font-bold text-rose-700">{marcacoes.filter(m => m.tipo === 'saida').length}</p>
          <p className="text-xs text-rose-600">Saídas</p>
        </div>
      </div>

      {/* Tabela por colaborador */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Colaborador</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase">Total</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden sm:table-cell">Entradas</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden sm:table-cell">Saídas</th>
              <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden md:table-cell">Modos biométricos</th>
              <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden lg:table-cell">Última marcação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {agrupado.map(col => {
              const ultima = col.marcacoes.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
              const diasComMarcacao = new Set(col.marcacoes.map(m => m.timestamp?.substring(0, 10))).size;
              const pct = diasIntervalo.length > 0 ? Math.round(diasComMarcacao / diasIntervalo.length * 100) : 0;

              return (
                <tr key={col.enrollid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-slate-600">{col.nome[0]?.toUpperCase() || '?'}</span>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-800 truncate max-w-[120px]">{col.nome}</p>
                        <p className="text-[10px] text-slate-400 font-mono">#{col.enrollid}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className="text-sm font-bold text-slate-700">{col.marcacoes.length}</span>
                    {diasIntervalo.length > 0 && (
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-1 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400">{pct}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{col.entradas}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">{col.saidas}</Badge>
                  </td>
                  <td className="px-2 py-2.5 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(col.porModo).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mode, count]) => {
                        const info = getModeInfo(isNaN(Number(mode)) ? mode : null, isNaN(Number(mode)) ? null : Number(mode));
                        return (
                          <span key={mode} className={cn('text-[10px] px-1.5 py-0.5 rounded border', info.color)}>
                            {info.icon} {info.label} <span className="font-bold">×{count}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 hidden lg:table-cell">
                    {ultima?.timestamp ? (
                      <div>
                        <p className="text-xs font-mono text-slate-600">{format(new Date(ultima.timestamp), 'dd/MM HH:mm')}</p>
                        <Badge className={cn('text-[10px]', TIPO_COLORS[ultima.tipo] || TIPO_COLORS.desconhecido)}>{ultima.tipo}</Badge>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}