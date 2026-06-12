import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Trash2, CheckCircle, XCircle, Clock, Upload } from 'lucide-react';

export default function JustificacaoFaltas() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const [newJustificacao, setNewJustificacao] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { data: justificacoes = [] } = useQuery({
    queryKey: ['justificacoes'],
    queryFn: () => base44.entities.JustificacaoFalta.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_just'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.JustificacaoFalta.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['justificacoes'] });
      setNewJustificacao({});
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.JustificacaoFalta.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['justificacoes'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.JustificacaoFalta.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['justificacoes'] });
      setDeleteId(null);
    }
  });

  const filtered = justificacoes.filter(j => {
    if (filtroTipo !== 'todas' && j.tipo !== filtroTipo) return false;
    return j.colaborador_nome?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const tiposCor = {
    'injustificada': 'bg-red-100 text-red-700',
    'justificada_documento': 'bg-green-100 text-green-700',
    'justificada_verbal': 'bg-blue-100 text-blue-700',
    'falta_autorizada': 'bg-purple-100 text-purple-700'
  };

  const statusAprovacao = (j) => j.aprovado ? '✓ Aprovado' : 'Pendente';

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Justificação de Faltas</h1>
            <p className="text-slate-600 text-sm mt-1">Registar e aprovar faltas justificadas</p>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Justificação</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registar Justificação de Falta</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Colaborador</label>
                  <select
                    value={newJustificacao.colaborador_id || ''}
                    onChange={(e) => {
                      const colab = colaboradores.find(c => c.id === e.target.value);
                      setNewJustificacao({ ...newJustificacao, colaborador_id: e.target.value, colaborador_nome: colab?.nome, enrollid: colab?.enrollid });
                    }}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Data da Falta</label>
                  <input type="date" value={newJustificacao.data_falta || ''} onChange={(e) => setNewJustificacao({ ...newJustificacao, data_falta: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo</label>
                  <select value={newJustificacao.tipo || ''} onChange={(e) => setNewJustificacao({ ...newJustificacao, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                    <option value="">Selecione...</option>
                    <option value="injustificada">Injustificada</option>
                    <option value="justificada_documento">Justificada com Documento</option>
                    <option value="justificada_verbal">Justificada Verbal</option>
                    <option value="falta_autorizada">Falta Autorizada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Motivo</label>
                  <input type="text" value={newJustificacao.motivo || ''} onChange={(e) => setNewJustificacao({ ...newJustificacao, motivo: e.target.value })} placeholder="Motivo" className="w-full px-3 py-2 border rounded-md" />
                </div>
                <Button onClick={() => createMutation.mutate(newJustificacao)} className="w-full">Registar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <input
                placeholder="Buscar colaborador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-md"
              />
              <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="px-3 py-2 border rounded-md">
                <option value="todas">Todas</option>
                <option value="injustificada">Injustificadas</option>
                <option value="justificada_documento">Com Documento</option>
                <option value="falta_autorizada">Autorizadas</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {filtered.map((j) => (
            <Card key={j.id} className="hover:shadow-lg transition">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{j.colaborador_nome}</h3>
                    <p className="text-sm text-slate-600">Data: {new Date(j.data_falta).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={tiposCor[j.tipo]}>{j.tipo.replace(/_/g, ' ')}</Badge>
                    <Badge className={j.aprovado ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                      {statusAprovacao(j)}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-slate-700 mb-4">Motivo: {j.motivo}</p>
                {!j.aprovado && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: j.id, data: { aprovado: true, aprovado_em: new Date().toISOString() } })}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteId(j.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogTitle>Eliminar Justificação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteMutation.mutate(deleteId)}>Eliminar</AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}