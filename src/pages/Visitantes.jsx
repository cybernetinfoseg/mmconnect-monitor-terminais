import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, LogOut, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format, formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function Visitantes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    telefone: '',
    empresa: '',
    motivo_visita: '',
    responsavel_interno: ''
  });

  const queryClient = useQueryClient();

  const { data: visitantes = [] } = useQuery({
    queryKey: ['visitantes'],
    queryFn: () => base44.entities.Visitante.list('-updated_date', 100)
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_simple'],
    queryFn: () => base44.entities.Colaborador.list('nome', 500)
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const badge = 'V-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      return base44.entities.Visitante.create({
        ...data,
        numero_badge: badge,
        status: 'dentro'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visitantes'] });
      setShowForm(false);
      setFormData({ nome: '', email: '', telefone: '', empresa: '', motivo_visita: '', responsavel_interno: '' });
    }
  });

  const checkOutMutation = useMutation({
    mutationFn: (id) => base44.entities.Visitante.update(id, { status: 'saido', data_saida: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visitantes'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Visitante.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visitantes'] })
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;
    createMutation.mutate(formData);
  };

  const currentVisitantes = visitantes.filter(v => v.status === 'dentro');
  const pastVisitantes = visitantes.filter(v => v.status === 'saido');

  const filteredCurrent = currentVisitantes.filter(v =>
    v.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.empresa?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusColor = {
    dentro: 'bg-green-100 text-green-700',
    saido: 'bg-slate-100 text-slate-700',
    cancelado: 'bg-red-100 text-red-700'
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Gestão de Visitantes</h1>
          <p className="text-slate-600">Registe entradas de visitantes com badges temporários</p>
        </div>

        {/* Search and Add */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar visitante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4 mr-2" /> Novo Visitante
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle>Registar Novo Visitante</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Nome *</label>
                      <Input
                        value={formData.nome}
                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Telefone</label>
                      <Input
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        placeholder="+351 91 234 5678"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Empresa</label>
                      <Input
                        value={formData.empresa}
                        onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                        placeholder="Empresa do visitante"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-sm font-medium">Motivo da Visita</label>
                      <Input
                        value={formData.motivo_visita}
                        onChange={(e) => setFormData({ ...formData, motivo_visita: e.target.value })}
                        placeholder="Reunião, manutenção, etc"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="bg-slate-900 hover:bg-slate-800">Registar Entrada</Button>
                    <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Current Visitantes */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Dentro do Local ({filteredCurrent.length})</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCurrent.map((v) => (
              <motion.div key={v.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="bg-green-50 border-green-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{v.nome}</CardTitle>
                        <p className="text-sm text-slate-600">{v.empresa}</p>
                      </div>
                      <Badge className={statusColor[v.status]}>{v.status === 'dentro' ? 'Presente' : 'Saído'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Badge:</span> {v.numero_badge}</p>
                      <p><span className="font-medium">Entrada:</span> {format(new Date(v.data_entrada), 'HH:mm', { locale: pt })}</p>
                      <p><span className="font-medium">Motivo:</span> {v.motivo_visita || '-'}</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700">
                            <LogOut className="h-3 w-3 mr-1" /> Check-out
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogTitle>Confirmar Saída</AlertDialogTitle>
                          <AlertDialogDescription>
                            Marcar {v.nome} como saído?
                          </AlertDialogDescription>
                          <div className="flex gap-2 pt-4">
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => checkOutMutation.mutate(v.id)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Confirmar Saída
                            </AlertDialogAction>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogTitle>Remover Visitante</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação é irreversível.
                          </AlertDialogDescription>
                          <div className="flex gap-2 pt-4">
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(v.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Remover
                            </AlertDialogAction>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}