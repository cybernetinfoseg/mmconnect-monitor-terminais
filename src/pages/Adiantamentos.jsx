import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, CheckCircle, XCircle } from 'lucide-react';

export default function Adiantamentos() {
  const [newAdiantamento, setNewAdiantamento] = useState({});
  const queryClient = useQueryClient();

  const { data: adiantamentos = [] } = useQuery({
    queryKey: ['adiantamentos'],
    queryFn: () => base44.entities.Adiantamento.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_adiantamentos'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Adiantamento.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adiantamentos'] });
      setNewAdiantamento({});
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Adiantamento.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['adiantamentos'] })
  });

  const statusCor = {
    'pendente': 'bg-yellow-100 text-yellow-700',
    'aprovado': 'bg-blue-100 text-blue-700',
    'pago': 'bg-green-100 text-green-700',
    'recusado': 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Adiantamentos e Deduções</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Novo Adiantamento</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registar Adiantamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <select value={newAdiantamento.colaborador_id || ''} onChange={(e) => { const c = colaboradores.find(x => x.id === e.target.value); setNewAdiantamento({ ...newAdiantamento, colaborador_id: e.target.value, colaborador_nome: c?.nome, enrollid: c?.enrollid }); }} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={newAdiantamento.tipo || ''} onChange={(e) => setNewAdiantamento({ ...newAdiantamento, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Tipo...</option>
                  <option value="adiantamento_salario">Adiantamento de Salário</option>
                  <option value="adiantamento_ferias">Adiantamento de Férias</option>
                  <option value="deducao">Dedução</option>
                  <option value="outro">Outro</option>
                </select>
                <input type="number" placeholder="Valor (€)" value={newAdiantamento.valor || ''} onChange={(e) => setNewAdiantamento({ ...newAdiantamento, valor: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <input type="text" placeholder="Motivo" value={newAdiantamento.motivo || ''} onChange={(e) => setNewAdiantamento({ ...newAdiantamento, motivo: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <input type="number" placeholder="Parcelas (opcional)" value={newAdiantamento.parcelas || 1} onChange={(e) => setNewAdiantamento({ ...newAdiantamento, parcelas: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <Button onClick={() => createMutation.mutate(newAdiantamento)} className="w-full">Registar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {adiantamentos.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{a.colaborador_nome}</h3>
                    <p className="text-sm text-slate-600">{new Date(a.data_solicitacao).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <Badge className={statusCor[a.estado]}>{a.estado}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                  <div><span className="font-medium">Valor:</span> €{a.valor.toFixed(2)}</div>
                  <div><span className="font-medium">Tipo:</span> {a.tipo.replace(/_/g, ' ')}</div>
                  <div><span className="font-medium">Motivo:</span> {a.motivo}</div>
                  {a.parcelas > 1 && <div><span className="font-medium">Parcelas:</span> {a.parcelas}x €{(a.valor / a.parcelas).toFixed(2)}</div>}
                </div>
                {a.estado === 'pendente' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateMutation.mutate({ id: a.id, data: { estado: 'aprovado' } })}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: a.id, data: { estado: 'recusado' } })}>
                      <XCircle className="h-4 w-4 mr-1" /> Recusar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}