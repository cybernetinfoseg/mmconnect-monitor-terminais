import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, Pencil, Trash2, Clock, Users, LayoutGrid, TableProperties } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import EscalaTrabalho from '@/components/horarios/EscalaTrabalho';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

const TABS = [
  { key: 'turnos', label: 'Turnos', icon: LayoutGrid },
  { key: 'escala', label: 'Escala', icon: TableProperties },
];

export default function GestaoHorarios() {
  const [activeTab, setActiveTab] = useState('turnos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [form, setForm] = useState({
    nome: '', hora_entrada: '08:00', hora_saida: '17:00',
    tolerancia_minutos: 10, dias_semana: '[1,2,3,4,5]', ativo: true, cor: '#10b981'
  });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';
  const queryClient = useQueryClient();

  const { data: horarios = [], isLoading } = useQuery({
    queryKey: ['horarios'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-horarios', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('nome', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500);
    },
    enabled: !!currentUser,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, owner_email: currentUser?.email };
      if (editingId) return base44.entities.Horario.update(editingId, payload);
      return base44.entities.Horario.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['horarios']);
      setDialogOpen(false);
      toast.success(editingId ? 'Horário atualizado' : 'Horário criado');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Horario.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['horarios']); toast.success('Horário eliminado'); },
  });

  const handleAssign = async (colaboradorId, horarioId) => {
    setAssigningId(colaboradorId);
    try {
      await base44.entities.TerminalUser.update(colaboradorId, { horario_id: horarioId });
      queryClient.invalidateQueries(['colaboradores-horarios']);
      toast.success(horarioId ? 'Horário atribuído com sucesso' : 'Horário removido');
    } catch {
      toast.error('Erro ao atribuir horário');
    } finally {
      setAssigningId(null);
    }
  };

  const handleNew = () => {
    setEditingId(null);
    setForm({ nome: '', hora_entrada: '08:00', hora_saida: '17:00', tolerancia_minutos: 10, dias_semana: '[1,2,3,4,5]', ativo: true, cor: '#10b981' });
    setDialogOpen(true);
  };

  const handleEdit = (h) => {
    setEditingId(h.id);
    setForm({ nome: h.nome, hora_entrada: h.hora_entrada, hora_saida: h.hora_saida, tolerancia_minutos: h.tolerancia_minutos ?? 10, dias_semana: h.dias_semana || '[1,2,3,4,5]', ativo: h.ativo !== false, cor: h.cor || '#10b981' });
    setDialogOpen(true);
  };

  const toggleDia = (dia) => {
    const dias = (() => { try { return JSON.parse(form.dias_semana || '[]'); } catch { return []; } })();
    const novo = dias.includes(dia) ? dias.filter(d => d !== dia) : [...dias, dia].sort();
    setForm(f => ({ ...f, dias_semana: JSON.stringify(novo) }));
  };

  const getDias = () => { try { return JSON.parse(form.dias_semana || '[]'); } catch { return []; } };

  const colaboradoresPorHorario = useMemo(() => {
    const map = {};
    horarios.forEach(h => { map[h.id] = []; });
    colaboradores.forEach(c => {
      if (c.horario_id && map[c.horario_id]) map[c.horario_id].push(c);
    });
    return map;
  }, [horarios, colaboradores]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-violet-100 rounded-xl shrink-0">
              <CalendarClock className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Horários & Turnos</h1>
              <p className="text-xs text-slate-500">Gestão de horários, escalas e atribuições</p>
            </div>
          </div>
          <Button onClick={handleNew} className="bg-violet-600 hover:bg-violet-700 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Novo Horário
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  activeTab === tab.key
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* === TURNOS TAB === */}
            {activeTab === 'turnos' && (
              <>
                {horarios.length === 0 ? (
                  <Card className="bg-white border-slate-200">
                    <CardContent className="py-16 text-center text-slate-400">
                      <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">Nenhum horário criado</p>
                      <p className="text-sm mt-1">Crie um horário para atribuir aos colaboradores</p>
                      <Button onClick={handleNew} className="mt-4 bg-violet-600 hover:bg-violet-700 gap-1.5">
                        <Plus className="h-4 w-4" /> Criar Horário
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {horarios.map(h => {
                      const dias = (() => { try { return JSON.parse(h.dias_semana || '[]'); } catch { return []; } })();
                      const colabs = colaboradoresPorHorario[h.id] || [];
                      return (
                        <Card key={h.id} className="bg-white border-slate-200">
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: h.cor || '#10b981' }} />
                                <h3 className="font-semibold text-slate-800">{h.nome}</h3>
                                {!h.ativo && <Badge variant="outline" className="text-xs text-slate-400">Inativo</Badge>}
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(h)}><Pencil className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(h.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                                <Clock className="h-3.5 w-3.5 text-emerald-600" />
                                <span className="font-mono font-semibold text-emerald-700">{h.hora_entrada}</span>
                              </div>
                              <span className="text-slate-400 text-xs">→</span>
                              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1">
                                <Clock className="h-3.5 w-3.5 text-rose-500" />
                                <span className="font-mono font-semibold text-rose-600">{h.hora_saida}</span>
                              </div>
                              <span className="text-xs text-slate-400">±{h.tolerancia_minutos ?? 10}min</span>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {[0,1,2,3,4,5,6].map(d => (
                                <span key={d} className={cn(
                                  'text-[10px] font-medium px-1.5 py-0.5 rounded border',
                                  dias.includes(d)
                                    ? 'bg-violet-100 border-violet-300 text-violet-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-400'
                                )}>{DIAS[d]}</span>
                              ))}
                            </div>
                            <div className="pt-2 border-t border-slate-100">
                              <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                                <Users className="h-3 w-3" /> {colabs.length} colaborador(es)
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {colabs.slice(0, 4).map(c => (
                                  <span key={c.id} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full truncate max-w-[100px]">{c.nome}</span>
                                ))}
                                {colabs.length > 4 && <span className="text-[10px] text-slate-400">+{colabs.length - 4}</span>}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* === ESCALA TAB === */}
            {activeTab === 'escala' && (
              <Card className="bg-white border-slate-200">
                <CardContent className="p-4">
                  {colaboradores.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">Sem colaboradores</p>
                      <p className="text-sm mt-1">Adicione colaboradores na página Colaboradores</p>
                    </div>
                  ) : horarios.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">Sem turnos criados</p>
                      <Button onClick={handleNew} className="mt-3 bg-violet-600 hover:bg-violet-700 gap-1.5 text-xs">
                        <Plus className="h-3.5 w-3.5" /> Criar Turno
                      </Button>
                    </div>
                  ) : (
                    <EscalaTrabalho
                      colaboradores={colaboradores}
                      horarios={horarios}
                      onAssign={handleAssign}
                      assigningId={assigningId}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Dialog criar/editar horário */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Horário' : 'Novo Horário'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Nome do horário</label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Turno Manhã, Administrativo..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Hora de entrada</label>
                <Input type="time" value={form.hora_entrada} onChange={e => setForm(f => ({ ...f, hora_entrada: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Hora de saída</label>
                <Input type="time" value={form.hora_saida} onChange={e => setForm(f => ({ ...f, hora_saida: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tolerância (minutos)</label>
              <Input type="number" min={0} max={60} value={form.tolerancia_minutos} onChange={e => setForm(f => ({ ...f, tolerancia_minutos: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Dias da semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {[0,1,2,3,4,5,6].map(d => {
                  const dias = getDias();
                  const ativo = dias.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDia(d)}
                      className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                        ativo ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300')}>
                      {DIAS[d]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {CORES.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, cor: c }))}
                    className={cn('w-7 h-7 rounded-full border-2 transition-all', form.cor === c ? 'border-slate-800 scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={!form.nome || saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
                {saveMutation.isPending ? 'A guardar...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar horário?</AlertDialogTitle>
            <AlertDialogDescription>Os colaboradores associados perderão este horário.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteMutation.mutate(deleteId); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}