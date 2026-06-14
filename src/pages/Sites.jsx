import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Plus, Search, Edit, Trash2, Building2, Monitor, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Sites() {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ nome: '', codigo: '', tenant_id: '', morada: '', localidade: '', pais: 'Portugal', ativo: true });
  const queryClient = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => base44.entities.Site.list('nome'),
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => base44.entities.Tenant.list('nome'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Site.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sites-all'] }); setShowModal(false); resetForm(); toast.success('Site criado'); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Site.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sites-all'] }); setShowModal(false); resetForm(); toast.success('Site atualizado'); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Site.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sites-all'] }); toast.success('Site removido'); },
  });

  const resetForm = () => { setEditing(null); setForm({ nome: '', codigo: '', tenant_id: '', morada: '', localidade: '', pais: 'Portugal', ativo: true }); };

  const openCreate = () => { resetForm(); setShowModal(true); };
  const openEdit = (s) => { setEditing(s); setForm({ nome: s.nome, codigo: s.codigo || '', tenant_id: s.tenant_id || '', morada: s.morada || '', localidade: s.localidade || '', pais: s.pais || 'Portugal', ativo: s.ativo !== false }); setShowModal(true); };

  const handleSubmit = () => {
    if (!form.nome.trim()) return toast.error('Nome é obrigatório');
    editing ? updateMutation.mutate({ id: editing.id, data: form }) : createMutation.mutate(form);
  };

  const filtered = sites.filter(s => s.nome?.toLowerCase().includes(search.toLowerCase()) || s.localidade?.toLowerCase().includes(search.toLowerCase()) || s.codigo?.toLowerCase().includes(search.toLowerCase()));

  const getTenantName = (id) => tenants.find(t => t.id === id)?.nome || '—';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg"><MapPin className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Sites</h1>
              <p className="text-sm text-slate-500">Locais e instalações</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 gap-2"><Plus className="h-4 w-4" /> Novo Site</Button>
        </div>

        <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-2 shadow-sm">
          <Search className="h-4 w-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar sites..." className="border-0 shadow-none focus-visible:ring-0 flex-1" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => (
              <Card key={s.id} className="bg-white border-slate-200 hover:border-blue-300 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><MapPin className="h-4 w-4 text-blue-600" /></div>
                      <div>
                        <CardTitle className="text-base">{s.nome}</CardTitle>
                        {s.codigo && <p className="text-xs text-slate-400">Cód. {s.codigo}</p>}
                      </div>
                    </div>
                    <Badge className={cn('text-[10px]', s.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{s.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Building2 className="h-3 w-3" />
                    <span>{getTenantName(s.tenant_id)}</span>
                  </div>
                  <p className="text-xs text-slate-400">{[s.morada, s.localidade, s.pais].filter(Boolean).join(', ') || '—'}</p>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(s)}><Edit className="h-3 w-3 mr-1" /> Editar</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700" onClick={() => { if (confirm('Remover este site?')) deleteMutation.mutate(s.id); }}><Trash2 className="h-3 w-3 mr-1" /> Remover</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filtered.length === 0 && <p className="text-slate-400 text-center py-12 col-span-full">Nenhum site encontrado.</p>}
          </div>
        )}

        <Dialog open={showModal} onOpenChange={setShowModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{editing ? 'Editar Site' : 'Novo Site'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Nome *</label>
                <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Nome do local" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Código</label>
                  <Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} placeholder="Ex: MAT, POR" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Tenant</label>
                  <Select value={form.tenant_id} onValueChange={v => setForm({...form, tenant_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecionar tenant" /></SelectTrigger>
                    <SelectContent>{tenants.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Morada</label>
                <Input value={form.morada} onChange={e => setForm({...form, morada: e.target.value})} placeholder="Morada" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Localidade</label>
                  <Input value={form.localidade} onChange={e => setForm({...form, localidade: e.target.value})} placeholder="Localidade" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">País</label>
                  <Input value={form.pais} onChange={e => setForm({...form, pais: e.target.value})} placeholder="País" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-700">{editing ? 'Guardar' : 'Criar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}