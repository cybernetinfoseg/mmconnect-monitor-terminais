import React, { useState, useMemo } from 'react';
import { Users, Search, CheckCircle2, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function AtribuicaoHorario({ colaboradores, horarios, onAssign, assigningId }) {
  const [search, setSearch] = useState('');
  const [filterDep, setFilterDep] = useState('all');

  const departamentos = useMemo(() => {
    const set = new Set(colaboradores.map(c => c.departamento).filter(Boolean));
    return Array.from(set).sort();
  }, [colaboradores]);

  const filtered = useMemo(() => {
    return colaboradores.filter(c => {
      const matchSearch = !search || c.nome.toLowerCase().includes(search.toLowerCase()) || String(c.enrollid).includes(search);
      const matchDep = filterDep === 'all' || c.departamento === filterDep;
      return matchSearch && matchDep;
    });
  }, [colaboradores, search, filterDep]);

  const comHorario = colaboradores.filter(c => c.horario_id).length;
  const semHorario = colaboradores.length - comHorario;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {comHorario} com horário atribuído
        </div>
        {semHorario > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            {semHorario} sem horário
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar colaborador..."
            className="pl-8 h-8 text-xs"
          />
        </div>
        {departamentos.length > 0 && (
          <Select value={filterDep} onValueChange={setFilterDep}>
            <SelectTrigger className="h-8 text-xs w-[160px]">
              <SelectValue placeholder="Departamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os depto.</SelectItem>
              {departamentos.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Colaborador</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600 hidden sm:table-cell">Departamento</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Horário Atribuído</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600 hidden md:table-cell">Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-sm text-slate-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Nenhum colaborador encontrado
                </td>
              </tr>
            )}
            {filtered.map(c => {
              const horarioAtual = horarios.find(h => h.id === c.horario_id);
              const diasAtivos = horarioAtual
                ? (() => { try { return JSON.parse(horarioAtual.dias_semana || '[]'); } catch { return []; } })()
                : [];
              const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
              const isAssigning = assigningId === c.id;

              return (
                <tr key={c.id} className={cn(
                  'hover:bg-slate-50 transition-colors',
                  isAssigning && 'opacity-60'
                )}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        horarioAtual ? 'text-white' : 'bg-slate-100 text-slate-400'
                      )}
                        style={horarioAtual ? { backgroundColor: horarioAtual.cor || '#8b5cf6' } : {}}
                      >
                        {c.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{c.nome}</p>
                        <p className="text-[10px] text-slate-400 font-mono">#{c.enrollid}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">
                    {c.departamento || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={c.horario_id || 'none'}
                      onValueChange={val => onAssign(c.id, val === 'none' ? '' : val)}
                      disabled={isAssigning}
                    >
                      <SelectTrigger className={cn(
                        'h-7 text-xs w-[190px]',
                        horarioAtual ? 'border-violet-300 bg-violet-50' : ''
                      )}>
                        <SelectValue placeholder="— Sem horário —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Sem horário —</SelectItem>
                        {horarios.map(h => (
                          <SelectItem key={h.id} value={h.id}>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: h.cor || '#8b5cf6' }} />
                              {h.nome} ({h.hora_entrada}–{h.hora_saida})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {horarioAtual ? (
                      <div className="flex gap-0.5">
                        {[0,1,2,3,4,5,6].map(d => (
                          <span key={d} className={cn(
                            'w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center',
                            diasAtivos.includes(d)
                              ? 'text-white'
                              : 'bg-slate-100 text-slate-300'
                          )}
                            style={diasAtivos.includes(d) ? { backgroundColor: horarioAtual.cor || '#8b5cf6' } : {}}
                          >
                            {DIAS[d]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
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