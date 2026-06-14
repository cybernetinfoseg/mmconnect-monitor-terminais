import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Plus, Search, Edit, Trash2, Users, MapPin, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_LABELS = { ativo: 'Ativo', inativo: 'Inativo', trial: 'Trial', suspenso: 'Suspenso' };
const STATUS_COLORS = {
  ativo: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  inativo: 'bg-slate-100 text-slate-500 border-slate-200',
  trial: 'bg-blue-100 text-blue-700 border-blue-200',
  suspenso: 'bg-red-100 text-red-700 border-red-200',
};
const PLANO_LABELS = { free: 'Free', basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };

export default function Tenants() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: '', documento: '', email: '', telefone: '', status: 'trial', plano: 'free' });
  const queryClient = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list('nome'),
  });
  const { data: sites = [] } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => base44.entities.Site.list('nome'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Tenant.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setShowModal(false); resetForm(); toast.success('Tenant criado'); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Tenant.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); setShowModal(false); resetForm(); toast.success('Tenant atualizado'); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Tenant.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tenants'] }); toast.success('Tenant removido'); },
  });

  const resetForm = () => { setEditing(null); setForm({ nome: '', documento: '', email: '', telefone: '', status: 'trial', plano: 'free' }); };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ nome: t.nome, documento: t.documento || '', email: t.email || '', telefone: t.telefone || '', status: t.status || 'trial', plano: t.plano || 'free' }); setShowModal(true); };

  const handleSubmit = () => {
    if (!form.nome.trim()) return toast.error('Nome é obrigatório');
    editing ? updateMutation.mutate({ id: editing.id, data: form }) : createMutation.mutate(form);
  };

  const filtered = tenants.filter(t => t.nome?.toLowerCase().includes(search.toLowerCase()) || t.email?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg"><Building2 className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Tenants</h1>
              <p className="text-sm text-slate-500">Gestão de clientes e organizações</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700 gap-2"><Plus className="h-4 w-4" /> Novo Tenant</Button>
        </div>

        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar tenants..." className="border-0 shadow-none focus-visible:ring-0 flex-1" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-slate-200 border-t-violet-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => {
              const tenantSites = sites.filter(s => s.tenant_id === t.id);
              const totalSites = tenantSites.length;
              const activeSites = tenantSites.filter(s => s.ativo !== false).length;
              return (
                <Card key={t.id} className="bg-white border-slate-200 hover:border-violet-300 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center"><Building2 className="h-4 w-4 text-violet-600" /></div>
                        <div>
                          <CardTitle className="text-base">{t.nome}</CardTitle>
                          {t.documento && <p className="text-xs text-slate-400">{t.documento}</p>}
                        </div>
                      </div>
                      <Badge className={cn('text-[10px]', STATUS_COLORS[t.status] || STATUS_COLORS.trial)}>{STATUS_LABELS[t.status] || t.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {activeSites}/{totalSites} sites</span>
                      <Badge variant="outline" className="text-[10px]">{PLANO_LABELS[t.plano] || t.plano}</Badge>
                    </div>
                    {t.email && <p className="text-xs text-slate-400 truncate">{t.email}</p>}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(t)}><Edit className="h-3 w-3 mr-1" /> Editar</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => { if (confirm('Remover este tenant?')) deleteMutation.mutate(t.id); }}><Trash2 className="h-3 w-3 mr-1" /> Remover</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && <p className="text-slate-400 text-center py-12 col-span-full">Nenhum tenant encontrado.</p>}
          </div>
        )}

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Editar Tenant' : 'Novo Tenant'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Nome *</label>
                <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Nome da empresa" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Documento (NIF/CNPJ)</label>
                <Input value={form.documento} onChange={e => setForm({...form, documento: e.target.value})} placeholder="NIF" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Email</label>
                  <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="email@empresa.pt" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Telefone</label>
                  <Input value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} placeholder="+351..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Status</label>
                  <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Plano</label>
                  <Select value={form.plano} onValueChange={v => setForm({...form, plano: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLANO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} className="bg-violet-600 hover:bg-violet-700" disabled={createMutation.isLoading || updateMutation.isLoading}>
                {editing ? 'Guardar' : 'Criar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}