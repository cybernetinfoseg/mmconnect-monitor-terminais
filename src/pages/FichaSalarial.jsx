import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Save } from 'lucide-react';

export default function FichaSalarial() {
  const [newFicha, setNewFicha] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  const { data: fichas = [] } = useQuery({
    queryKey: ['fichas_salariais'],
    queryFn: () => base44.entities.FichaSalarial.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_ficha'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.FichaSalarial.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fichas_salariais'] });
      setNewFicha({});
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.FichaSalarial.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fichas_salariais'] })
  });

  const filtered = fichas.filter(f => 
    colaboradores.find(c => c.id === f.colaborador_id)?.nome?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Fichas Salariais</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Ficha</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova Ficha Salarial</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <select value={newFicha.colaborador_id || ''} onChange={(e) => { const c = colaboradores.find(x => x.id === e.target.value); setNewFicha({ ...newFicha, colaborador_id: e.target.value, nif: c?.nif, niss: c?.niss }); }} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="number" placeholder="Salário base anual" value={newFicha.salario_base_anual || ''} onChange={(e) => setNewFicha({ ...newFicha, salario_base_anual: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <input type="number" placeholder="Subsídio alimentação mensal" value={newFicha.subsidio_alimentacao_mensal || ''} onChange={(e) => setNewFicha({ ...newFicha, subsidio_alimentacao_mensal: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <select value={newFicha.subsidio_alimentacao_tipo || 'cartao_refeicao'} onChange={(e) => setNewFicha({ ...newFicha, subsidio_alimentacao_tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  <option value="cartao_refeicao">Cartão Refeição</option>
                  <option value="dinheiro">Dinheiro</option>
                </select>
                <input type="text" placeholder="IBAN" value={newFicha.iban || ''} onChange={(e) => setNewFicha({ ...newFicha, iban: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <Button onClick={() => createMutation.mutate(newFicha)} className="w-full">Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <input
          placeholder="Buscar colaborador..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-6 w-full px-3 py-2 border rounded-md"
        />

        <div className="grid gap-4">
          {filtered.map((f) => {
            const colab = colaboradores.find(c => c.id === f.colaborador_id);
            return (
              <Card key={f.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-slate-900">{colab?.nome}</h3>
                      <p className="text-sm text-slate-600">NIF: {f.nif}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => updateMutation.mutate({ id: f.id, data: f })}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="font-medium">Salário:</span> €{(f.salario_base_anual / 12).toFixed(2)}/mês</div>
                    <div><span className="font-medium">Sub. Alimentação:</span> €{f.subsidio_alimentacao_mensal}</div>
                    <div><span className="font-medium">IBAN:</span> {f.iban}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}