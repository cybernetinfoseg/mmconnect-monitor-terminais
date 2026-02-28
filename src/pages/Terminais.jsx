import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Monitor, 
  Plus, 
  Pencil, 
  Trash2, 
  Search,
  RefreshCw,
  Wifi,
  Globe,
  Server,
  Link
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import StatusBadge from '../components/dashboard/StatusBadge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const TIPOS_CONEXAO = [
  { value: 'ip_local',   label: 'IP Local',    icon: Wifi,   desc: 'Endereço IP na rede local (ex: 192.168.1.100)' },
  { value: 'ip_publico', label: 'IP Público',  icon: Globe,  desc: 'Endereço IP público/externo (ex: 203.0.113.1)' },
  { value: 'dns',        label: 'DNS / No-IP', icon: Server, desc: 'Hostname ou domínio dinâmico (ex: host.no-ip.org)' },
  { value: 'api',        label: 'API HTTP',    icon: Link,   desc: 'Endpoint HTTP/HTTPS para verificação de status' },
];

export default function Terminais() {
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState(null);
  const [formData, setFormData] = useState({});
  const [verificandoTodos, setVerificandoTodos] = useState(false);

  const queryClient = useQueryClient();

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['terminals-manage'],
    queryFn: () => base44.entities.Terminal.list('-created_date'),
    refetchInterval: 30000,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const cliente = clientes.find(c => c.id === data.cliente_id);
      const dataWithCliente = { ...data, cliente_nome: cliente?.nome || '' };
      if (editingTerminal) {
        return base44.entities.Terminal.update(editingTerminal.id, dataWithCliente);
      }
      return base44.entities.Terminal.create(dataWithCliente);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['terminals-manage']);
      setDialogOpen(false);
      setEditingTerminal(null);
      setFormData({});
      toast.success(editingTerminal ? 'Terminal atualizado' : 'Terminal criado');
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Terminal.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['terminals-manage']);
      toast.success('Terminal excluído');
    },
    onError: () => toast.error('Erro ao excluir terminal'),
  });

  const monitorMutation = useMutation({
    mutationFn: async (terminal) => {
      const response = await base44.functions.invoke('monitorTerminal', { terminalId: terminal.id });
      return response.data;
    },
    onSuccess: (data, terminal) => {
      queryClient.invalidateQueries(['terminals-manage']);
      if (data.success) {
        const statusText = data.status === 'online' ? '✅ ONLINE' : '❌ OFFLINE';
        const latenciaText = data.latencia ? ` (${data.latencia}ms)` : '';
        const errorText = data.error ? ` - ${data.error}` : '';
        if (data.status === 'online') {
          toast.success(`${terminal.nome}: ${statusText}${latenciaText}`);
        } else {
          toast.error(`${terminal.nome}: ${statusText}${errorText}`);
        }
      }
    },
    onError: (error) => toast.error(`Erro: ${error.message}`),
  });

  const verificarTodos = async () => {
    setVerificandoTodos(true);
    toast.info('Verificando todos os terminais...');
    try {
      const response = await base44.functions.invoke('monitorAllTerminals', {});
      queryClient.invalidateQueries(['terminals-manage']);
      const d = response.data;
      toast.success(`Verificação concluída: ${d.online ?? 0} online, ${d.offline ?? 0} offline`);
    } catch (error) {
      toast.error(`Erro: ${error.message}`);
    }
    setVerificandoTodos(false);
  };

  const filteredTerminals = useMemo(() => {
    return terminals.filter(t => {
      const matchSearch = !searchTerm ||
        t.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.local?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.cliente_nome?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTipo = tipoFilter === 'all' || t.tipo_conexao === tipoFilter;
      return matchSearch && matchTipo;
    });
  }, [terminals, searchTerm, tipoFilter]);

  const handleEdit = (terminal) => {
    setEditingTerminal(terminal);
    setFormData(terminal);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTerminal(null);
    setFormData({ tipo_conexao: 'ip_local', porta: 5005, ativo: true });
    setDialogOpen(true);
  };

  const getTipoInfo = (tipo) => TIPOS_CONEXAO.find(t => t.value === tipo) || { label: tipo, icon: Monitor };

  const getHostDisplay = (terminal) => {
    switch (terminal.tipo_conexao) {
      case 'ip_local':   return terminal.ip_local ? `${terminal.ip_local}:${terminal.porta || 5005}` : '—';
      case 'ip_publico': return terminal.ip_publico ? `${terminal.ip_publico}:${terminal.porta || 5005}` : '—';
      case 'dns':        return terminal.dns ? `${terminal.dns}:${terminal.porta || 5005}` : '—';
      case 'api':        return terminal.api_endpoint || '—';
      default:           return '—';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1920px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl shrink-0">
              <Monitor className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Gestão de Terminais</h1>
              <p className="text-xs sm:text-sm text-emerald-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0 inline-block"></span>
                TCP Socket • Auto-refresh 30s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={verificarTodos}
              disabled={verificandoTodos || terminals.length === 0}
              variant="outline"
              size="sm"
              className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
            >
              <RefreshCw className={cn("h-4 w-4 sm:mr-2", verificandoTodos && "animate-spin")} />
              <span className="hidden sm:inline">{verificandoTodos ? 'Verificando...' : 'Verificar Todos'}</span>
            </Button>
            <Button onClick={handleNew} size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Novo Terminal</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por nome, local ou cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tipo de conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TIPOS_CONEXAO.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Terminals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredTerminals.map((terminal, index) => {
              const tipoInfo = getTipoInfo(terminal.tipo_conexao);
              const TipoIcon = tipoInfo.icon;
              return (
                <motion.div
                  key={terminal.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card className={cn(
                    "bg-white/80 backdrop-blur-sm border-slate-200/50 hover:shadow-lg transition-all",
                    !terminal.ativo && "opacity-60"
                  )}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            {terminal.nome}
                            {!terminal.ativo && <Badge variant="outline" className="text-xs">Inativo</Badge>}
                          </CardTitle>
                          <p className="text-sm text-slate-500 mt-1">{terminal.local}</p>
                        </div>
                        <StatusBadge status={terminal.status} pulse={false} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <TipoIcon className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-slate-600 font-medium">{tipoInfo.label}</span>
                      </div>
                      <div className="text-xs font-mono text-slate-500 bg-slate-50 rounded px-2 py-1 truncate">
                        {getHostDisplay(terminal)}
                      </div>
                      {terminal.cliente_nome && (
                        <div className="text-sm text-slate-600">
                          <span className="text-slate-500">Cliente:</span> {terminal.cliente_nome}
                        </div>
                      )}
                      {terminal.latencia_ms != null && (
                        <div className="text-sm text-slate-600">
                          <span className="text-slate-500">Latência:</span> {terminal.latencia_ms}ms
                        </div>
                      )}
                      <div className="flex gap-2 pt-2 border-t border-slate-100">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => monitorMutation.mutate(terminal)}
                          disabled={monitorMutation.isPending}
                          className="flex-1"
                        >
                          <RefreshCw className={cn("h-3 w-3 mr-1", monitorMutation.isPending && "animate-spin")} />
                          Verificar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEdit(terminal)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { if (confirm('Excluir este terminal?')) deleteMutation.mutate(terminal.id); }}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {filteredTerminals.length === 0 && !isLoading && (
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardContent className="py-12 text-center text-slate-400">
              <Monitor className="h-12 w-12 mx-auto mb-3" />
              <p>Nenhum terminal encontrado</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTerminal ? 'Editar Terminal' : 'Novo Terminal'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="BIO-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Local *</Label>
                <Input
                  value={formData.local || ''}
                  onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                  placeholder="Matriz - Recepção"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={formData.cliente_id || ''} onValueChange={(v) => setFormData({ ...formData, cliente_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Conexão */}
            <div className="space-y-2">
              <Label>Tipo de Conexão *</Label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS_CONEXAO.map(tipo => {
                  const Icon = tipo.icon;
                  const selected = (formData.tipo_conexao || 'ip_local') === tipo.value;
                  return (
                    <button
                      key={tipo.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, tipo_conexao: tipo.value })}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all",
                        selected
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300 bg-white"
                      )}
                    >
                      <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", selected ? "text-blue-600" : "text-slate-400")} />
                      <div>
                        <p className={cn("text-sm font-medium", selected ? "text-blue-700" : "text-slate-700")}>{tipo.label}</p>
                        <p className="text-xs text-slate-400 leading-tight">{tipo.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campos específicos por tipo */}
            {formData.tipo_conexao === 'ip_local' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IP Local *</Label>
                  <Input
                    value={formData.ip_local || ''}
                    onChange={(e) => setFormData({ ...formData, ip_local: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Porta TCP</Label>
                  <Input
                    type="number"
                    value={formData.porta || 5005}
                    onChange={(e) => setFormData({ ...formData, porta: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {formData.tipo_conexao === 'ip_publico' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>IP Público *</Label>
                  <Input
                    value={formData.ip_publico || ''}
                    onChange={(e) => setFormData({ ...formData, ip_publico: e.target.value })}
                    placeholder="203.0.113.1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Porta TCP</Label>
                  <Input
                    type="number"
                    value={formData.porta || 5005}
                    onChange={(e) => setFormData({ ...formData, porta: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {formData.tipo_conexao === 'dns' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>DNS / Hostname *</Label>
                  <Input
                    value={formData.dns || ''}
                    onChange={(e) => setFormData({ ...formData, dns: e.target.value })}
                    placeholder="meuhost.no-ip.org"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Porta TCP</Label>
                  <Input
                    type="number"
                    value={formData.porta || 5005}
                    onChange={(e) => setFormData({ ...formData, porta: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {formData.tipo_conexao === 'api' && (
              <div className="space-y-2">
                <Label>API Endpoint *</Label>
                <Input
                  value={formData.api_endpoint || ''}
                  onChange={(e) => setFormData({ ...formData, api_endpoint: e.target.value })}
                  placeholder="https://api.exemplo.com/terminal/status"
                />
                <p className="text-xs text-slate-400">Deve retornar HTTP 200 quando o terminal estiver online.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.observacoes || ''}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.ativo !== false}
                onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
              />
              <Label>Terminal ativo para monitoramento</Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate(formData)}
                disabled={saveMutation.isPending}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}