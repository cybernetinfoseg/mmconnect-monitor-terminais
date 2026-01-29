import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Plus,
  Search,
  Edit,
  Trash2,
  Monitor,
  Mail,
  Phone,
  MapPin,
  MoreVertical,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ClienteForm from '../components/forms/ClienteForm';
import { cn } from '@/lib/utils';

export default function Clientes() {
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clienteToDelete, setClienteToDelete] = useState(null);

  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: terminais = [] } = useQuery({
    queryKey: ['terminais-count'],
    queryFn: () => base44.entities.Terminal.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Cliente.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['clientes']);
      setFormOpen(false);
      setEditingCliente(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cliente.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['clientes']);
      setFormOpen(false);
      setEditingCliente(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Cliente.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['clientes']);
      setDeleteDialogOpen(false);
      setClienteToDelete(null);
    },
  });

  const getTerminaisCount = (clienteId) => {
    return terminais.filter(t => t.cliente_id === clienteId).length;
  };

  const filteredClientes = useMemo(() => {
    if (!searchTerm) return clientes;
    const term = searchTerm.toLowerCase();
    return clientes.filter(c =>
      c.nome?.toLowerCase().includes(term) ||
      c.cnpj?.toLowerCase().includes(term) ||
      c.cidade?.toLowerCase().includes(term)
    );
  }, [clientes, searchTerm]);

  const handleSave = (data) => {
    if (editingCliente) {
      updateMutation.mutate({ id: editingCliente.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (cliente) => {
    setEditingCliente(cliente);
    setFormOpen(true);
  };

  const handleDelete = (cliente) => {
    setClienteToDelete(cliente);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (clienteToDelete) {
      deleteMutation.mutate(clienteToDelete.id);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
              <p className="text-sm text-slate-500">{clientes.length} clientes cadastrados</p>
            </div>
          </div>

          <Button onClick={() => { setEditingCliente(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nome, CNPJ ou cidade..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Clientes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredClientes.map((cliente, index) => (
              <motion.div
                key={cliente.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.03 }}
              >
                <Card className="h-full bg-white/80 backdrop-blur-sm border-slate-200/50 hover:shadow-lg transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{cliente.nome}</CardTitle>
                        {cliente.cnpj && (
                          <p className="text-xs text-slate-500 mt-1">{cliente.cnpj}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={cliente.ativo !== false ? "default" : "secondary"} 
                               className={cliente.ativo !== false ? "bg-emerald-100 text-emerald-700" : ""}>
                          {cliente.ativo !== false ? (
                            <><CheckCircle className="h-3 w-3 mr-1" />Ativo</>
                          ) : (
                            <><XCircle className="h-3 w-3 mr-1" />Inativo</>
                          )}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(cliente)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(cliente)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(cliente.cidade || cliente.estado) && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span>{[cliente.cidade, cliente.estado].filter(Boolean).join(' - ')}</span>
                      </div>
                    )}
                    {cliente.contato_email && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Mail className="h-4 w-4 text-slate-400" />
                        <span className="truncate">{cliente.contato_email}</span>
                      </div>
                    )}
                    {cliente.contato_telefone && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span>{cliente.contato_telefone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <Monitor className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-700">
                        {getTerminaisCount(cliente.id)} terminais
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredClientes.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12 text-slate-400">
              <Building2 className="h-12 w-12 mx-auto mb-3" />
              <p>Nenhum cliente encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Form Dialog */}
      <ClienteForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingCliente(null); }}
        cliente={editingCliente}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente "{clienteToDelete?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}