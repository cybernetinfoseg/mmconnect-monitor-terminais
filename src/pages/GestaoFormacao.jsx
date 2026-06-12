import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, BookOpen, Award } from 'lucide-react';

export default function GestaoFormacao() {
  const [newFormacao, setNewFormacao] = useState({});
  const queryClient = useQueryClient();

  const { data: formacoes = [] } = useQuery({
    queryKey: ['formacoes'],
    queryFn: () => base44.entities.Formacao.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_formacao'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Formacao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['formacoes'] });
      setNewFormacao({});
    }
  });

  const totalHoras = formacoes.reduce((sum, f) => sum + (f.horas || 0), 0);
  const comCertificado = formacoes.filter(f => f.certificado).length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Formação</h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Registar Formação</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Formação</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <select value={newFormacao.colaborador_id || ''} onChange={(e) => { const c = colaboradores.find(x => x.id === e.target.value); setNewFormacao({ ...newFormacao, colaborador_id: e.target.value, colaborador_nome: c?.nome, enrollid: c?.enrollid }); }} className="w-full px-3 py-2 border rounded-md">
                  <option value="">Colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <input type="text" placeholder="Título da formação" value={newFormacao.titulo || ''} onChange={(e) => setNewFormacao({ ...newFormacao, titulo: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <input type="date" value={newFormacao.data_inicio || ''} onChange={(e) => setNewFormacao({ ...newFormacao, data_inicio: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <input type="date" value={newFormacao.data_fim || ''} onChange={(e) => setNewFormacao({ ...newFormacao, data_fim: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <input type="number" placeholder="Horas" value={newFormacao.horas || ''} onChange={(e) => setNewFormacao({ ...newFormacao, horas: Number(e.target.value) })} className="w-full px-3 py-2 border rounded-md" />
                <input type="text" placeholder="Entidade formadora" value={newFormacao.entidade_formadora || ''} onChange={(e) => setNewFormacao({ ...newFormacao, entidade_formadora: e.target.value })} className="w-full px-3 py-2 border rounded-md" />
                <select value={newFormacao.tipo || 'voluntaria'} onChange={(e) => setNewFormacao({ ...newFormacao, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-md">
                  <option value="voluntaria">Voluntária</option>
                  <option value="obrigatoria">Obrigatória</option>
                </select>
                <Button onClick={() => createMutation.mutate(newFormacao)} className="w-full">Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{formacoes.length}</div>
              <p className="text-sm text-slate-600">Total de Formações</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{totalHoras}</div>
              <p className="text-sm text-slate-600">Horas Totais</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">{comCertificado}</div>
              <p className="text-sm text-slate-600">Com Certificado</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          {formacoes.map((f) => (
            <Card key={f.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-slate-900">{f.titulo}</h3>
                    <p className="text-sm text-slate-600">{f.colaborador_nome} • {f.entidade_formadora}</p>
                    <p className="text-sm text-slate-600 mt-1">{new Date(f.data_inicio).toLocaleDateString('pt-PT')} até {new Date(f.data_fim).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge className={f.tipo === 'obrigatoria' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}>{f.tipo}</Badge>
                    {f.certificado && <Badge className="bg-purple-100 text-purple-700"><Award className="h-3 w-3 mr-1" />Certificado</Badge>}
                  </div>
                </div>
                <p className="text-sm text-slate-700 mt-2">{f.horas} horas</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}