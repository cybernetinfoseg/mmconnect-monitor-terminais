import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp, Plus, Search, CheckCircle2,
  Clock, Loader2, AlertTriangle
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fmtMin } from '@/lib/calculoHoras';
import { format, parseISO, getYear } from 'date-fns';

const LIMITE_ANUAL_MIN = 150 * 60;

function calcularFator(tipoDia, acumuladoMin) {
  const acima100 = acumuladoMin >= 100 * 60;
  if (tipoDia === 'feriado') return 2.00;
  if (tipoDia === 'descanso') return acima100 ? 2.00 : 1.50;
  return acima100 ? 1.50 : 1.25;
}

export default function HorasExtra() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [aprovFilter, setAprovFilter] = useState('all');
  const [anoFilter, setAnoFilter] = useState(String(new Date().getFullYear()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({});
  const [aprovacaoId, setAprovacaoId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = ['admin', 'super_admin'].includes(currentUser?.role);

  const { data: registos = [], isLoading } = useQuery({
    queryKey: ['horas-extra', anoFilter],
    queryFn: () => base44.entities.RegistoHorasExtra.list('-data', 1000),
    enabled: !!currentUser,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-he'],
    queryFn: () => base44.entities.Colaborador.filter({ ativo: true }, 'nome', 500),
    enabled: !!currentUser,
  });

  const acumuladoMap = useMemo(() => {
    const m = {};
    registos.filter(r => r.data && getYear(parseISO(r.data)) === Number(anoFilter) && r.aprovado).forEach(r => {
      if (!m[r.colaborador_id]) m[r.colaborador_id] = 0;
      m[r.colaborador_id] += r.minutos_extra || 0;
    });
    return m;
  }, [registos, anoFilter]);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const acumulado = acumuladoMap[data.colaborador_id] || 0;
      const fator = calcularFator(data.tipo_dia || 'util', acumulado);
      return base44.entities.RegistoHorasExtra.create({
        ...data,
        fator_aplicado: fator,
        minutos_compensados: Math.round((data.minutos_extra || 0) * fator),
        acumulado_ano_antes: acumulado,
        aprovado: false,
        processado: false,
        destino: data.destino || 'pendente',
        owner_email: currentUser?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['horas-extra']);
      setDialogOpen(false); setFormData({});
      toast.success('Registo criado. Aguarda aprovação.');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const aprovarMutation = useMutation({
    mutationFn: async (id) => {
      const registo = registos.find(r => r.id === id);
      if (!registo) return;
      await base44.entities.RegistoHorasExtra.update(id, {
        aprovado: true, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(),
      });
      if (registo.destino === 'banco_horas') {
        await base44.entities.MovimentoBancoHoras.create({
          colaborador_id: registo.colaborador_id, colaborador_nome: registo.colaborador_nome,
          enrollid: registo.enrollid, data: registo.data, tipo: 'credito',
          minutos: registo.minutos_compensados || registo.minutos_extra,
          descricao: `Horas extra ${registo.data} aprovadas`,
          registo_extra_id: id, aprovado_por: currentUser?.email, owner_email: currentUser?.email,
        });
        const ano = getYear(parseISO(registo.data));
        const saldos = await base44.entities.BancoHoras.filter({ colaborador_id: registo.colaborador_id, ano }, 'created_date', 1);
        if (saldos.length > 0) {
          await base44.entities.BancoHoras.update(saldos[0].id, {
            minutos_credito: (saldos[0].minutos_credito || 0) + (registo.minutos_compensados || registo.minutos_extra),
          });
        } else {
          await base44.entities.BancoHoras.create({
            colaborador_id: registo.colaborador_id, colaborador_nome: registo.colaborador_nome,
            enrollid: registo.enrollid, ano,
            minutos_credito: registo.minutos_compensados || registo.minutos_extra,
            minutos_debito: 0, minutos_pagos: 0, owner_email: currentUser?.email,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['horas-extra']);
      queryClient.invalidateQueries(['banco-horas']);
      setAprovacaoId(null);
      toast.success('Horas extra aprovadas e processadas');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const filtered = useMemo(() => registos.filter(r => {
    if (r.data && getYear(parseISO(r.data)) !== Number(anoFilter)) return false;
    if (aprovFilter === 'pendente' && r.aprovado) return false;
    if (aprovFilter === 'aprovado' && !r.aprovado) return false;
    if (search && !r.colaborador_nome?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [registos, aprovFilter, anoFilter, search]);

  const stats = useMemo(() => {
    const anoR = registos.filter(r => r.data && getYear(parseISO(r.data)) === Number(anoFilter));
    return {
      pendentes: anoR.filter(r => !r.aprovado).length,
      totalMin: anoR.filter(r => r.aprovado).reduce((s, r) => s + (r.minutos_extra || 0), 0),
      emRisco: Object.entries(acumuladoMap).filter(([, min]) => min >= LIMITE_ANUAL_MIN * 0.8).length,
    };
  }, [registos, anoFilter, acumuladoMap]);

  const anos = [...new Set(registos.map(r => r.data ? String(getYear(parseISO(r.data))) : null).filter(Boolean))];
  if (!anos.includes(String(new Date().getFullYear()))) anos.unshift(String(new Date().getFullYear()));

  const set = (f, v) => setFormData(p => ({ ...p, [f]: v }));
  const hm = (h, m) => (parseInt(h) || 0) * 60 + (parseInt(m) || 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-100 rounded-xl"><TrendingUp className="h-5 w-5 text-violet-600" /></div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Horas Extra</h1>
              <p className="text-xs text-slate-500">Registo formal e aprovação — art. 268º Código do Trabalho</p>
            </div>
          </div>
          <Button size="sm" onClick={() => { setFormData({ tipo_dia: 'util', destino: 'banco_horas', data: new Date().toLocaleDateString('en-CA') }); setDialogOpen(true); }} className="bg-violet-600 hover:bg-violet-700 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Registar Horas Extra
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { v: stats.pendentes, label: 'Pendentes', color: 'text-violet-600' },
            { v: fmtMin(stats.totalMin), label: `Total aprovadas (${anoFilter})`, color: 'text-emerald-600' },
            { v: stats.emRisco, label: 'Colaboradores >80% limite', color: 'text-amber-600' },
            { v: fmtMin(LIMITE_ANUAL_MIN), label: 'Limite legal (art. 268º)', color: 'text-slate-700' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <p className={cn('text-2xl font-bold', k.color)}>{k.v}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {Object.entries(acumuladoMap).filter(([, min]) => min >= LIMITE_ANUAL_MIN * 0.8).map(([colId, min]) => {
          const col = colaboradores.find(c => c.id === colId);
          const pct = Math.round((min / LIMITE_ANUAL_MIN) * 100);
          return (
            <div key={colId} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm', min >= LIMITE_ANUAL_MIN ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200')}>
              <AlertTriangle className={cn('h-4 w-4 shrink-0', min >= LIMITE_ANUAL_MIN ? 'text-red-500' : 'text-amber-500')} />
              <span className={min >= LIMITE_ANUAL_MIN ? 'text-red-700' : 'text-amber-700'}>
                <strong>{col?.nome || colId}</strong>: {fmtMin(min)} ({pct}% do limite){min >= LIMITE_ANUAL_MIN && ' — LIMITE ATINGIDO'}
              </span>
            </div>
          );
        })}

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          <Select value={anoFilter} onValueChange={setAnoFilter}>
            <SelectTrigger className="bg-white w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={aprovFilter} onValueChange={setAprovFilter}>
            <SelectTrigger className="bg-white w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendentes</SelectItem>
              <SelectItem value="aprovado">Aprovados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>Nenhum registo encontrado</p></CardContent></Card>
        ) : (
          <Card className="bg-white border-slate-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Data</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Tipo Dia</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Tempo</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Fator</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Compens.</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Destino</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                  <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(r => {
                  const acum = acumuladoMap[r.colaborador_id] || 0;
                  const pctLimite = Math.round((acum / LIMITE_ANUAL_MIN) * 100);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{r.colaborador_nome || '—'}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <div className="w-20 bg-slate-100 rounded-full h-1.5">
                            <div className={cn('h-1.5 rounded-full', pctLimite >= 100 ? 'bg-red-500' : pctLimite >= 80 ? 'bg-amber-500' : 'bg-emerald-400')} style={{ width: `${Math.min(100, pctLimite)}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400">{pctLimite}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">{r.data ? format(parseISO(r.data), 'dd/MM/yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-xs">
                          {r.tipo_dia === 'util' ? 'Útil' : r.tipo_dia === 'descanso' ? 'Descanso' : 'Feriado'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-violet-700">{fmtMin(r.minutos_extra)}</td>
                      <td className="px-4 py-3 text-center text-slate-600">×{(r.fator_aplicado || 1.25).toFixed(3)}</td>
                      <td className="px-4 py-3 text-center font-semibold text-emerald-700">{fmtMin(r.minutos_compensados)}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={cn('text-xs', r.destino === 'banco_horas' ? 'bg-blue-100 text-blue-700 border-blue-200' : r.destino === 'pagamento' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500')}>
                          {r.destino === 'banco_horas' ? 'Banco' : r.destino === 'pagamento' ? 'Pagamento' : 'Pendente'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.aprovado
                          ? <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Aprovado</Badge>
                          : <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Pendente</Badge>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!r.aprovado && isAdmin && (
                          <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1" onClick={() => setAprovacaoId(r.id)}>
                            <CheckCircle2 className="h-3 w-3" /> Aprovar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Registar Horas Extra</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Colaborador *</Label>
              <Select value={formData.colaborador_id || ''} onValueChange={v => {
                const col = colaboradores.find(c => c.id === v);
                set('colaborador_id', v); set('colaborador_nome', col?.nome || ''); set('enrollid', col?.enrollid);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {formData.colaborador_id && (
              <div className="p-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                Acumulado {anoFilter}: <strong>{fmtMin(acumuladoMap[formData.colaborador_id] || 0)}</strong> de {fmtMin(LIMITE_ANUAL_MIN)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Data *</Label>
                <Input type="date" value={formData.data || ''} onChange={e => set('data', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Tipo de Dia</Label>
                <Select value={formData.tipo_dia || 'util'} onValueChange={v => set('tipo_dia', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="util">Dia Útil</SelectItem>
                    <SelectItem value="descanso">Descanso/Folga</SelectItem>
                    <SelectItem value="feriado">Feriado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Horas</Label>
                <Input type="number" min="0" max="24" placeholder="0" value={formData._horas || ''} onChange={e => { set('_horas', e.target.value); set('minutos_extra', hm(e.target.value, formData._minutos)); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Minutos</Label>
                <Input type="number" min="0" max="59" placeholder="0" value={formData._minutos || ''} onChange={e => { set('_minutos', e.target.value); set('minutos_extra', hm(formData._horas, e.target.value)); }} />
              </div>
            </div>
            {formData.minutos_extra > 0 && formData.colaborador_id && (
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-sm text-violet-700 space-y-1">
                <p>Fator: <strong>×{calcularFator(formData.tipo_dia || 'util', acumuladoMap[formData.colaborador_id] || 0).toFixed(3)}</strong></p>
                <p>Compensação: <strong>{fmtMin(Math.round((formData.minutos_extra || 0) * calcularFator(formData.tipo_dia || 'util', acumuladoMap[formData.colaborador_id] || 0)))}</strong></p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Destino</Label>
              <Select value={formData.destino || 'banco_horas'} onValueChange={v => set('destino', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banco_horas">Banco de Horas</SelectItem>
                  <SelectItem value="pagamento">Pagamento</SelectItem>
                  <SelectItem value="pendente">Decidir depois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Motivo</Label>
              <Textarea value={formData.motivo || ''} onChange={e => set('motivo', e.target.value)} rows={2} placeholder="ex: Fecho de balanço mensal" />
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={createMutation.isPending || !formData.colaborador_id || !formData.data || !formData.minutos_extra} onClick={() => createMutation.mutate(formData)}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Registar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!aprovacaoId} onOpenChange={open => !open && setAprovacaoId(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Aprovar Horas Extra</DialogTitle></DialogHeader>
          {aprovacaoId && (() => {
            const r = registos.find(x => x.id === aprovacaoId);
            return r ? (
              <div className="space-y-3 text-sm text-slate-600">
                <p>Colaborador: <strong>{r.colaborador_nome}</strong></p>
                <p>Data: <strong>{r.data ? format(parseISO(r.data), 'dd/MM/yyyy') : '—'}</strong></p>
                <p>Horas extra: <strong className="text-violet-600">{fmtMin(r.minutos_extra)}</strong></p>
                <p>Destino: <strong>{r.destino === 'banco_horas' ? 'Banco de Horas' : r.destino === 'pagamento' ? 'Pagamento' : 'Pendente'}</strong></p>
                {r.destino === 'banco_horas' && <p className="text-emerald-600">+{fmtMin(r.minutos_compensados)} serão creditados.</p>}
              </div>
            ) : null;
          })()}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAprovacaoId(null)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => aprovarMutation.mutate(aprovacaoId)}>
              {aprovarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Aprovar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}