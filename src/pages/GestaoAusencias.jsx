import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, eachDayOfInterval } from 'date-fns';
import { CalendarOff, Plus, Pencil, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TIPO_LABELS = { ferias: '🌴 Férias', baixa_medica: '🏥 Baixa Médica', feriado: '🎉 Feriado', justificada: '📋 Justificada', injustificada: '⚠️ Injustificada' };
const TIPO_COLORS = {
  ferias: 'bg-blue-100 text-blue-700 border-blue-200',
  baixa_medica: 'bg-rose-100 text-rose-700 border-rose-200',
  feriado: 'bg-amber-100 text-amber-700 border-amber-200',
  justificada: 'bg-slate-100 text-slate-600 border-slate-200',
  injustificada: 'bg-orange-100 text-orange-700 border-orange-200',
};

export default function GestaoAusencias() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ enrollid: '', utilizador_nome: '', tipo: 'ferias', data_inicio: '', data_fim: '', motivo: '', aprovado: false });
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';

  const { data: ausencias = [], isLoading } = useQuery({
    queryKey: ['ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 200),
    enabled: !!currentUser,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-ausencias', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('nome', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500);
    },
    enabled: !!currentUser,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = { ...data, enrollid: Number(data.enrollid), owner_email: currentUser?.email };
      if (editingId) return base44.entities.AusenciaFalta.update(editingId, payload);
      return base44.entities.AusenciaFalta.create(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); setDialogOpen(false); toast.success('Ausência guardada'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AusenciaFalta.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); toast.success('Ausência eliminada'); },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, aprovado }) => base44.entities.AusenciaFalta.update(id, { aprovado }),
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); toast.success('Estado atualizado'); },
  });

  const handleNew = () => {
    setEditingId(null);
    setForm({ enrollid: '', utilizador_nome: '', tipo: 'ferias', data_inicio: format(new Date(), 'yyyy-MM-dd'), data_fim: format(new Date(), 'yyyy-MM-dd'), motivo: '', aprovado: false });
    setDialogOpen(true);
  };

  const handleEdit = (a) => {
    setEditingId(a.id);
    setForm({ enrollid: a.enrollid, utilizador_nome: a.utilizador_nome || '', tipo: a.tipo, data_inicio: a.data_inicio, data_fim: a.data_fim, motivo: a.motivo || '', aprovado: a.aprovado || false });
    setDialogOpen(true);
  };

  const calcDias = (di, df) => {
    try {
      return eachDayOfInterval({ start: parseISO(di), end: parseISO(df) }).length;
    } catch { return 0; }
  };

  const hoje = format(new Date(), 'yyyy-MM-dd');
  const ativas = ausencias.filter(a => a.data_fim >= hoje);
  const passadas = ausencias.filter(a => a.data_fim < hoje);

  const renderRow = (a) => {
    const dias = calcDias(a.data_inicio, a.data_fim);
    return (
      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
        <td className="px-4 py-3">
          <p className="text-xs font-medium text-slate-800">{a.utilizador_nome || `ID:${a.enrollid}`}</p>
          <p className="text-[10px] text-slate-400 font-mono">#{a.enrollid}</p>
        </td>
        <td className="px-4 py-3">
          <Badge className={cn('text-[10px]', TIPO_COLORS[a.tipo] || TIPO_COLORS.justificada)}>{TIPO_LABELS[a.tipo] || a.tipo}</Badge>
        </td>
        <td className="px-4 py-3 text-xs text-slate-600">
          <p>{format(parseISO(a.data_inicio), 'dd/MM/yyyy')}</p>
          <p className="text-slate-400">→ {format(parseISO(a.data_fim), 'dd/MM/yyyy')}</p>
        </td>
        <td className="px-4 py-3 text-center">
          <span className="text-xs font-semibold text-slate-700">{dias}d</span>
        </td>
        <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell max-w-[150px] truncate">{a.motivo || '—'}</td>
        <td className="px-4 py-3">
          {isAdmin ? (
            <button onClick={() => approveMutation.mutate({ id: a.id, aprovado: !a.aprovado })}>
              {a.aprovado
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <XCircle className="h-4 w-4 text-slate-300 hover:text-emerald-400 transition-colors" />}
            </button>
          ) : (
            a.aprovado ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(a)}><Pencil className="h-3 w-3" /></Button>
            {isAdmin && <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(a.id)}><Trash2 className="h-3 w-3" /></Button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 rounded-xl shrink-0">
              <CalendarOff className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Ausências & Faltas</h1>
              <p className="text-xs text-slate-500">Férias, baixas médicas, feriados e ausências justificadas</p>
            </div>
          </div>
          <Button onClick={handleNew} className="bg-orange-600 hover:bg-orange-700 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Registar Ausência
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(TIPO_LABELS).map(([tipo, label]) => {
            const count = ausencias.filter(a => a.tipo === tipo && a.data_fim >= hoje).length;
            return (
              <div key={tipo} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-slate-800">{count}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabela */}
        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-slate-200 border-t-orange-500 rounded-full animate-spin" /></div>
        ) : (
          <>
            {ativas.length > 0 && (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
                  <p className="text-xs font-semibold text-amber-700">🗓 Ausências Ativas ou Futuras ({ativas.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Colaborador</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Período</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">Dias</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">Motivo</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">✓</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Ações</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{ativas.map(renderRow)}</tbody>
                  </table>
                </div>
              </Card>
            )}
            {passadas.length > 0 && (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500">Histórico ({passadas.length})</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Colaborador</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Período</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">Dias</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600 hidden md:table-cell">Motivo</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">✓</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Ações</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 opacity-60">{passadas.map(renderRow)}</tbody>
                  </table>
                </div>
              </Card>
            )}
            {ausencias.length === 0 && (
              <Card className="bg-white border-slate-200">
                <CardContent className="py-16 text-center text-slate-400">
                  <CalendarOff className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhuma ausência registada</p>
                  <Button onClick={handleNew} className="mt-4 bg-orange-600 hover:bg-orange-700 gap-1.5"><Plus className="h-4 w-4" /> Registar</Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Ausência' : 'Registar Ausência'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Colaborador</label>
              <Select value={String(form.enrollid)} onValueChange={v => {
                const c = colaboradores.find(x => String(x.enrollid) === v);
                setForm(f => ({ ...f, enrollid: v, utilizador_nome: c?.nome || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                <SelectContent>
                  {colaboradores.map(c => <SelectItem key={c.enrollid} value={String(c.enrollid)}>{c.nome} (#{c.enrollid})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Tipo de ausência</label>
              <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <label className="text-xs font-medium text-slate-600 block mb-1">Motivo (opcional)</label>
              <Input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Descrever o motivo..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={!form.enrollid || !form.data_inicio || !form.data_fim || saveMutation.isPending} onClick={() => saveMutation.mutate(form)}>
                {saveMutation.isPending ? 'A guardar...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar ausência?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteMutation.mutate(deleteId); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}