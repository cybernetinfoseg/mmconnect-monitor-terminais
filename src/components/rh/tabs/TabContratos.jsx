import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Search, Pencil, Trash2, Loader2, AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';

const TIPO_LABELS = { sem_termo: 'Sem Termo', termo_certo: 'A Termo Certo', termo_incerto: 'A Termo Incerto', prestacao_servicos: 'Prestação de Serviços', trabalho_temporario: 'Trabalho Temporário', estagio: 'Estágio' };
const ESTADO_CONFIG = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  expirado: { label: 'Expirado', cls: 'bg-red-100 text-red-700 border-red-200' },
  rescindido: { label: 'Rescindido', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  pendente_assinatura: { label: 'Pendente Assinatura', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
};

function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

export default function TabContratos({ currentUser, colaboradores }) {
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos'],
    queryFn: () => base44.entities.Contrato.list('-data_inicio', 500),
    enabled: !!currentUser,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => { const payload = { ...data, owner_email: data.owner_email || currentUser?.email }; if (editingId) return base44.entities.Contrato.update(editingId, payload); return base44.entities.Contrato.create(payload); },
    onSuccess: () => { queryClient.invalidateQueries(['contratos']); setDialogOpen(false); setEditingId(null); setFormData({}); toast.success(editingId ? 'Contrato atualizado' : 'Contrato criado'); },
    onError: e => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: id => base44.entities.Contrato.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['contratos']); toast.success('Contrato eliminado'); },
  });

  const hoje = new Date();
  const em30 = addDays(hoje, 30);

  const filtered = useMemo(() => contratos.filter(c => {
    const matchSearch = !search || c.colaborador_nome?.toLowerCase().includes(search.toLowerCase());
    const matchEstado = estadoFilter === 'all' || c.estado === estadoFilter;
    return matchSearch && matchEstado;
  }), [contratos, search, estadoFilter]);

  const stats = useMemo(() => ({
    ativos: contratos.filter(c => c.estado === 'ativo').length,
    aExpirar: contratos.filter(c => c.estado === 'ativo' && c.data_fim && parseISO(c.data_fim) >= hoje && parseISO(c.data_fim) <= em30).length,
    expirados: contratos.filter(c => c.estado === 'expirado').length,
    pendentes: contratos.filter(c => c.estado === 'pendente_assinatura').length,
  }), [contratos]);

  const handleNew = () => { setEditingId(null); setFormData({ tipo: 'sem_termo', estado: 'ativo', horas_semanais: 40, subsidio_alimentacao: 0, subsidio_alimentacao_tipo: 'cartao_refeicao', aviso_expiracao_dias: 30, renovacao_automatica: false }); setDialogOpen(true); };
  const set = (f, v) => setFormData(prev => ({ ...prev, [f]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[{ label: 'Ativos', value: stats.ativos, color: 'text-emerald-600' }, { label: 'A Expirar (30d)', value: stats.aExpirar, color: 'text-amber-600' }, { label: 'Expirados', value: stats.expirados, color: 'text-red-600' }, { label: 'Pend. Assinatura', value: stats.pendentes, color: 'text-blue-600' }].map((s, i) => (
            <Card key={i} className="bg-white border-slate-200"><CardContent className="p-4"><p className={cn('text-2xl font-bold', s.color)}>{s.value}</p><p className="text-xs text-slate-500 mt-0.5">{s.label}</p></CardContent></Card>
          ))}
        </div>
        <Button size="sm" onClick={handleNew} className="bg-purple-600 hover:bg-purple-700 gap-1.5 self-start"><Plus className="h-3.5 w-3.5" /> Novo Contrato</Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>
        <Select value={estadoFilter} onValueChange={setEstadoFilter}>
          <SelectTrigger className="bg-white w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(ESTADO_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
      ) : filtered.length === 0 ? (
        <Card className="bg-white"><CardContent className="py-16 text-center text-slate-400"><FileText className="h-12 w-12 mx-auto mb-3 opacity-40" /><p>Nenhum contrato encontrado</p><Button onClick={handleNew} className="mt-4 bg-purple-600 hover:bg-purple-700 text-sm"><Plus className="h-4 w-4 mr-2" />Criar contrato</Button></CardContent></Card>
      ) : (
        <Card className="bg-white border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Tipo</th>
                <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Período</th>
                <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Salário Base</th>
                <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => {
                const dias = c.data_fim ? differenceInDays(parseISO(c.data_fim), hoje) : null;
                const cfg = ESTADO_CONFIG[c.estado] || ESTADO_CONFIG.ativo;
                const alertaExpiracao = c.estado === 'ativo' && dias !== null && dias <= (c.aviso_expiracao_dias || 30) && dias >= 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.colaborador_nome || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{TIPO_LABELS[c.tipo] || c.tipo}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-slate-600">{c.data_inicio ? format(parseISO(c.data_inicio), 'dd/MM/yyyy') : '—'}{c.data_fim ? ` → ${format(parseISO(c.data_fim), 'dd/MM/yyyy')}` : ' → Indeterminado'}</p>
                      {alertaExpiracao && <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200 mt-0.5"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{dias === 0 ? 'Expira hoje' : `${dias}d restantes`}</Badge>}
                    </td>
                    <td className="px-4 py-3 text-slate-700 text-sm font-medium">{c.salario_base ? `€${c.salario_base.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td className="px-4 py-3"><Badge className={cn('text-xs', cfg.cls)}>{cfg.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setEditingId(c.id); setFormData({ ...c }); setDialogOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                        <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Colaborador" required>
              <Select value={formData.colaborador_id || ''} onValueChange={v => { const col = colaboradores.find(c => c.id === v); set('colaborador_id', v); set('colaborador_nome', col?.nome || ''); set('enrollid', col?.enrollid); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                <SelectContent>{colaboradores.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo de Contrato" required>
                <Select value={formData.tipo || 'sem_termo'} onValueChange={v => set('tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={formData.estado || 'ativo'} onValueChange={v => set('estado', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ESTADO_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Data Início" required><Input type="date" value={formData.data_inicio || ''} onChange={e => set('data_inicio', e.target.value)} /></Field>
              <Field label="Data Fim"><Input type="date" value={formData.data_fim || ''} onChange={e => set('data_fim', e.target.value)} /></Field>
              <Field label="Horas Semanais"><Input type="number" value={formData.horas_semanais ?? 40} onChange={e => set('horas_semanais', Number(e.target.value))} /></Field>
              <Field label="Salário Base (€)"><Input type="number" step="0.01" value={formData.salario_base || ''} onChange={e => set('salario_base', parseFloat(e.target.value))} placeholder="0.00" /></Field>
              <Field label="Subsídio Alimentação/dia (€)"><Input type="number" step="0.01" value={formData.subsidio_alimentacao ?? 0} onChange={e => set('subsidio_alimentacao', parseFloat(e.target.value))} /></Field>
              <Field label="Tipo Sub. Alimentação">
                <Select value={formData.subsidio_alimentacao_tipo || 'cartao_refeicao'} onValueChange={v => set('subsidio_alimentacao_tipo', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cartao_refeicao">Cartão Refeição</SelectItem><SelectItem value="dinheiro">Dinheiro</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Regime">
                <Select value={formData.regime || 'presencial'} onValueChange={v => set('regime', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="presencial">Presencial</SelectItem><SelectItem value="remoto">Remoto</SelectItem><SelectItem value="hibrido">Híbrido</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Aviso Expiração (dias)"><Input type="number" value={formData.aviso_expiracao_dias ?? 30} onChange={e => set('aviso_expiracao_dias', Number(e.target.value))} /></Field>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Switch checked={formData.renovacao_automatica || false} onCheckedChange={v => set('renovacao_automatica', v)} />
              <span className="text-sm text-slate-700">Renovação automática</span>
            </div>
            <Field label="Observações"><Textarea value={formData.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={3} /></Field>
          </div>
          <div className="flex gap-2 pt-3 border-t border-slate-100 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-purple-600 hover:bg-purple-700" disabled={saveMutation.isPending || !formData.colaborador_id || !formData.tipo || !formData.data_inicio} onClick={() => saveMutation.mutate(formData)}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editingId ? 'Guardar' : 'Criar Contrato'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar contrato?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteMutation.mutate(deleteId); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}