import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Pencil, Trash2, Lock, Unlock, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO, startOfWeek, endOfWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import EscalaTable from './EscalaTable';

export default function EscalaManager({ colaboradores, horarios, currentUser }) {
  const queryClient = useQueryClient();
  const [selectedEscala, setSelectedEscala] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ nome: '', data_inicio: '', data_fim: '', observacoes: '' });

  const { data: escalas = [], isLoading } = useQuery({
    queryKey: ['escalas'],
    queryFn: () => base44.entities.EscalaTrabalho.list('-created_date', 50),
    enabled: !!currentUser,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, owner_email: currentUser?.email };
      return base44.entities.EscalaTrabalho.create(payload);
    },
    onSuccess: (newEscala) => {
      queryClient.invalidateQueries(['escalas']);
      setDialogOpen(false);
      setSelectedEscala(newEscala);
      toast.success('Escala criada');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.EscalaTrabalho.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['escalas']);
      if (selectedEscala?.id === deleteId) setSelectedEscala(null);
      toast.success('Escala eliminada');
    },
  });

  const togglePublicadaMutation = useMutation({
    mutationFn: ({ id, publicada }) => base44.entities.EscalaTrabalho.update(id, { publicada }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries(['escalas']);
      if (selectedEscala?.id === updated.id) setSelectedEscala(updated);
      toast.success(updated.publicada ? 'Escala publicada' : 'Escala reaberta para edição');
    },
  });

  const handleNew = () => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const sunday = endOfWeek(new Date(), { weekStartsOn: 1 });
    setForm({
      nome: `Semana ${format(monday, "d 'de' MMM", { locale: ptBR })} – ${format(sunday, "d 'de' MMM yyyy", { locale: ptBR })}`,
      data_inicio: format(monday, 'yyyy-MM-dd'),
      data_fim: format(sunday, 'yyyy-MM-dd'),
      observacoes: '',
    });
    setDialogOpen(true);
  };

  if (selectedEscala) {
    return (
      <div className="space-y-4">
        {/* Back + header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedEscala(null)}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              ← Escalas
            </button>
            <span className="text-slate-300">/</span>
            <h2 className="text-sm font-semibold text-slate-800">{selectedEscala.nome}</h2>
            {selectedEscala.publicada
              ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Publicada</Badge>
              : <Badge variant="outline" className="text-[10px]">Rascunho</Badge>
            }
          </div>
          <Button
            size="sm"
            variant="outline"
            className={cn('text-xs gap-1.5', selectedEscala.publicada ? 'text-amber-600 border-amber-300' : 'text-emerald-600 border-emerald-300')}
            onClick={() => togglePublicadaMutation.mutate({ id: selectedEscala.id, publicada: !selectedEscala.publicada })}
            disabled={togglePublicadaMutation.isPending}
          >
            {togglePublicadaMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : selectedEscala.publicada ? <><Unlock className="h-3.5 w-3.5" /> Reabrir</> : <><Lock className="h-3.5 w-3.5" /> Publicar</>}
          </Button>
        </div>

        {colaboradores.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Adicione colaboradores primeiro</div>
        ) : (
          <EscalaTable
            escala={selectedEscala}
            colaboradores={colaboradores}
            horarios={horarios}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{escalas.length} escala(s) criada(s)</p>
        <Button onClick={handleNew} className="bg-violet-600 hover:bg-violet-700 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Nova Escala
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-violet-400" /></div>
      ) : escalas.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma escala criada</p>
          <p className="text-sm mt-1">Crie a primeira escala para planear os turnos dos colaboradores</p>
          <Button onClick={handleNew} className="mt-4 bg-violet-600 hover:bg-violet-700 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Criar Escala
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {escalas.map(e => {
            const inicio = e.data_inicio ? format(parseISO(e.data_inicio), "d MMM", { locale: ptBR }) : '';
            const fim = e.data_fim ? format(parseISO(e.data_fim), "d MMM yyyy", { locale: ptBR }) : '';
            return (
              <div
                key={e.id}
                onClick={() => setSelectedEscala(e)}
                className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{e.nome}</p>
                    <p className="text-xs text-slate-400">{inicio} – {fim}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {e.publicada
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Publicada</Badge>
                    : <Badge variant="outline" className="text-[10px]">Rascunho</Badge>
                  }
                  <button
                    onClick={ev => { ev.stopPropagation(); setDeleteId(e.id); }}
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Nova Escala</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Nome da escala</label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Semana 24 – Junho 2026" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Data início</label>
                <Input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Data fim</label>
                <Input type="date" value={form.data_fim} onChange={e => setForm(f => ({ ...f, data_fim: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Observações (opcional)</label>
              <Input value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Notas sobre esta escala..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                disabled={!form.nome || !form.data_inicio || !form.data_fim || saveMutation.isPending}
                onClick={() => saveMutation.mutate(form)}
              >
                {saveMutation.isPending ? 'A criar...' : 'Criar Escala'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar escala?</AlertDialogTitle>
            <AlertDialogDescription>Todos os registos de escala associados serão eliminados.</AlertDialogDescription>
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