import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, CheckCircle2, XCircle, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

const TIPO_FALTA_CORES = {
  injustificada: 'bg-red-100 text-red-700',
  justificada_documento: 'bg-green-100 text-green-700',
  justificada_verbal: 'bg-blue-100 text-blue-700',
  falta_autorizada: 'bg-purple-100 text-purple-700',
};

export default function TabBaixasJustificacoes({ currentUser, colaboradores }) {
  const isAdmin = currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  // Baixas state
  const [baixaDialog, setBaixaDialog] = useState(false);
  const [novaBaixa, setNovaBaixa] = useState({});
  const [filtroBaixa, setFiltroBaixa] = useState('todas');

  // Justificações state
  const [justDialog, setJustDialog] = useState(false);
  const [novaJust, setNovaJust] = useState({});
  const [deleteJustId, setDeleteJustId] = useState(null);
  const [filtroJust, setFiltroJust] = useState('todas');
  const [searchJust, setSearchJust] = useState('');

  const { data: baixas = [], isLoading: loadingBaixas } = useQuery({
    queryKey: ['baixas_medicas'],
    queryFn: () => base44.entities.BaixaMedica.list('-data_inicio', 500),
    enabled: !!currentUser,
  });

  const { data: justificacoes = [], isLoading: loadingJust } = useQuery({
    queryKey: ['justificacoes'],
    queryFn: () => base44.entities.JustificacaoFalta.list('-data_falta', 500),
    enabled: !!currentUser,
  });

  const createBaixaMutation = useMutation({
    mutationFn: (data) => base44.entities.BaixaMedica.create({ ...data, owner_email: currentUser?.email }),
    onSuccess: () => { queryClient.invalidateQueries(['baixas_medicas']); setBaixaDialog(false); setNovaBaixa({}); toast.success('Baixa registada'); },
  });

  const createJustMutation = useMutation({
    mutationFn: (data) => base44.entities.JustificacaoFalta.create({ ...data, owner_email: currentUser?.email }),
    onSuccess: () => { queryClient.invalidateQueries(['justificacoes']); setJustDialog(false); setNovaJust({}); toast.success('Justificação registada'); },
  });

  const approveJustMutation = useMutation({
    mutationFn: ({ id }) => base44.entities.JustificacaoFalta.update(id, { aprovado: true, aprovado_em: new Date().toISOString(), aprovado_por: currentUser?.email }),
    onSuccess: () => { queryClient.invalidateQueries(['justificacoes']); toast.success('Aprovado'); },
  });

  const deleteJustMutation = useMutation({
    mutationFn: (id) => base44.entities.JustificacaoFalta.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['justificacoes']); setDeleteJustId(null); toast.success('Eliminado'); },
  });

  const filteredBaixas = filtroBaixa === 'todas' ? baixas : baixas.filter(b => b.tipo === filtroBaixa);
  const filteredJust = useMemo(() => justificacoes.filter(j => {
    if (filtroJust !== 'todas' && j.tipo !== filtroJust) return false;
    return j.colaborador_nome?.toLowerCase().includes(searchJust.toLowerCase());
  }), [justificacoes, filtroJust, searchJust]);

  // Stats
  const baixasAtivas = baixas.filter(b => !b.data_fim || new Date(b.data_fim) >= new Date()).length;
  const justPendentes = justificacoes.filter(j => !j.aprovado).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Baixas Ativas', value: baixasAtivas, color: 'text-red-600' },
          { label: 'Total Baixas', value: baixas.length, color: 'text-slate-700' },
          { label: 'Just. Pendentes', value: justPendentes, color: 'text-amber-600' },
          { label: 'Total Justificações', value: justificacoes.length, color: 'text-slate-700' },
        ].map((k, i) => (
          <Card key={i} className="bg-white border-slate-200"><CardContent className="p-4"><p className={cn('text-2xl font-bold', k.color)}>{k.value}</p><p className="text-xs text-slate-500 mt-0.5">{k.label}</p></CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="baixas">
        <TabsList>
          <TabsTrigger value="baixas">Baixas Médicas</TabsTrigger>
          <TabsTrigger value="justificacoes">Justificações de Faltas</TabsTrigger>
        </TabsList>

        {/* Baixas */}
        <TabsContent value="baixas" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Select value={filtroBaixa} onValueChange={setFiltroBaixa}>
              <SelectTrigger className="bg-white w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="doenca">Doença</SelectItem>
                <SelectItem value="acidente_trabalho">Acidente de Trabalho</SelectItem>
                <SelectItem value="licenca_maternidade">Licença Maternidade</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { setNovaBaixa({}); setBaixaDialog(true); }} className="bg-red-600 hover:bg-red-700 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Baixa
            </Button>
          </div>
          {loadingBaixas ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div> : (
            <div className="grid gap-3">
              {filteredBaixas.length === 0 ? (
                <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-40" /><p>Nenhuma baixa registada</p></CardContent></Card>
              ) : filteredBaixas.map(b => (
                <Card key={b.id} className="bg-white border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-800">{b.colaborador_nome}</p>
                        <p className="text-sm text-slate-500">{b.data_inicio ? format(parseISO(b.data_inicio), 'dd/MM/yyyy') : '—'} → {b.data_fim ? format(parseISO(b.data_fim), 'dd/MM/yyyy') : '—'}</p>
                      </div>
                      <Badge className="bg-red-100 text-red-700">{(b.tipo || '').replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-3">
                      <div><span className="font-medium text-slate-600">Dias:</span> <span className="text-slate-800">{b.dias_total || '—'}</span></div>
                      <div><span className="font-medium text-slate-600">SS:</span> <span className={b.ss_confirmada ? 'text-emerald-600' : 'text-slate-400'}>{b.ss_confirmada ? 'Confirmada' : 'Não confirmada'}</span></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Justificações */}
        <TabsContent value="justificacoes" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Pesquisar colaborador..." value={searchJust} onChange={e => setSearchJust(e.target.value)} className="bg-white w-[200px]" />
              <Select value={filtroJust} onValueChange={setFiltroJust}>
                <SelectTrigger className="bg-white w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  <SelectItem value="injustificada">Injustificadas</SelectItem>
                  <SelectItem value="justificada_documento">Com Documento</SelectItem>
                  <SelectItem value="justificada_verbal">Verbal</SelectItem>
                  <SelectItem value="falta_autorizada">Autorizadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={() => { setNovaJust({}); setJustDialog(true); }} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova Justificação
            </Button>
          </div>
          {loadingJust ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div> : (
            <div className="grid gap-3">
              {filteredJust.length === 0 ? (
                <Card className="bg-white"><CardContent className="py-12 text-center text-slate-400"><p>Nenhuma justificação encontrada</p></CardContent></Card>
              ) : filteredJust.map(j => (
                <Card key={j.id} className="bg-white border-slate-200">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-800">{j.colaborador_nome}</p>
                        <p className="text-sm text-slate-500">Data: {j.data_falta ? format(parseISO(j.data_falta), 'dd/MM/yyyy') : '—'}</p>
                        {j.motivo && <p className="text-sm text-slate-600 mt-1">Motivo: {j.motivo}</p>}
                      </div>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Badge className={cn('text-xs', TIPO_FALTA_CORES[j.tipo] || 'bg-slate-100 text-slate-600')}>{(j.tipo || '').replace(/_/g, ' ')}</Badge>
                        <Badge className={j.aprovado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{j.aprovado ? '✓ Aprovado' : 'Pendente'}</Badge>
                      </div>
                    </div>
                    {!j.aprovado && isAdmin && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 text-emerald-600" onClick={() => approveJustMutation.mutate({ id: j.id })}>
                          <CheckCircle2 className="h-3 w-3" /> Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500" onClick={() => setDeleteJustId(j.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Nova Baixa */}
      <Dialog open={baixaDialog} onOpenChange={setBaixaDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Registar Baixa Médica</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Colaborador</label>
              <select value={novaBaixa.colaborador_id || ''} onChange={(e) => { const colab = colaboradores.find(c => c.id === e.target.value); setNovaBaixa({ ...novaBaixa, colaborador_id: e.target.value, colaborador_nome: colab?.nome, enrollid: colab?.enrollid }); }} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white">
                <option value="">Selecione colaborador...</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Data Início</label><Input type="date" value={novaBaixa.data_inicio || ''} onChange={e => setNovaBaixa({ ...novaBaixa, data_inicio: e.target.value })} /></div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1">Data Fim</label><Input type="date" value={novaBaixa.data_fim || ''} onChange={e => setNovaBaixa({ ...novaBaixa, data_fim: e.target.value })} /></div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select value={novaBaixa.tipo || ''} onChange={e => setNovaBaixa({ ...novaBaixa, tipo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white">
                <option value="">Tipo de baixa...</option>
                <option value="doenca">Doença</option>
                <option value="acidente_trabalho">Acidente de Trabalho</option>
                <option value="licenca_maternidade">Licença Maternidade</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Dias totais</label><Input type="number" value={novaBaixa.dias_total || ''} onChange={e => setNovaBaixa({ ...novaBaixa, dias_total: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setBaixaDialog(false)}>Cancelar</Button>
            <Button className="flex-1 bg-red-600 hover:bg-red-700" disabled={createBaixaMutation.isPending || !novaBaixa.colaborador_id} onClick={() => createBaixaMutation.mutate(novaBaixa)}>
              {createBaixaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Registar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Justificação */}
      <Dialog open={justDialog} onOpenChange={setJustDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Registar Justificação de Falta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Colaborador</label>
              <select value={novaJust.colaborador_id || ''} onChange={(e) => { const colab = colaboradores.find(c => c.id === e.target.value); setNovaJust({ ...novaJust, colaborador_id: e.target.value, colaborador_nome: colab?.nome, enrollid: colab?.enrollid }); }} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white">
                <option value="">Selecione...</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Data da Falta</label><Input type="date" value={novaJust.data_falta || ''} onChange={e => setNovaJust({ ...novaJust, data_falta: e.target.value })} /></div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select value={novaJust.tipo || ''} onChange={e => setNovaJust({ ...novaJust, tipo: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white">
                <option value="">Selecione...</option>
                <option value="injustificada">Injustificada</option>
                <option value="justificada_documento">Justificada com Documento</option>
                <option value="justificada_verbal">Justificada Verbal</option>
                <option value="falta_autorizada">Falta Autorizada</option>
              </select>
            </div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Motivo</label><Input value={novaJust.motivo || ''} onChange={e => setNovaJust({ ...novaJust, motivo: e.target.value })} placeholder="Motivo" /></div>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" className="flex-1" onClick={() => setJustDialog(false)}>Cancelar</Button>
            <Button className="flex-1 bg-amber-600 hover:bg-amber-700" disabled={createJustMutation.isPending || !novaJust.colaborador_id} onClick={() => createJustMutation.mutate(novaJust)}>
              {createJustMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Registar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteJustId} onOpenChange={() => setDeleteJustId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar Justificação?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteJustMutation.mutate(deleteJustId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}