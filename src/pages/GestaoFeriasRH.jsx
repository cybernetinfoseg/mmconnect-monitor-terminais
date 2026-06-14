import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Plus, Search, CheckCircle2, XCircle,
  Clock, Loader2, ChevronLeft, ChevronRight, Sun
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  format, parseISO, differenceInCalendarDays, eachDayOfInterval,
  isWeekend, addMonths, subMonths, startOfMonth, endOfMonth,
  isSameMonth, getDay, addDays
} from 'date-fns';
import { pt } from 'date-fns/locale';

const ESTADO_CFG = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

function calcDiasUteis(inicio, fim) {
  if (!inicio || !fim) return 0;
  try {
    const days = eachDayOfInterval({ start: parseISO(inicio), end: parseISO(fim) });
    return days.filter(d => !isWeekend(d)).length;
  } catch { return 0; }
}

export default function GestaoFeriasRH() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({});
  const [aprovacaoId, setAprovacaoId] = useState(null);
  const [rejeitarId, setRejeitarId] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [mapaMonth, setMapaMonth] = useState(new Date());
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === 'admin';
  const anoAtual = new Date().getFullYear();

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos-ferias'],
    queryFn: () => base44.entities.PedidoFerias.list('-created_date', 500),
    enabled: !!currentUser,
  });

  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos-ferias', anoAtual],
    queryFn: () => base44.entities.SaldoFerias.filter({ ano: anoAtual }, 'colaborador_nome', 200),
    enabled: !!currentUser,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-ferias'],
    queryFn: () => base44.entities.Colaborador.filter({ ativo: true }, 'nome', 500),
    enabled: !!currentUser,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const diasUteis = calcDiasUteis(data.data_inicio, data.data_fim);
      return base44.entities.PedidoFerias.create({
        ...data,
        dias_uteis: diasUteis,
        ano: data.data_inicio ? parseISO(data.data_inicio).getFullYear() : anoAtual,
        estado: 'pendente',
        owner_email: currentUser?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['pedidos-ferias']);
      setDialogOpen(false); setFormData({});
      toast.success('Pedido de férias registado');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const aprovarMutation = useMutation({
    mutationFn: (id) => base44.entities.PedidoFerias.update(id, {
      estado: 'aprovado', aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(),
    }),
    onSuccess: async (_, id) => {
      // Atualiza saldo
      const pedido = pedidos.find(p => p.id === id);
      if (pedido) {
        const saldo = saldos.find(s => s.colaborador_id === pedido.colaborador_id && s.ano === pedido.ano);
        if (saldo) {
          await base44.entities.SaldoFerias.update(saldo.id, {
            dias_marcados: (saldo.dias_marcados || 0) + (pedido.dias_uteis || 0),
          });
        }
      }
      queryClient.invalidateQueries(['pedidos-ferias']);
      queryClient.invalidateQueries(['saldos-ferias']);
      setAprovacaoId(null);
      toast.success('Férias aprovadas');
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: ({ id, motivo }) => base44.entities.PedidoFerias.update(id, {
      estado: 'rejeitado', motivo_rejeicao: motivo, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['pedidos-ferias']);
      setRejeitarId(null); setMotivoRejeicao('');
      toast.success('Pedido rejeitado');
    },
  });

  const filtered = useMemo(() => pedidos.filter(p => {
    const matchSearch = !search || p.colaborador_nome?.toLowerCase().includes(search.toLowerCase());
    const matchEstado = estadoFilter === 'all' || p.estado === estadoFilter;
    return matchSearch && matchEstado;
  }), [pedidos, search, estadoFilter]);

  const pendentes = pedidos.filter(p => p.estado === 'pendente');

  // Mapa de férias do mês atual
  const diasMes = eachDayOfInterval({ start: startOfMonth(mapaMonth), end: endOfMonth(mapaMonth) });
  const aprovadosNoMes = pedidos.filter(p => p.estado === 'aprovado').map(p => ({
    ...p,
    dias: (() => {
      try {
        return eachDayOfInterval({ start: parseISO(p.data_inicio), end: parseISO(p.data_fim) });
      } catch { return []; }
    })(),
  }));

  const saldoMap = Object.fromEntries(saldos.map(s => [s.colaborador_id, s]));

  const set = (f, v) => setFormData(prev => ({ ...prev, [f]: v }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl">
              <CalendarDays className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Gestão de Férias</h1>
              <p className="text-xs text-slate-500">{pendentes.length} pedido(s) pendente(s)</p>
            </div>
          </div>
          <Button size="sm" onClick={() => { setFormData({}); setDialogOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Registar Pedido
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendentes', value: pedidos.filter(p => p.estado === 'pendente').length, color: 'text-amber-600' },
            { label: 'Aprovados (ano)', value: pedidos.filter(p => p.estado === 'aprovado' && p.ano === anoAtual).length, color: 'text-emerald-600' },
            { label: 'Rejeitados', value: pedidos.filter(p => p.estado === 'rejeitado').length, color: 'text-red-600' },
            { label: 'Colaboradores c/ saldo', value: saldos.length, color: 'text-blue-600' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="pedidos">
          <TabsList>
            <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
            <TabsTrigger value="saldos">Saldos {anoAtual}</TabsTrigger>
            <TabsTrigger value="mapa">Mapa de Férias</TabsTrigger>
          </TabsList>

          {/* Tab Pedidos */}
          <TabsContent value="pedidos" className="mt-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
              </div>
              <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                <SelectTrigger className="bg-white w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(ESTADO_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : filtered.length === 0 ? (
              <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><Sun className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>Nenhum pedido encontrado</p></CardContent></Card>
            ) : (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                      <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Período</th>
                      <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Dias Úteis</th>
                      <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                      <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(p => {
                      const cfg = ESTADO_CFG[p.estado] || ESTADO_CFG.pendente;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{p.colaborador_nome || '—'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {p.data_inicio ? format(parseISO(p.data_inicio), 'dd/MM/yyyy') : '—'}
                            {' → '}
                            {p.data_fim ? format(parseISO(p.data_fim), 'dd/MM/yyyy') : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-slate-700">{p.dias_uteis || calcDiasUteis(p.data_inicio, p.data_fim)}</span>
                            <span className="text-xs text-slate-400 ml-1">dias</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={cn('text-xs', cfg.cls)}>{cfg.label}</Badge>
                            {p.motivo_rejeicao && <p className="text-[10px] text-red-500 mt-0.5">{p.motivo_rejeicao}</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {p.estado === 'pendente' && isAdmin && (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-xs gap-1" onClick={() => setAprovacaoId(p.id)}>
                                  <CheckCircle2 className="h-3 w-3" /> Aprovar
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-red-600 border-red-300 hover:bg-red-50 text-xs gap-1" onClick={() => setRejeitarId(p.id)}>
                                  <XCircle className="h-3 w-3" /> Rejeitar
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </TabsContent>

          {/* Tab Saldos */}
          <TabsContent value="saldos" className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-600">Saldos de férias — {anoAtual}</p>
              <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
                for (const c of colaboradores) {
                  const exists = saldos.find(s => s.colaborador_id === c.id);
                  if (!exists) {
                    await base44.entities.SaldoFerias.create({
                      colaborador_id: c.id, colaborador_nome: c.nome, enrollid: c.enrollid,
                      ano: anoAtual, dias_direito: 22, dias_gozados: 0, dias_marcados: 0, dias_transita_anterior: 0,
                      owner_email: currentUser?.email,
                    });
                  }
                }
                queryClient.invalidateQueries(['saldos-ferias']);
                toast.success('Saldos criados para colaboradores sem registo');
              }}>
                Inicializar saldos em falta
              </Button>
            </div>
            {saldos.length === 0 ? (
              <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><p>Nenhum saldo criado. Clique em "Inicializar saldos".</p></CardContent></Card>
            ) : (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b">
                      <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                      <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Direito</th>
                      <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Marcados</th>
                      <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Gozados</th>
                      <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Saldo</th>
                      <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Progresso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {saldos.map(s => {
                      const disponivel = (s.dias_direito || 22) + (s.dias_transita_anterior || 0) - (s.dias_marcados || 0) - (s.dias_gozados || 0);
                      const usado = (s.dias_marcados || 0) + (s.dias_gozados || 0);
                      const pct = Math.min(100, Math.round((usado / (s.dias_direito || 22)) * 100));
                      return (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{s.colaborador_nome}</td>
                          <td className="px-4 py-3 text-center text-slate-700">{s.dias_direito || 22}</td>
                          <td className="px-4 py-3 text-center text-blue-600 font-medium">{s.dias_marcados || 0}</td>
                          <td className="px-4 py-3 text-center text-purple-600 font-medium">{s.dias_gozados || 0}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn('font-bold', disponivel < 5 ? 'text-red-600' : disponivel < 10 ? 'text-amber-600' : 'text-emerald-600')}>
                              {disponivel}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-slate-100 rounded-full h-2">
                                <div className={cn('h-2 rounded-full transition-all', pct >= 80 ? 'bg-red-400' : 'bg-emerald-400')} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400 w-8">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            )}
          </TabsContent>

          {/* Tab Mapa */}
          <TabsContent value="mapa" className="mt-4">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    {format(mapaMonth, 'MMMM yyyy', { locale: pt })}
                  </CardTitle>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setMapaMonth(subMonths(mapaMonth, 1))}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setMapaMonth(addMonths(mapaMonth, 1))}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-2 py-1 bg-slate-50 border border-slate-200 min-w-[140px] sticky left-0 z-10">Colaborador</th>
                      {diasMes.map(d => (
                        <th key={d.toISOString()} className={cn(
                          'px-1 py-1 border border-slate-200 text-center w-7 font-medium',
                          isWeekend(d) ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 text-slate-600'
                        )}>
                          {format(d, 'd')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {colaboradores.slice(0, 30).map(col => {
                      const feriasDaysSet = new Set(
                        aprovadosNoMes
                          .filter(p => p.colaborador_id === col.id)
                          .flatMap(p => p.dias.map(d => format(d, 'yyyy-MM-dd')))
                      );
                      return (
                        <tr key={col.id} className="hover:bg-slate-50">
                          <td className="px-2 py-1 border border-slate-200 font-medium text-slate-700 sticky left-0 bg-white z-10 truncate max-w-[140px]">
                            {col.nome}
                          </td>
                          {diasMes.map(d => {
                            const key = format(d, 'yyyy-MM-dd');
                            const emFerias = feriasDaysSet.has(key);
                            return (
                              <td key={key} className={cn(
                                'border border-slate-200 text-center h-6',
                                isWeekend(d) ? 'bg-slate-50' : '',
                                emFerias ? 'bg-emerald-400' : ''
                              )}>
                                {emFerias && <span className="text-white text-[10px]">F</span>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-emerald-400 rounded" /><span>Férias aprovadas</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-slate-100 rounded" /><span>Fim de semana</span></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Novo Pedido Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Registar Pedido de Férias</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Colaborador *</Label>
              <Select value={formData.colaborador_id || ''} onValueChange={v => {
                const col = colaboradores.find(c => c.id === v);
                set('colaborador_id', v);
                set('colaborador_nome', col?.nome || '');
                set('enrollid', col?.enrollid);
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Data Início *</Label>
                <Input type="date" value={formData.data_inicio || ''} onChange={e => set('data_inicio', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Data Fim *</Label>
                <Input type="date" value={formData.data_fim || ''} onChange={e => set('data_fim', e.target.value)} />
              </div>
            </div>
            {formData.data_inicio && formData.data_fim && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <strong>{calcDiasUteis(formData.data_inicio, formData.data_fim)}</strong> dias úteis
                {formData.colaborador_id && saldoMap[formData.colaborador_id] && (
                  <span className="ml-2 text-xs text-emerald-600">
                    (Saldo disponível: {(saldoMap[formData.colaborador_id]?.dias_direito || 22) - (saldoMap[formData.colaborador_id]?.dias_marcados || 0) - (saldoMap[formData.colaborador_id]?.dias_gozados || 0)} dias)
                  </span>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Observações</Label>
              <Textarea value={formData.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={createMutation.isPending || !formData.colaborador_id || !formData.data_inicio || !formData.data_fim} onClick={() => createMutation.mutate(formData)}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Registar Pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Aprovar Dialog */}
      <Dialog open={!!aprovacaoId} onOpenChange={open => !open && setAprovacaoId(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Aprovar Férias</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Confirma a aprovação deste pedido de férias?</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAprovacaoId(null)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => aprovarMutation.mutate(aprovacaoId)}>
              {aprovarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Aprovar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejeitar Dialog */}
      <Dialog open={!!rejeitarId} onOpenChange={open => !open && setRejeitarId(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Rejeitar Pedido</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-slate-600">Motivo da Rejeição</Label>
            <Textarea value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} rows={3} placeholder="Indique o motivo..." />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRejeitarId(null)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => rejeitarMutation.mutate({ id: rejeitarId, motivo: motivoRejeicao })}>
              {rejeitarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Rejeitar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}