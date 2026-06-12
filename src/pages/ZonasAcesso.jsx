import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Edit2, Trash2, MapPin, Users, Clock, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function ZonasAcesso() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingZona, setEditingZona] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    local: '',
    requer_badge_temporario: false,
    ativa: true
  });

  const queryClient = useQueryClient();

  const { data: zonas = [], isLoading } = useQuery({
    queryKey: ['zonas_acesso'],
    queryFn: () => base44.entities.ZonaAcesso.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_simples'],
    queryFn: () => base44.entities.Colaborador.list('-updated_date', 500)
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ZonaAcesso.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zonas_acesso'] });
      resetForm();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ZonaAcesso.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zonas_acesso'] });
      setEditingZona(null);
      resetForm();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ZonaAcesso.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['zonas_acesso'] })
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome.trim()) return;

    const submitData = {
      ...formData,
      colaboradores_autorizados_ids: JSON.stringify([])
    };

    if (editingZona) {
      updateMutation.mutate({ id: editingZona.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (zona) => {
    setEditingZona(zona);
    setFormData({
      nome: zona.nome,
      descricao: zona.descricao || '',
      local: zona.local || '',
      requer_badge_temporario: zona.requer_badge_temporario || false,
      ativa: zona.ativa !== false
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingZona(null);
    setFormData({ nome: '', descricao: '', local: '', requer_badge_temporario: false, ativa: true });
  };

  const filteredZonas = zonas.filter(z =>
    z.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    z.local?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) return <div className="p-6 text-center">A carregar zonas...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Zonas de Acesso</h1>
          <p className="text-slate-600">Defina áreas de acesso restrito e horários permitidos</p>
        </div>

        {/* Search and Add */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar zona..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="h-4 w-4 mr-2" /> Nova Zona
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <Card className="bg-white border-slate-200">
              <CardHeader>
                <CardTitle>{editingZona ? 'Editar Zona' : 'Nova Zona de Acesso'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Nome *</label>
                    <Input
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="ex: Escritório, Armazém"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Descrição</label>
                    <Input
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Descrição detalhada"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Localização</label>
                    <Input
                      value={formData.local}
                      onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                      placeholder="ex: Piso 2, Sala 201"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.requer_badge_temporario}
                      onChange={(e) => setFormData({ ...formData, requer_badge_temporario: e.target.checked })}
                      id="badge"
                    />
                    <label htmlFor="badge" className="text-sm cursor-pointer">Requer badge temporário para visitantes</label>
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
                      {editingZona ? 'Guardar' : 'Criar Zona'}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredZonas.map((zona) => (
            <motion.div key={zona.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="hover:shadow-md transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-600" />
                        {zona.nome}
                      </CardTitle>
                      <CardDescription>{zona.local}</CardDescription>
                    </div>
                    <Badge className={zona.ativa ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}>
                      {zona.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 mb-4">{zona.descricao}</p>
                  <div className="space-y-2 mb-4 text-sm">
                    {zona.requer_badge_temporario && (
                      <Badge variant="outline" className="mr-2">Badge temporário</Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(zona)}
                      className="flex-1"
                    >
                      <Edit2 className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-1 text-red-600 hover:text-red-700">
                          <Trash2 className="h-3 w-3 mr-1" /> Remover
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogTitle>Remover Zona</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem a certeza que deseja remover "{zona.nome}"?
                        </AlertDialogDescription>
                        <div className="flex gap-2 pt-4">
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(zona.id)}
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

        {filteredZonas.length === 0 && (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="text-center py-12">
              <MapPin className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-3">Nenhuma zona configurada</p>
              <Button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="bg-slate-900 hover:bg-slate-800"
              >
                <Plus className="h-4 w-4 mr-2" /> Criar Primeira Zona
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}