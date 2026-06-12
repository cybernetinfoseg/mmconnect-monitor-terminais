import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar, AlertCircle } from 'lucide-react';

export default function GestAoBaixas() {
  const [newBaixa, setNewBaixa] = useState({});
  const [filtroTipo, setFiltroTipo] = useState('todas');
  const queryClient = useQueryClient();

  const { data: baixas = [] } = useQuery({
    queryKey: ['baixas_medicas'],
    queryFn: () => base44.entities.BaixaMedica.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_baixas'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.BaixaMedica.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baixas_medicas'] });
      setNewBaixa({});
    }
  });

  const filtered = filtroTipo === 'todas' ? baixas : baixas.filter(b => b.tipo === filtroTipo);

  const calcularDias = (inicio, fim) => {
    const d1 = new Date(inicio);
    const d2 = new Date(fim);
    return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Baixas Médicas</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Baixa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registar Baixa Médica</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <select
                  value={newBaixa.colaborador_id || ''}
                  onChange={(e) => {
                    const colab = colaboradores.find(c => c.id === e.target.value);
                    setNewBaixa({ ...newBaixa, colaborador_id: e.target.value, colaborador_nome: colab?.nome, enrollid: colab?.enrollid });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Selecione colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="date" placeholder="Data início" value={newBaixa.data_inicio || ''} onChange={(e) => setNewBaixa({ ...newBaixa, data_inicio: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <input type="date" placeholder="Data fim" value={newBaixa.data_fim || ''} onChange={(e) => setNewBaixa({ ...newBaixa, data_fim: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <select value={newBaixa.tipo || ''} onChange={(e) => setNewBaixa({ ...newBaixa, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Tipo de baixa...</option>
                  <option value="doenca">Doença</option>
                  <option value="acidente_trabalho">Acidente de Trabalho</option>
                  <option value="licenca_maternidade">Licença Maternidade</option>
                  <option value="outro">Outro</option>
                </select>
                <input type="number" placeholder="Dias totais" value={newBaixa.dias_total || ''} onChange={(e) => setNewBaixa({ ...newBaixa, dias_total: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <Button onClick={() => createMutation.mutate(newBaixa)} className="w-full">Registar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="mb-6 px-3 py-2 border rounded-md">
          <option value="todas">Todas</option>
          <option value="doenca">Doença</option>
          <option value="acidente_trabalho">Acidente de Trabalho</option>
        </select>

        <div className="grid gap-4">
          {filtered.map((b) => (
            <Card key={b.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{b.colaborador_nome}</h3>
                    <p className="text-sm text-slate-600">
                      {new Date(b.data_inicio).toLocaleDateString('pt-PT')} até {new Date(b.data_fim).toLocaleDateString('pt-PT')}
                    </p>
                  </div>
                  <Badge className="bg-red-100 text-red-700">{b.tipo.replace(/_/g, ' ')}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="font-medium">Dias:</span> {b.dias_total}</div>
                  <div><span className="font-medium">SS:</span> {b.ss_confirmada ? 'Sim' : 'Não'}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}