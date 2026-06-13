import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Search, Pencil, Trash2, Loader2,
  UserCheck, UserX, ChevronRight, Building2, Phone, Mail, Calendar, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ColaboradorRHForm from '@/components/rh/ColaboradorRHForm';
import { format, differenceInYears, parseISO } from 'date-fns';

export default function FichaColaborador() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [depFilter, setDepFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: colaboradores = [], isLoading } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => base44.entities.Colaborador.list('-data_admissao', 500),
    enabled: !!currentUser,
  });

  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios-rh'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, owner_email: data.owner_email || currentUser?.email };
      if (editingId) return base44.entities.Colaborador.update(editingId, payload);
      return base44.entities.Colaborador.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['colaboradores']);
      setDialogOpen(false);
      setEditingId(null);
      setFormData({});
      toast.success(editingId ? 'Ficha atualizada' : 'Colaborador criado');
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Colaborador.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['colaboradores']);
      toast.success('Colaborador eliminado');
    },
  });

  const departamentos = [...new Set(colaboradores.map(c => c.departamento).filter(Boolean))].sort();

  const filtered = colaboradores.filter(c => {
    const matchSearch = !search ||
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.numero_colaborador?.toLowerCase().includes(search.toLowerCase()) ||
      c.cargo?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      String(c.enrollid || '').includes(search);
    const matchDep = depFilter === 'all' || c.departamento === depFilter;
    return matchSearch && matchDep;
  });

  const handleNew = () => {
    setEditingId(null);
    setFormData({ ativo: true, num_dependentes: 0, pais: 'Portugal', nacionalidade: 'Portuguesa', genero: 'nao_especificado' });
    setDialogOpen(true);
  };

  const handleEdit = (c) => {
    setEditingId(c.id);
    setFormData({ ...c });
    setDialogOpen(true);
  };

  const horarioMap = Object.fromEntries(horarios.map(h => [h.id, h]));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Fichas de Colaborador</h1>
              <p className="text-xs text-slate-500">{filtered.length} de {colaboradores.length} colaborador(es)</p>
            </div>
          </div>
          <Button size="sm" onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo Colaborador
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Pesquisar por nome, nº, cargo, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-white"
            />
          </div>
          <Select value={depFilter} onValueChange={setDepFilter}>
            <SelectTrigger className="bg-white w-full sm:w-[200px]">
              <SelectValue placeholder="Todos os departamentos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os departamentos</SelectItem>
              {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white border-slate-200">
            <CardContent className="py-16 text-center text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum colaborador encontrado</p>
              <Button onClick={handleNew} className="mt-4 bg-blue-600 hover:bg-blue-700 text-sm">
                <Plus className="h-4 w-4 mr-2" /> Criar ficha
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="bg-white border-slate-200 hidden lg:block overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Departamento / Cargo</th>
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Contacto</th>
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Admissão</th>
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Horário</th>
                    <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                    <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(c => {
                    const hor = horarioMap[c.horario_id];
                    const idade = c.data_nascimento ? differenceInYears(new Date(), parseISO(c.data_nascimento)) : null;
                    return (
                      <tr key={c.id} className={cn('hover:bg-slate-50 transition-colors', !c.ativo && 'opacity-60')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {c.foto_url
                              ? <img src={c.foto_url} alt="" className="w-8 h-8 rounded-full object-cover border border-blue-200" />
                              : <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">{c.nome?.charAt(0)}</div>
                            }
                            <div>
                              <p className="font-semibold text-slate-800">{c.nome}</p>
                              <p className="text-xs text-slate-400">{c.numero_colaborador || `#${c.enrollid || '—'}`}{idade ? ` · ${idade} anos` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-slate-700 text-xs font-medium">{c.departamento || '—'}</p>
                          <p className="text-slate-400 text-xs">{c.cargo || '—'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.email && <p className="text-xs text-slate-500 truncate max-w-[160px]">{c.email}</p>}
                          {c.telemovel && <p className="text-xs text-slate-400">{c.telemovel}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {c.data_admissao ? format(parseISO(c.data_admissao), 'dd/MM/yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {hor ? <Badge variant="outline" className="text-xs">{hor.nome}</Badge> : '—'}
                        </td>
                        <td className="px-4 py-3">
                          {c.ativo !== false
                            ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Ativo</Badge>
                            : <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Inativo</Badge>
                          }
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-blue-600 hover:bg-blue-50 gap-1" onClick={() => navigate(`/ColaboradorPerfil?id=${c.id}`)}>
                              <ExternalLink className="h-3 w-3" /><span className="text-xs">Perfil</span>
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(c)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              {filtered.map(c => (
                <Card key={c.id} className={cn('bg-white border-slate-200', !c.ativo && 'opacity-60')}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {c.foto_url
                        ? <img src={c.foto_url} alt="" className="w-10 h-10 rounded-full object-cover border border-blue-200 shrink-0" />
                        : <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">{c.nome?.charAt(0)}</div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{c.nome}</p>
                            <p className="text-xs text-slate-500">{[c.departamento, c.cargo].filter(Boolean).join(' · ') || '—'}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEdit(c)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.ativo !== false
                            ? <Badge className="text-xs bg-emerald-100 text-emerald-700">Ativo</Badge>
                            : <Badge className="text-xs bg-slate-100 text-slate-500">Inativo</Badge>
                          }
                          {c.email && <Badge variant="outline" className="text-xs">{c.email}</Badge>}
                          <Button size="sm" variant="outline" className="h-6 px-2 text-blue-600 hover:bg-blue-50 gap-1 text-xs" onClick={() => navigate(`/ColaboradorPerfil?id=${c.id}`)}>
                            <ExternalLink className="h-3 w-3" />Perfil 360°
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Ficha' : 'Nova Ficha de Colaborador'}</DialogTitle>
          </DialogHeader>
          <ColaboradorRHForm data={formData} onChange={setFormData} horarios={horarios} />
          <div className="flex gap-2 pt-3 border-t border-slate-100 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={saveMutation.isPending || !formData.nome}
              onClick={() => saveMutation.mutate(formData)}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingId ? 'Guardar Alterações' : 'Criar Colaborador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar ficha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação é permanente. O registo biométrico no terminal não será afetado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteMutation.mutate(deleteId); setDeleteId(null); }}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}