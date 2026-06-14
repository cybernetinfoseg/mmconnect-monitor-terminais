import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive, Search, Loader2, TrendingUp, TrendingDown, Clock, ChevronDown, ChevronUp
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fmtMin } from '@/lib/calculoHoras';
import { format, parseISO } from 'date-fns';

export default function BancoHoras() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [anoFilter, setAnoFilter] = useState(String(new Date().getFullYear()));
  const [expandedId, setExpandedId] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedSaldoId, setSelectedSaldoId] = useState(null);
  const [formData, setFormData] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = ['admin', 'super_admin'].includes(currentUser?.role);

  const { data: saldos = [], isLoading } = useQuery({
    queryKey: ['banco-horas', anoFilter],
    queryFn: () => base44.entities.BancoHoras.filter({ ano: Number(anoFilter) }, 'colaborador_nome', 500),
    enabled: !!currentUser,
  });

  const { data: movimentos = [] } = useQuery({
    queryKey: ['movimentos-banco'],
    queryFn: () => base44.entities.MovimentoBancoHoras.list('-data', 1000),
    enabled: !!currentUser,
  });

  const movimentosPorColab = useMemo(() => {
    const m = {};
    movimentos.forEach(mv => {
      if (!m[mv.colaborador_id]) m[mv.colaborador_id] = [];
      m[mv.colaborador_id].push(mv);
    });
    return m;
  }, [movimentos]);

  const debitarMutation = useMutation({
    mutationFn: async ({ saldoId, colId, colNome, enrollid, minutos, descricao }) => {
      const saldo = saldos.find(s => s.id === saldoId);
      if (!saldo) throw new Error('Saldo não encontrado');
      const disp = (saldo.minutos_credito || 0) - (saldo.minutos_debito || 0) - (saldo.minutos_pagos || 0);
      if (minutos > disp) throw new Error(`Saldo insuficiente (disponível: ${fmtMin(disp)})`);
      await base44.entities.BancoHoras.update(saldoId, { minutos_debito: (saldo.minutos_debito || 0) + minutos });
      await base44.entities.MovimentoBancoHoras.create({
        colaborador_id: colId, colaborador_nome: colNome, enrollid,
        data: new Date().toLocaleDateString('en-CA'), tipo: 'debito',
        minutos, descricao: descricao || 'Compensação gozada',
        aprovado_por: currentUser?.email, owner_email: currentUser?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['banco-horas']);
      queryClient.invalidateQueries(['movimentos-banco']);
      setDialogOpen(false); setFormData({});
      toast.success('Débito registado com sucesso');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const anos = [...new Set([String(new Date().getFullYear()), ...saldos.map(s => String(s.ano))])];
  const filtered = saldos.filter(s => !search || s.colaborador_nome?.toLowerCase().includes(search.toLowerCase()));

  const totalCredito = saldos.reduce((sum, s) => sum + (s.minutos_credito || 0), 0);
  const totalDebito = saldos.reduce((sum, s) => sum + (s.minutos_debito || 0) + (s.minutos_pagos || 0), 0);

  const set = (f, v) => setFormData(p => ({ ...p, [f]: v }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl"><Archive className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Banco de Horas</h1>
              <p className="text-xs text-slate-500">Saldos acumulados — art. 208º Código do Trabalho</p>
            </div>
          </div>
          <Select value={anoFilter} onValueChange={setAnoFilter}>
            <SelectTrigger className="bg-white w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: TrendingUp, bg: 'bg-emerald-50', color: 'text-emerald-600', v: fmtMin(totalCredito), label: 'Total creditado' },
            { icon: TrendingDown, bg: 'bg-red-50', color: 'text-red-500', v: fmtMin(totalDebito), label: 'Total gozado/pago' },
            { icon: Clock, bg: 'bg-blue-50', color: 'text-blue-600', v: fmtMin(Math.max(0, totalCredito - totalDebito)), label: 'Saldo disponível total' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={cn('p-2.5 rounded-lg', k.bg)}><k.icon className={cn('h-5 w-5', k.color)} /></div>
                <div><p className={cn('text-xl font-bold', k.color)}>{k.v}</p><p className="text-xs text-slate-500">{k.label}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400">
            <Archive className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>Nenhum saldo. Os saldos são criados ao aprovar horas extra com destino "Banco de Horas".</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => {
              const disponivel = (s.minutos_credito || 0) - (s.minutos_debito || 0) - (s.minutos_pagos || 0);
              const pctUsado = s.minutos_credito > 0 ? Math.round(((s.minutos_debito + s.minutos_pagos) / s.minutos_credito) * 100) : 0;
              const mvs = (movimentosPorColab[s.colaborador_id] || []).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
              const isExpanded = expandedId === s.id;
              return (
                <Card key={s.id} className="bg-white border-slate-200 overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                          {s.colaborador_nome?.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800">{s.colaborador_nome}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 max-w-[120px]">
                              <div className={cn('h-1.5 rounded-full', pctUsado >= 80 ? 'bg-red-400' : 'bg-blue-400')} style={{ width: `${Math.min(100, pctUsado)}%` }} />
                            </div>
                            <span className="text-xs text-slate-400">{pctUsado}% usado</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 flex-wrap">
                        {[
                          { v: fmtMin(s.minutos_credito || 0), label: 'Crédito', color: 'text-emerald-600' },
                          { v: fmtMin((s.minutos_debito || 0) + (s.minutos_pagos || 0)), label: 'Usado', color: 'text-red-500' },
                          { v: fmtMin(Math.max(0, disponivel)), label: 'Disponível', color: disponivel > 0 ? 'text-blue-600' : 'text-slate-400' },
                        ].map((x, i) => (
                          <div key={i} className="text-center">
                            <p className={cn('text-sm font-bold', x.color)}>{x.v}</p>
                            <p className="text-[10px] text-slate-400">{x.label}</p>
                          </div>
                        ))}
                        <div className="flex gap-1.5">
                          {isAdmin && disponivel > 0 && (
                            <Button size="sm" className="h-8 px-2 bg-blue-600 hover:bg-blue-700 text-xs gap-1" onClick={() => { setSelectedSaldoId(s.id); setFormData({ minutos: 60 }); setDialogOpen(true); }}>
                              <TrendingDown className="h-3 w-3" /> Usar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-2">
                        <p className="text-xs font-semibold text-slate-600 mb-2">Histórico de Movimentos</p>
                        {mvs.length === 0 ? <p className="text-xs text-slate-400">Sem movimentos</p> : mvs.slice(0, 20).map(mv => (
                          <div key={mv.id} className="flex items-center justify-between gap-3 text-xs py-1.5 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className={cn('w-2 h-2 rounded-full shrink-0', mv.tipo === 'credito' ? 'bg-emerald-400' : 'bg-red-400')} />
                              <div>
                                <p className="font-medium text-slate-700">{mv.descricao || mv.tipo}</p>
                                <p className="text-slate-400">{mv.data ? format(parseISO(mv.data), 'dd/MM/yyyy') : '—'}</p>
                              </div>
                            </div>
                            <span className={cn('font-bold', mv.tipo === 'credito' ? 'text-emerald-600' : 'text-red-500')}>
                              {mv.tipo === 'credito' ? '+' : '-'}{fmtMin(mv.minutos)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Usar Banco de Horas</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {selectedSaldoId && (() => {
              const s = saldos.find(x => x.id === selectedSaldoId);
              const disp = s ? (s.minutos_credito || 0) - (s.minutos_debito || 0) - (s.minutos_pagos || 0) : 0;
              return <p className="text-sm text-slate-600">Disponível para <strong>{s?.colaborador_nome}</strong>: <span className="font-bold text-blue-600">{fmtMin(disp)}</span></p>;
            })()}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Horas</Label>
                <Input type="number" min="0" max="24" placeholder="0" value={formData._h || ''} onChange={e => { set('_h', e.target.value); set('minutos', (parseInt(e.target.value) || 0) * 60 + (parseInt(formData._m) || 0)); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Minutos</Label>
                <Input type="number" min="0" max="59" placeholder="0" value={formData._m || ''} onChange={e => { set('_m', e.target.value); set('minutos', (parseInt(formData._h) || 0) * 60 + (parseInt(e.target.value) || 0)); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Motivo</Label>
              <Textarea value={formData.descricao || ''} onChange={e => set('descricao', e.target.value)} rows={2} placeholder="ex: Compensação dia 12/06" />
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={debitarMutation.isPending || !formData.minutos} onClick={() => {
              const s = saldos.find(x => x.id === selectedSaldoId);
              if (!s) return;
              debitarMutation.mutate({ saldoId: s.id, colId: s.colaborador_id, colNome: s.colaborador_nome, enrollid: s.enrollid, minutos: formData.minutos, descricao: formData.descricao });
            }}>
              {debitarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}