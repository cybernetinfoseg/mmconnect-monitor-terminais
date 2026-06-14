import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Wrench, Cpu, HardDrive, Monitor, Plus, Trash2,
  RefreshCw, Search, Wifi, WifiOff, ExternalLink,
  Clock, Calendar, Server
} from 'lucide-react';

export default function AgentesLocais() {
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-list'],
    queryFn: () => base44.entities.AgentRegistry.list('-ultimo_heartbeat'),
    enabled: !!currentUser,
    refetchInterval: 15000,
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants-agents'],
    queryFn: () => base44.entities.Tenant.list('nome'),
    enabled: !!currentUser,
  });
  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-agents'],
    queryFn: () => base44.entities.Terminal.list('nome'),
    enabled: !!currentUser,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AgentRegistry.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['agents-list']); toast.success('Agente removido'); },
  });

  const filtered = agents.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.hostname || '').toLowerCase().includes(q) ||
           (a.tenant_nome || '').toLowerCase().includes(q) ||
           (a.ip_local || '').includes(q);
  });

  const tenantMap = {};
  tenants.forEach(t => { tenantMap[t.id] = t.nome; });

  const now = new Date();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-100 rounded-xl">
              <Wrench className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Agentes Locais</h1>
              <p className="text-sm text-slate-500">Gestão de agentes de monitoramento instalados nos sites</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries(['agents-list'])} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: agents.length, icon: Server, color: 'bg-slate-50 border-slate-200 text-slate-700' },
            { label: 'Online', value: agents.filter(a => a.status === 'online').length, icon: Wifi, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { label: 'Offline', value: agents.filter(a => a.status !== 'online').length, icon: WifiOff, color: 'bg-red-50 border-red-200 text-red-700' },
            { label: 'Heartbeat <5min', value: agents.filter(a => {
              if (!a.ultimo_heartbeat) return false;
              return (now - new Date(a.ultimo_heartbeat)) < 5 * 60 * 1000;
            }).length, icon: Clock, color: 'bg-blue-50 border-blue-200 text-blue-700' },
          ].map((s, i) => (
            <Card key={i} className={cn('border', s.color)}>
              <CardContent className="p-4 text-center">
                <s.icon className="h-5 w-5 mx-auto mb-2 opacity-50" />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs mt-0.5 opacity-70">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Pesquisar hostname, tenant, IP..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>

        {/* Agent list */}
        {isLoading ? (
          <div className="flex justify-center py-16"><RefreshCw className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white border-slate-200">
            <CardContent className="py-16 text-center text-slate-400">
              <Wrench className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium mb-1">Nenhum agente registado</p>
              <p className="text-sm">Os agentes são registados automaticamente ao iniciar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(agent => {
              const lastHeartbeat = agent.ultimo_heartbeat ? new Date(agent.ultimo_heartbeat) : null;
              const minutesAgo = lastHeartbeat ? Math.round((now - lastHeartbeat) / 60000) : null;
              const isOnline = agent.status === 'online';
              const tenantName = tenantMap[agent.tenant_id] || agent.tenant_nome || '—';

              return (
                <Card key={agent.id} className={cn('bg-white border-slate-200 hover:shadow-md transition-shadow',
                  isOnline ? 'border-l-4 border-l-emerald-500' : 'border-l-4 border-l-red-400')}>
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
                          isOnline ? 'bg-emerald-100' : 'bg-red-100')}>
                          <Cpu className={cn('h-5 w-5', isOnline ? 'text-emerald-600' : 'text-red-500')} />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{agent.hostname}</p>
                          <p className="text-[11px] text-slate-400">{agent.sistema_operativo || '—'}</p>
                        </div>
                      </div>
                      <Badge className={cn('text-[10px]', isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {agent.status}
                      </Badge>
                    </div>

                    {/* Info */}
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="text-slate-500">
                        <span className="block text-[10px] text-slate-400">Versão</span>
                        {agent.versao || '—'}
                      </div>
                      <div className="text-slate-500">
                        <span className="block text-[10px] text-slate-400">IP Local</span>
                        <code className="text-[10px]">{agent.ip_local || '—'}</code>
                      </div>
                      <div className="text-slate-500">
                        <span className="block text-[10px] text-slate-400">Tenant</span>
                        {tenantName}
                      </div>
                      <div className="text-slate-500">
                        <span className="block text-[10px] text-slate-400">Terminais</span>
                        {agent.terminais_ativos ?? 0}
                      </div>
                    </div>

                    {/* Heartbeat */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {lastHeartbeat ? (
                          <span className={cn(minutesAgo < 5 ? 'text-emerald-600' : minutesAgo < 15 ? 'text-amber-600' : 'text-red-600')}>
                            {minutesAgo}min atrás
                          </span>
                        ) : 'Nunca'}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteMutation.mutate(agent.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}