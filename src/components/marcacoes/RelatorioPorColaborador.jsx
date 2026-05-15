import React, { useMemo, useState } from 'react';
import { format, eachDayOfInterval, parseISO, differenceInMinutes } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getModeInfo } from '@/lib/timmyModels';
import { cn } from '@/lib/utils';
import { Clock, User, Search, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const TIPO_COLORS = {
  entrada: 'bg-emerald-100 text-emerald-700',
  saida: 'bg-rose-100 text-rose-700',
  desconhecido: 'bg-slate-100 text-slate-500',
};

/** Emparelha entradas com saídas para calcular minutos trabalhados num dia */
function calcularMinutosDia(marcacoesDia) {
  const entradas = marcacoesDia.filter(m => m.tipo === 'entrada').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const saidas   = marcacoesDia.filter(m => m.tipo === 'saida').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  let total = 0;
  let saidaIdx = 0;
  for (const entrada of entradas) {
    // Encontrar a próxima saída após esta entrada
    while (saidaIdx < saidas.length && new Date(saidas[saidaIdx].timestamp) <= new Date(entrada.timestamp)) saidaIdx++;
    if (saidaIdx < saidas.length) {
      const diff = differenceInMinutes(new Date(saidas[saidaIdx].timestamp), new Date(entrada.timestamp));
      if (diff > 0 && diff < 1440) { // ignorar pares impossíveis (>24h)
        total += diff;
        saidaIdx++;
      }
    }
  }
  return total;
}

function formatMinutos(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}`;
}

export default function RelatorioPorColaborador({ marcacoes, userMap, dateFrom, dateTo, userTimezone = 'UTC' }) {
  const [search, setSearch] = useState('');

  const diasIntervalo = useMemo(() => {
    if (!dateFrom || !dateTo) return [];
    try { return eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) }); }
    catch { return []; }
  }, [dateFrom, dateTo]);

  // Dados para gráfico de marcações por hora do dia (na timezone do utilizador)
  const porHora = useMemo(() => {
    const counts = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2,'0')}h`, entrada: 0, saida: 0 }));
    marcacoes.forEach(m => {
      if (!m.timestamp) return;
      // Usar timezone do utilizador para extrair a hora correta
      const hStr = new Date(m.timestamp).toLocaleString('en-GB', { timeZone: userTimezone, hour: '2-digit', hour12: false });
      const h = parseInt(hStr, 10);
      if (isNaN(h) || h < 0 || h > 23) return;
      if (m.tipo === 'entrada') counts[h].entrada++;
      else if (m.tipo === 'saida') counts[h].saida++;
    });
    // Só mostrar horas com atividade (filtrar zeros nas pontas)
    let first = 0, last = 23;
    for (let i = 0; i < 24; i++) { if (counts[i].entrada + counts[i].saida > 0) { first = Math.max(0, i - 1); break; } }
    for (let i = 23; i >= 0; i--) { if (counts[i].entrada + counts[i].saida > 0) { last = Math.min(23, i + 1); break; } }
    return counts.slice(first, last + 1);
  }, [marcacoes]);

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
          entradas: 0, saidas: 0, desconhecidos: 0,
          totalMinutos: 0,
          diasSemSaida: 0,
        };
      }
      mapa[id].marcacoes.push(m);
      if (m.tipo === 'entrada') mapa[id].entradas++;
      else if (m.tipo === 'saida') mapa[id].saidas++;
      else mapa[id].desconhecidos++;
      const modeKey = m.raw_mode ?? m.modo ?? 'desconhecido';
      mapa[id].porModo[modeKey] = (mapa[id].porModo[modeKey] || 0) + 1;
    });

    // Calcular horas trabalhadas e dias sem saída por colaborador
    Object.values(mapa).forEach(col => {
      const porDia = {};
      col.marcacoes.forEach(m => {
        if (!m.timestamp) return;
        // Usar timezone do utilizador para agrupar por dia correto
        const dia = new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone });
        if (!porDia[dia]) porDia[dia] = [];
        porDia[dia].push(m);
      });
      let totalMin = 0;
      let diasSemSaida = 0;
      Object.values(porDia).forEach(ms => {
        const min = calcularMinutosDia(ms);
        totalMin += min;
        const temEntrada = ms.some(m => m.tipo === 'entrada');
        const temSaida   = ms.some(m => m.tipo === 'saida');
        if (temEntrada && !temSaida) diasSemSaida++;
      });
      col.totalMinutos = totalMin;
      col.diasSemSaida = diasSemSaida;
    });

    return Object.values(mapa).sort((a, b) => b.totalMinutos - a.totalMinutos || b.marcacoes.length - a.marcacoes.length);
  }, [marcacoes, userMap]);

  const filtered = useMemo(() => {
    if (!search.trim()) return agrupado;
    const q = search.toLowerCase();
    return agrupado.filter(c => c.nome.toLowerCase().includes(q) || String(c.enrollid).includes(q));
  }, [agrupado, search]);

  if (!agrupado.length) {
    return (
      <div className="py-10 text-center text-slate-400">
        <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Sem marcações no período selecionado</p>
      </div>
    );
  }

  const totalHoras = agrupado.reduce((s, c) => s + c.totalMinutos, 0);

  return (
    <div className="space-y-4">
      {/* Sumário */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
          <p className="text-xl font-bold text-blue-700">{formatMinutos(totalHoras)}</p>
          <p className="text-xs text-blue-600">Total trabalhado</p>
        </div>
      </div>

      {/* Gráfico por hora */}
      {porHora.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Marcações por hora do dia</p>
          <div className="h-36 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porHora} barCategoryGap="20%" barGap={2}>
                <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                  formatter={(val, name) => [val, name === 'entrada' ? 'Entradas' : 'Saídas']}
                />
                <Bar dataKey="entrada" fill="#10b981" radius={[2,2,0,0]} />
                <Bar dataKey="saida"   fill="#f43f5e" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filtro de colaborador */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <Input
          placeholder="Filtrar colaborador..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Tabela por colaborador */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Colaborador</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden sm:table-cell">Entradas</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden sm:table-cell">Saídas</th>
              <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600 uppercase">⏱ Trabalhado</th>
              <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden md:table-cell">Modos</th>
              <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600 uppercase hidden lg:table-cell">Última marcação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(col => {
              const sorted = [...col.marcacoes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              const ultima = sorted[0];
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
                        <div className="flex items-center gap-1">
                          <p className="text-xs font-medium text-slate-800 truncate max-w-[120px]">{col.nome}</p>
                          {col.diasSemSaida > 0 && (
                            <span title={`${col.diasSemSaida} dia(s) sem saída registada`}>
                              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-[10px] text-slate-400 font-mono">#{col.enrollid}</p>
                          {diasIntervalo.length > 0 && (
                            <div className="flex items-center gap-0.5">
                              <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-1 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-slate-400">{pct}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{col.entradas}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-center hidden sm:table-cell">
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 text-xs">{col.saidas}</Badge>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <div className="flex flex-col items-center">
                      <span className={cn('text-xs font-bold', col.totalMinutos > 0 ? 'text-blue-700' : 'text-slate-400')}>
                        {formatMinutos(col.totalMinutos)}
                      </span>
                      {col.diasSemSaida > 0 && (
                        <span className="text-[10px] text-amber-500">{col.diasSemSaida}d incompleto(s)</span>
                      )}
                    </div>
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
        {filtered.length === 0 && (
          <div className="py-6 text-center text-slate-400 text-xs">Nenhum colaborador corresponde à pesquisa</div>
        )}
      </div>
    </div>
  );
}