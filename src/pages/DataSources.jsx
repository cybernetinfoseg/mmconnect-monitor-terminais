import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Server,
  Globe,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Play,
  Clock,
  Settings
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import DataSourceForm from '../components/forms/DataSourceForm';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function DataSources() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sourceToDelete, setSourceToDelete] = useState(null);

  const queryClient = useQueryClient();

  const { data: dataSources = [], isLoading } = useQuery({
    queryKey: ['data-sources'],
    queryFn: () => base44.entities.DataSourceConfig.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DataSourceConfig.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['data-sources']);
      setFormOpen(false);
      setEditingSource(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DataSourceConfig.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['data-sources']);
      setFormOpen(false);
      setEditingSource(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DataSourceConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['data-sources']);
      setDeleteDialogOpen(false);
      setSourceToDelete(null);
    },
  });

  const handleSave = (data) => {
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (source) => {
    setEditingSource(source);
    setFormOpen(true);
  };

  const handleDelete = (source) => {
    setSourceToDelete(source);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (sourceToDelete) {
      deleteMutation.mutate(sourceToDelete.id);
    }
  };

  const getTypeIcon = (tipo) => {
    if (['api_rest', 'api_graphql'].includes(tipo)) {
      return Globe;
    }
    return Database;
  };

  const getTypeLabel = (tipo) => {
    const labels = {
      sqlserver: 'SQL Server',
      mysql: 'MySQL',
      postgresql: 'PostgreSQL',
      api_rest: 'API REST',
      api_graphql: 'API GraphQL'
    };
    return labels[tipo] || tipo;
  };

  const getSyncStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle className="h-3 w-3 mr-1" />Sucesso</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      default:
        return <Badge className="bg-slate-100 text-slate-700 border-slate-200"><AlertCircle className="h-3 w-3 mr-1" />Nunca</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Database className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Fontes de Dados</h1>
              <p className="text-sm text-slate-500">Configuração de conectores SQL e API</p>
            </div>
          </div>

          <Button onClick={() => { setEditingSource(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Fonte
          </Button>
        </div>

        {/* Info Alert */}
        <Alert className="bg-blue-50 border-blue-200">
          <Settings className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">Integração com SQL Server / API</AlertTitle>
          <AlertDescription className="text-blue-800">
            Para conectar a fontes de dados externas (SQL Server, MySQL, APIs), é necessário habilitar 
            <strong> Backend Functions</strong> nas configurações do app. Isso permite criar funções 
            serverless que se conectam de forma segura ao seu banco de dados ou API.
          </AlertDescription>
        </Alert>

        {/* Data Sources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {dataSources.map((source, index) => {
              const TypeIcon = getTypeIcon(source.tipo);
              return (
                <motion.div
                  key={source.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={cn(
                    "h-full bg-white/80 backdrop-blur-sm border-slate-200/50 hover:shadow-lg transition-all",
                    !source.ativo && "opacity-60"
                  )}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            source.tipo === 'sqlserver' ? "bg-blue-100" :
                            source.tipo === 'mysql' ? "bg-orange-100" :
                            source.tipo === 'postgresql' ? "bg-indigo-100" :
                            "bg-emerald-100"
                          )}>
                            <TypeIcon className={cn(
                              "h-5 w-5",
                              source.tipo === 'sqlserver' ? "text-blue-600" :
                              source.tipo === 'mysql' ? "text-orange-600" :
                              source.tipo === 'postgresql' ? "text-indigo-600" :
                              "text-emerald-600"
                            )} />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{source.nome}</CardTitle>
                            <p className="text-xs text-slate-500">{getTypeLabel(source.tipo)}</p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(source)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <Play className="h-4 w-4 mr-2" />
                              Testar Conexão
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Sincronizar Agora
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(source)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {source.host && (
                        <div className="flex items-center gap-2 text-sm">
                          <Server className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600 truncate">
                            {source.host}:{source.porta}
                          </span>
                        </div>
                      )}
                      {source.api_url && (
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600 truncate">{source.api_url}</span>
                        </div>
                      )}
                      {source.database && (
                        <div className="flex items-center gap-2 text-sm">
                          <Database className="h-4 w-4 text-slate-400" />
                          <span className="text-slate-600">{source.database}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          {getSyncStatusBadge(source.status_sync)}
                        </div>
                        <Badge variant={source.ativo ? "default" : "secondary"} 
                               className={source.ativo ? "bg-emerald-100 text-emerald-700" : ""}>
                          {source.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>

                      {source.ultimo_sync && (
                        <p className="text-xs text-slate-400">
                          Última sync: {moment(source.ultimo_sync).format('DD/MM HH:mm')}
                        </p>
                      )}

                      {source.erro_ultimo_sync && (
                        <p className="text-xs text-red-500 truncate" title={source.erro_ultimo_sync}>
                          Erro: {source.erro_ultimo_sync}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {dataSources.length === 0 && !isLoading && (
            <div className="col-span-full text-center py-12 text-slate-400">
              <Database className="h-12 w-12 mx-auto mb-3" />
              <p className="mb-2">Nenhuma fonte de dados configurada</p>
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Fonte
              </Button>
            </div>
          )}
        </div>

        {/* Help Section */}
        <Card className="bg-slate-900 text-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Como funciona a integração?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">1</div>
                  <h4 className="font-medium">Configure a Fonte</h4>
                </div>
                <p className="text-sm text-slate-400">
                  Adicione as credenciais do SQL Server ou URL da API. A senha deve ser configurada como Secret.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">2</div>
                  <h4 className="font-medium">Defina a Query</h4>
                </div>
                <p className="text-sm text-slate-400">
                  Crie a query SQL que retorna os terminais e seu status, ou configure o endpoint da API.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">3</div>
                  <h4 className="font-medium">Sincronização</h4>
                </div>
                <p className="text-sm text-slate-400">
                  O sistema sincroniza automaticamente os dados no intervalo configurado (padrão: 5 minutos).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <DataSourceForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingSource(null); }}
        dataSource={editingSource}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a fonte "{sourceToDelete?.nome}"?
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