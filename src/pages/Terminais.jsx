import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor,
  Plus,
  Search,
  Edit,
  Trash2,
  MoreVertical,
  Wifi,
  WifiOff,
  Network,
  MapPin,
  Building2,
  RefreshCw,
  Filter,
  Play,
  Pause,
  Globe,
  Server,
  Clock,
  Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import TerminalForm from '../components/forms/TerminalForm';
import StatusBadge from '../components/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function Terminais() {
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteFilter, setClienteFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [terminalToDelete, setTerminalToDelete] = useState(null);
  const [viewMode, setViewMode] = useState('table');

  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    const unsubscribe = base44.entities.Terminal.subscribe((event) => {
      queryClient.invalidateQueries(['terminais']);
    });
    return unsubscribe;
  }, [queryClient]);

  const { data: terminais = [], isLoading, refetch } = useQuery({
    queryKey: ['terminais'],
    queryFn: () => base44.entities.Terminal.list(),
    refetchInterval: 5000, // Real-time: refresh every 5 seconds
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-list'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Terminal.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['terminais']);
      setFormOpen(false);
      setEditingTerminal(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Terminal.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['terminais']);
      setFormOpen(false);
      setEditingTerminal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Terminal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['terminais']);
      setDeleteDialogOpen(false);
      setTerminalToDelete(null);
    },
  });

  const filteredTerminais = useMemo(() => {
    return terminais.filter(t => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!t.nome?.toLowerCase().includes(term) &&
            !t.local?.toLowerCase().includes(term) &&
            !t.ip_local?.includes(term) &&
            !t.ip_publico?.includes(term) &&
            !t.dns?.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (clienteFilter !== 'all' && t.cliente_id !== clienteFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    }).sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'offline' ? -1 : 1;
      }
      return (b.segundos_sem_ping || 0) - (a.segundos_sem_ping || 0);
    });
  }, [terminais, searchTerm, clienteFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: terminais.length,
    online: terminais.filter(t => t.status === 'online').length,
    offline: terminais.filter(t => t.status === 'offline').length,
    warning: terminais.filter(t => t.status === 'warning').length,
  }), [terminais]);

  const handleSave = (data) => {
    if (editingTerminal) {
      updateMutation.mutate({ id: editingTerminal.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (terminal) => {
    setEditingTerminal(terminal);
    setFormOpen(true);
  };

  const handleDelete = (terminal) => {
    setTerminalToDelete(terminal);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (terminalToDelete) {
      deleteMutation.mutate(terminalToDelete.id);
    }
  };

  const toggleMonitoramento = (terminal) => {
    updateMutation.mutate({
      id: terminal.id,
      data: { monitoramento_ativo: !terminal.monitoramento_ativo }
    });
  };

  const handleAcertarHora = async (terminal) => {
    try {
      const { data } = await base44.functions.invoke('acertarHora', {
        terminal_id: terminal.id
      });
      alert(`Hora acertada no terminal ${terminal.nome}`);
    } catch (error) {
      alert(`Erro ao acertar hora: ${error.message}`);
    }
  };

  const handleRecolherMarcacoes = async (terminal) => {
    try {
      const { data } = await base44.functions.invoke('recolherMarcacoes', {
        terminal_id: terminal.id
      });
      alert(`${data.total} marcações recolhidas do terminal ${terminal.nome}`);
    } catch (error) {
      alert(`Erro ao recolher marcações: ${error.message}`);
    }
  };

  const getConnectionInfo = (terminal) => {
    if (terminal.metodo_conexao === 'dns' && terminal.dns) {
      return { icon: Globe, value: terminal.dns, label: 'DNS' };
    }
    if (terminal.metodo_conexao === 'ip_publico' && terminal.ip_publico) {
      return { icon: Globe, value: terminal.ip_publico, label: 'IP Público' };
    }
    return { icon: Server, value: terminal.ip_local || '—', label: 'IP Local' };
  };

  const formatTimeSince = (seconds) => {
    if (!seconds || seconds < 0) return '—';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Monitor className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Terminais</h1>
              <p className="text-sm text-slate-500">
                {stats.total} terminais • 
                <span className="text-emerald-600 ml-1">{stats.online} online</span> • 
                <span className="text-red-600 ml-1">{stats.offline} offline</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            <Button onClick={() => { setEditingTerminal(null); setFormOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Terminal
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, local, IP ou DNS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={clienteFilter} onValueChange={setClienteFilter}>
            <SelectTrigger className="w-[200px]">
              <Building2 className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="unknown">Desconhecido</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 p-1 bg-white rounded-lg border">
            <span className="relative flex h-2 w-2 ml-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs text-slate-500 px-2">Tempo real: 5s</span>
          </div>
        </div>

        {/* Table */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="w-[200px]">Terminal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Conexão</TableHead>
                  <TableHead>Porta</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Último Ping</TableHead>
                  <TableHead className="text-right">Sem Ping</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {filteredTerminais.map((terminal, index) => {
                    const conn = getConnectionInfo(terminal);
                    const ConnIcon = conn.icon;
                    return (
                      <motion.tr
                        key={terminal.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "border-b transition-colors",
                          terminal.status === 'offline' && "bg-red-50/30",
                          !terminal.monitoramento_ativo && "opacity-60"
                        )}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              terminal.status === 'online' ? "bg-emerald-100" :
                              terminal.status === 'offline' ? "bg-red-100" : "bg-slate-100"
                            )}>
                              <Monitor className={cn(
                                "h-4 w-4",
                                terminal.status === 'online' ? "text-emerald-600" :
                                terminal.status === 'offline' ? "text-red-600" : "text-slate-400"
                              )} />
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{terminal.nome}</p>
                              {terminal.local && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {terminal.local}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-slate-600">{terminal.cliente_nome || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ConnIcon className="h-4 w-4 text-slate-400" />
                            <div>
                              <p className="text-sm font-mono">{conn.value}</p>
                              <p className="text-xs text-slate-400">{conn.label}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-slate-600">
                            {terminal.porta || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status={terminal.status} pulse={terminal.status === 'offline'} />
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-slate-500">
                            {terminal.ultimo_ping 
                              ? moment(terminal.ultimo_ping).format('DD/MM HH:mm:ss')
                              : '—'
                            }
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn(
                            "font-mono",
                            terminal.status === 'offline' ? "text-red-600 font-semibold" : "text-slate-500"
                          )}>
                            {formatTimeSince(terminal.segundos_sem_ping)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(terminal)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAcertarHora(terminal)}>
                                <Clock className="h-4 w-4 mr-2" />
                                Acertar Hora
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleRecolherMarcacoes(terminal)}>
                                <Download className="h-4 w-4 mr-2" />
                                Recolher Marcações
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => toggleMonitoramento(terminal)}>
                                {terminal.monitoramento_ativo ? (
                                  <><Pause className="h-4 w-4 mr-2" />Pausar Monitoramento</>
                                ) : (
                                  <><Play className="h-4 w-4 mr-2" />Ativar Monitoramento</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDelete(terminal)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>

                {filteredTerminais.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                      <Monitor className="h-12 w-12 mx-auto mb-3" />
                      <p>Nenhum terminal encontrado</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <TerminalForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingTerminal(null); }}
        terminal={editingTerminal}
        clientes={clientes}
        onSave={handleSave}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o terminal "{terminalToDelete?.nome}"?
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