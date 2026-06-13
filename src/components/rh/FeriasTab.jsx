import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { differenceInYears, eachDayOfInterval, isWeekend, addMonths, subMonths, startOfMonth, endOfMonth, parseISO, format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useMutation } from '@tanstack/react-query';

import {
  Users, Search, Plus, Pencil, Trash2, Loader2,
  CheckCircle2, XCircle, Sun, CalendarDays, AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

function calcDiasUteis(inicio, fim) {
  if (!inicio || !fim) return 0;
  try { return eachDayOfInterval({ start: parseISO(inicio), end: parseISO(fim) }).filter(d => !isWeekend(d)).length; }
  catch { return 0; }
}

const ESTADO_FERIAS_CFG = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export default function FeriasTab({ colaboradores, pedidosFerias, saldos, anoAtual, currentUser, userTimezone, hoje_date }) {
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === 'admin';

  const [ferSearch, setFerSearch] = useState('');
  const [ferEstado, setFerEstado] = useState('all');
  const [ferDialog, setFerDialog] = useState(false);
  const [ferFormData, setFerFormData] = useState({});
  const [ferEditingIdFerias, setFerEditingIdFerias] = useState(null);
  const [ferDeleteId, setFerDeleteId] = useState(null);
  const [aprovacaoId, setAprovacaoId] = useState(null);
  const [rejeitarId, setRejeitarId] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [mapaMonth, setMapaMonth] = useState(hoje_date);

  // Saldo editing
  const [saldoEditing, setSaldoEditing] = useState(null);
  const [saldoEditForm, setSaldoEditForm] = useState({});

  const ferSaveMutation = useMutation({
    mutationFn: async (data) => {
      const diasUteis = calcDiasUteis(data.data_inicio, data.data_fim);
      const payload = { ...data, dias_uteis: diasUteis, ano: data.data_inicio ? parseISO(data.data_inicio).getFullYear() : anoAtual };
      if (ferEditingIdFerias) return base44.entities.PedidoFerias.update(ferEditingIdFerias, payload);
      return base44.entities.PedidoFerias.create({ ...payload, estado: 'pendente', owner_email: currentUser?.email });
    },
    onSuccess: () => { queryClient.invalidateQueries(['pedidos-ferias']); setFerDialog(false); setFerFormData({}); setFerEditingIdFerias(null); toast.success(ferEditingIdFerias ? 'Pedido atualizado' : 'Pedido registado'); },
  });
  const ferDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PedidoFerias.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['pedidos-ferias']); setFerDeleteId(null); toast.success('Pedido eliminado'); },
  });
  const ferAprovarMutation = useMutation({
    mutationFn: (id) => base44.entities.PedidoFerias.update(id, { estado: 'aprovado', aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString() }),
    onSuccess: async (_, id) => {
      const pedido = pedidosFerias.find(p => p.id === id);
      if (pedido) { const saldo = saldos.find(s => s.colaborador_id === pedido.colaborador_id && s.ano === pedido.ano); if (saldo) await base44.entities.SaldoFerias.update(saldo.id, { dias_marcados: (saldo.dias_marcados || 0) + (pedido.dias_uteis || 0) }); }
      queryClient.invalidateQueries(['pedidos-ferias']); queryClient.invalidateQueries(['saldos-ferias']); setAprovacaoId(null); toast.success('Férias aprovadas');
    },
  });
  const ferRejeitarMutation = useMutation({
    mutationFn: ({ id, motivo }) => base44.entities.PedidoFerias.update(id, { estado: 'rejeitado', motivo_rejeicao: motivo, aprovado_por: currentUser?.email, aprovado_em: new Date().toISOString() }),
    onSuccess: () => { queryClient.invalidateQueries(['pedidos-ferias']); setRejeitarId(null); setMotivoRejeicao(''); toast.success('Pedido rejeitado'); },
  });
  const saldoSaveMutation = useMutation({
    mutationFn: (data) => base44.entities.SaldoFerias.update(saldoEditing, data),
    onSuccess: () => { queryClient.invalidateQueries(['saldos-ferias']); setSaldoEditing(null); setSaldoEditForm({}); toast.success('Saldo atualizado'); },
  });

  const ferFiltered = React.useMemo(() => pedidosFerias.filter(p => {
    const matchSearch = !ferSearch || p.colaborador_nome?.toLowerCase().includes(ferSearch.toLowerCase());
    return matchSearch && (ferEstado === 'all' || p.estado === ferEstado);
  }), [pedidosFerias, ferSearch, ferEstado]);

  const diasMes = eachDayOfInterval({ start: startOfMonth(mapaMonth), end: endOfMonth(mapaMonth) });
  const aprovadosNoMes = pedidosFerias.filter(p => p.estado === 'aprovado').map(p => ({
    ...p, dias: (() => { try { return eachDayOfInterval({ start: parseISO(p.data_inicio), end: parseISO(p.data_fim) }); } catch { return []; } })(),
  }));
  const saldoMap = Object.fromEntries(saldos.map(s => [s.colaborador_id, s]));
  const setFer = (f, v) => setFerFormData(prev => ({ ...prev, [f]: v }));

  const handleSaldoEdit = (s) => {
    setSaldoEditing(s.id);
    setSaldoEditForm({
      dias_direito: s.dias_direito ?? 22,
      dias_gozados: s.dias_gozados ?? 0,
      dias_marcados: s.dias_marcados ?? 0,
      dias_transita_anterior: s.dias_transita_anterior ?? 0,
    });
  };

  return (
    <div className="space-y-4">
      {/* KPIs + Botão */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendentes', value: pedidosFerias.filter(p => p.estado === 'pendente').length, color: 'text-amber-600' },
            { label: `Aprovados (${anoAtual})`, value: pedidosFerias.filter(p => p.estado === 'aprovado' && p.ano === anoAtual).length, color: 'text-emerald-600' },
            { label: 'Rejeitados', value: pedidosFerias.filter(p => p.estado === 'rejeitado').length, color: 'text-red-600' },
            { label: 'Com saldo', value: saldos.length, color: 'text-blue-600' },
          ].map((k, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button size="sm" onClick={() => { setFerEditingIdFerias(null); setFerFormData({}); setFerDialog(true); }} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 self-start">
          <Plus className="h-3.5 w-3.5" /> Registar Pedido
        </Button>
      </div>

      <Tabs defaultValue="pedidos">
        <TabsList><TabsTrigger value="pedidos">Pedidos</TabsTrigger><TabsTrigger value="saldos">Saldos {anoAtual}</TabsTrigger><TabsTrigger value="mapa">Mapa</TabsTrigger></TabsList>

        {/* PEDIDOS */}
        <TabsContent value="pedidos" className="mt-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input placeholder="Pesquisar colaborador..." value={ferSearch} onChange={e => setFerSearch(e.target.value)} className="pl-10 bg-white" />
            </div>
            <Select value={ferEstado} onValueChange={setFerEstado}>
              <SelectTrigger className="bg-white w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(ESTADO_FERIAS_CFG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {ferFiltered.length === 0 ? (
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
                  {ferFiltered.map(p => {
                    const cfg = ESTADO_FERIAS_CFG[p.estado] || ESTADO_FERIAS_CFG.pendente;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.colaborador_nome || '—'}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs">{p.data_inicio ? format(parseISO(p.data_inicio), 'dd/MM/yyyy') : '—'} → {p.data_fim ? format(parseISO(p.data_fim), 'dd/MM/yyyy') : '—'}</td>
                        <td className="px-4 py-3"><span className="text-sm font-semibold text-slate-700">{p.dias_uteis || calcDiasUteis(p.data_inicio, p.data_fim)}</span><span className="text-xs text-slate-400 ml-1">dias</span></td>
                        <td className="px-4 py-3"><Badge className={cn('text-xs', cfg.cls)}>{cfg.label}</Badge>{p.motivo_rejeicao && <p className="text-[10px] text-red-500 mt-0.5">{p.motivo_rejeicao}</p>}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" title="Editar" onClick={() => { setFerEditingIdFerias(p.id); setFerFormData({ colaborador_id: p.colaborador_id, colaborador_nome: p.colaborador_nome, enrollid: p.enrollid, data_inicio: p.data_inicio, data_fim: p.data_fim, observacoes: p.observacoes }); setFerDialog(true); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {isAdmin && p.estado === 'pendente' && (
                              <>
                                <Button size="sm" className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700" title="Aprovar" onClick={() => setAprovacaoId(p.id)}><CheckCircle2 className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-600 border-red-300 hover:bg-red-50" title="Rejeitar" onClick={() => setRejeitarId(p.id)}><XCircle className="h-3 w-3" /></Button>
                              </>
                            )}
                            {isAdmin && <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" title="Eliminar" onClick={() => setFerDeleteId(p.id)}><Trash2 className="h-3 w-3" /></Button>}
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

        {/* SALDOS */}
        <TabsContent value="saldos" className="mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-slate-600">Saldos de férias — {anoAtual}</p>
            <Button size="sm" variant="outline" className="text-xs" onClick={async () => {
              for (const c of colaboradores.filter(c => c.ativo !== false)) {
                const exists = saldos.find(s => s.colaborador_id === c.id);
                if (!exists) await base44.entities.SaldoFerias.create({ colaborador_id: c.id, colaborador_nome: c.nome, enrollid: c.enrollid, ano: anoAtual, dias_direito: 22, dias_gozados: 0, dias_marcados: 0, dias_transita_anterior: 0, owner_email: currentUser?.email });
              }
              queryClient.invalidateQueries(['saldos-ferias']); toast.success('Saldos inicializados');
            }}>Inicializar saldos em falta</Button>
          </div>
          {saldos.length === 0 ? (
            <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><p>Nenhum saldo. Clique em "Inicializar saldos".</p></CardContent></Card>
          ) : (
            <Card className="bg-white border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 border-b">
                  <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Direito</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Marcados</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Gozados</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Saldo</th>
                  <th className="text-center px-4 py-3 text-xs uppercase font-semibold text-slate-500">Progresso</th>
                  <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500 w-16">Ações</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {saldos.map(s => {
                    const disponivel = (s.dias_direito || 22) + (s.dias_transita_anterior || 0) - (s.dias_marcados || 0) - (s.dias_gozados || 0);
                    const usado = (s.dias_marcados || 0) + (s.dias_gozados || 0);
                    const pct = Math.min(100, Math.round((usado / (s.dias_direito || 22)) * 100));
                    const isEditing = saldoEditing === s.id;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-800">{s.colaborador_nome}</td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? <Input type="number" className="w-16 h-7 text-xs mx-auto text-center" value={saldoEditForm.dias_direito} onChange={e => setSaldoEditForm(f => ({ ...f, dias_direito: Number(e.target.value) }))} /> : <span className="text-slate-700">{s.dias_direito || 22}</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? <Input type="number" className="w-16 h-7 text-xs mx-auto text-center" value={saldoEditForm.dias_marcados} onChange={e => setSaldoEditForm(f => ({ ...f, dias_marcados: Number(e.target.value) }))} /> : <span className="text-blue-600 font-medium">{s.dias_marcados || 0}</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isEditing ? <Input type="number" className="w-16 h-7 text-xs mx-auto text-center" value={saldoEditForm.dias_gozados} onChange={e => setSaldoEditForm(f => ({ ...f, dias_gozados: Number(e.target.value) }))} /> : <span className="text-purple-600 font-medium">{s.dias_gozados || 0}</span>}
                        </td>
                        <td className="px-4 py-3 text-center"><span className={cn('font-bold', disponivel < 5 ? 'text-red-600' : disponivel < 10 ? 'text-amber-600' : 'text-emerald-600')}>{disponivel}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2"><div className="flex-1 bg-slate-100 rounded-full h-2"><div className={cn('h-2 rounded-full', pct >= 80 ? 'bg-red-400' : 'bg-emerald-400')} style={{ width: `${pct}%` }} /></div><span className="text-xs text-slate-400 w-8">{pct}%</span></div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-0.5">
                            {isEditing ? (
                              <>
                                <Button size="sm" className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={saldoSaveMutation.isPending} onClick={() => saldoSaveMutation.mutate(saldoEditForm)}>
                                  {saldoSaveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                </Button>
                                <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => { setSaldoEditing(null); setSaldoEditForm({}); }}><XCircle className="h-3 w-3 text-slate-400" /></Button>
                              </>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Editar saldo" onClick={() => handleSaldoEdit(s)}>
                                <Pencil className="h-3 w-3 text-slate-400 hover:text-blue-600" />
                              </Button>
                            )}
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

        {/* MAPA */}
        <TabsContent value="mapa" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">{format(mapaMonth, 'MMMM yyyy', { locale: pt })}</CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setMapaMonth(subMonths(mapaMonth, 1))}>‹</Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => setMapaMonth(addMonths(mapaMonth, 1))}>›</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead><tr>
                  <th className="text-left px-2 py-1 bg-slate-50 border border-slate-200 min-w-[140px] sticky left-0 z-10">Colaborador</th>
                  {diasMes.map(d => (
                    <th key={d.toISOString()} className={cn('px-1 py-1 border border-slate-200 text-center w-7 font-medium', isWeekend(d) ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 text-slate-600')}>{format(d, 'd')}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {colaboradores.filter(c => c.ativo !== false).slice(0, 30).map(col => {
                    const feriasDaysSet = new Set(aprovadosNoMes.filter(p => p.colaborador_id === col.id).flatMap(p => p.dias.map(d => format(d, 'yyyy-MM-dd'))));
                    return (
                      <tr key={col.id} className="hover:bg-slate-50">
                        <td className="px-2 py-1 border border-slate-200 font-medium text-slate-700 sticky left-0 bg-white z-10 truncate max-w-[140px]">{col.nome}</td>
                        {diasMes.map(d => {
                          const key = format(d, 'yyyy-MM-dd');
                          const emFerias = feriasDaysSet.has(key);
                          return <td key={key} className={cn('border border-slate-200 text-center h-6', isWeekend(d) ? 'bg-slate-50' : '', emFerias ? 'bg-emerald-400' : '')}>{emFerias && <span className="text-white text-[10px]">F</span>}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Férias form dialog */}
      <Dialog open={ferDialog} onOpenChange={setFerDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{ferEditingIdFerias ? 'Editar Pedido de Férias' : 'Registar Pedido de Férias'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-600">Colaborador *</Label>
              <Select value={ferFormData.colaborador_id || ''} onValueChange={v => { const col = colaboradores.find(c => c.id === v); setFer('colaborador_id', v); setFer('colaborador_nome', col?.nome || ''); setFer('enrollid', col?.enrollid); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>{colaboradores.filter(c => c.ativo !== false).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-slate-600">Data Início *</Label><Input type="date" value={ferFormData.data_inicio || ''} onChange={e => setFer('data_inicio', e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-slate-600">Data Fim *</Label><Input type="date" value={ferFormData.data_fim || ''} onChange={e => setFer('data_fim', e.target.value)} /></div>
            </div>
            {ferFormData.data_inicio && ferFormData.data_fim && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <strong>{calcDiasUteis(ferFormData.data_inicio, ferFormData.data_fim)}</strong> dias úteis
                {ferFormData.colaborador_id && saldoMap[ferFormData.colaborador_id] && (
                  <span className="ml-2 text-xs text-emerald-600">(Saldo: {(saldoMap[ferFormData.colaborador_id]?.dias_direito || 22) - (saldoMap[ferFormData.colaborador_id]?.dias_marcados || 0) - (saldoMap[ferFormData.colaborador_id]?.dias_gozados || 0)} dias)</span>
                )}
              </div>
            )}
            <div className="space-y-1.5"><Label className="text-xs font-medium text-slate-600">Observações</Label><Textarea value={ferFormData.observacoes || ''} onChange={e => setFer('observacoes', e.target.value)} rows={2} /></div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setFerDialog(false)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={ferSaveMutation.isPending || !ferFormData.colaborador_id || !ferFormData.data_inicio || !ferFormData.data_fim} onClick={() => ferSaveMutation.mutate(ferFormData)}>
              {ferSaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{ferEditingIdFerias ? 'Guardar' : 'Registar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Aprovar dialog */}
      <Dialog open={!!aprovacaoId} onOpenChange={open => !open && setAprovacaoId(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Aprovar Férias</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-600">Confirma a aprovação deste pedido?</p>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setAprovacaoId(null)}>Cancelar</Button>
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => ferAprovarMutation.mutate(aprovacaoId)}>
              {ferAprovarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Aprovar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejeitar dialog */}
      <Dialog open={!!rejeitarId} onOpenChange={open => !open && setRejeitarId(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader><DialogTitle>Rejeitar Pedido</DialogTitle></DialogHeader>
          <div className="space-y-1.5"><Label className="text-xs font-medium text-slate-600">Motivo</Label><Textarea value={motivoRejeicao} onChange={e => setMotivoRejeicao(e.target.value)} rows={3} placeholder="Indique o motivo..." /></div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRejeitarId(null)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => ferRejeitarMutation.mutate({ id: rejeitarId, motivo: motivoRejeicao })}>
              {ferRejeitarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Rejeitar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <AlertDialog open={!!ferDeleteId} onOpenChange={open => !open && setFerDeleteId(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Eliminar Pedido?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => ferDeleteMutation.mutate(ferDeleteId)}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}