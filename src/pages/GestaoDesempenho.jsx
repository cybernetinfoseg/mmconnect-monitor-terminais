import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Plus, TrendingUp } from 'lucide-react';

export default function GestaoDesempenho() {
  const [newAvaliacao, setNewAvaliacao] = useState({});
  const queryClient = useQueryClient();

  const { data: avaliacoes = [] } = useQuery({
    queryKey: ['avaliacoes'],
    queryFn: () => base44.entities.DesempenhoAvaliacao.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_desempenho'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DesempenhoAvaliacao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avaliacoes'] });
      setNewAvaliacao({});
    }
  });

  const calcularMedia = (a) => {
    const valores = [a.competencias_tecnicas, a.competencias_interpessoais, a.iniciativa, a.qualidade_trabalho, a.cumprimento_prazos].filter(v => v);
    return (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2);
  };

  const corClassificacao = {
    'insuficiente': 'bg-red-100 text-red-700',
    'satisfatorio': 'bg-yellow-100 text-yellow-700',
    'bom': 'bg-blue-100 text-blue-700',
    'muito_bom': 'bg-green-100 text-green-700',
    'excelente': 'bg-purple-100 text-purple-700'
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Desempenho</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nova Avaliação</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Registar Avaliação de Desempenho</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <select
                  value={newAvaliacao.colaborador_id || ''}
                  onChange={(e) => {
                    const colab = colaboradores.find(c => c.id === e.target.value);
                    setNewAvaliacao({ ...newAvaliacao, colaborador_id: e.target.value, colaborador_nome: colab?.nome, enrollid: colab?.enrollid, ano: new Date().getFullYear() });
                  }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Selecione colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                {['competencias_tecnicas', 'competencias_interpessoais', 'iniciativa', 'qualidade_trabalho', 'cumprimento_prazos'].map(field => (
                  <div key={field}>
                    <label className="text-sm font-medium">{field.replace(/_/g, ' ').toUpperCase()}</label>
                    <input type="number" min="1" max="5" value={newAvaliacao[field] || ''} onChange={(e) => setNewAvaliacao({ ...newAvaliacao, [field]: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" placeholder="1-5" />
                  </div>
                ))}
                <div>
                  <label className="text-sm font-medium">Observações</label>
                  <textarea value={newAvaliacao.observacoes || ''} onChange={(e) => setNewAvaliacao({ ...newAvaliacao, observacoes: e.target.value })} className="w-full px-3 py-2 border rounded-md h-24"></textarea>
                </div>
                <Button onClick={() => createMutation.mutate(newAvaliacao)} className="w-full">Guardar Avaliação</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {avaliacoes.map((a) => (
            <Card key={a.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-slate-900">{a.colaborador_nome}</h3>
                    <p className="text-sm text-slate-600">{a.ano}</p>
                  </div>
                  <Badge className={corClassificacao[a.classificacao]}>{a.classificacao}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                  <div><span className="font-medium">Média:</span> {calcularMedia(a)}</div>
                  <div><span className="font-medium">Técnicas:</span> {a.competencias_tecnicas}</div>
                  <div><span className="font-medium">Interpessoais:</span> {a.competencias_interpessoais}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}