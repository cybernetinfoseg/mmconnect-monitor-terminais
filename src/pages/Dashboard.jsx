import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor,
  Wifi,
  WifiOff,
  Activity,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Settings2,
  MapPin,
  Building2,
  ArrowUpDown,
  Tv,
  LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { resolvePermissions } from '@/components/auth/usePermissions.jsx';
import StatusBadge from '../components/dashboard/StatusBadge';
import LiveClock from '../components/dashboard/LiveClock';
import FilterDropdown from '../components/dashboard/FilterDropdown';
import PullToRefresh from '../components/dashboard/PullToRefresh';

export default function Dashboard() {
  const [localFilter, setLocalFilter] = useState(null);
  const [clienteFilter, setClienteFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortBy, setSortBy] = useState('status');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    base44.entities.MonitorConfig.list()
      .then((configs) => {
        const config = configs[0];
        if (config?.intervalo_sync_minutos) {
          setRefreshInterval(config.intervalo_sync_minutos * 60 * 1000);
        }
      })
      .catch(() => setRefreshInterval(5000));
  }, []);

  const perms = resolvePermissions(currentUser);
  const canSeeAll = currentUser?.role === 'admin' || currentUser?.role === 'editor';

  const { data: allTerminals = [], refetch } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => base44.entities.Terminal.list(),
    refetchInterval: refreshInterval,
    enabled: !!currentUser,
  });

  const terminals = useMemo(() => {
    if (!currentUser) return [];
    if (canSeeAll) return allTerminals;
    return allTerminals.filter(t => t.created_by === currentUser.email);
  }, [allTerminals, currentUser, canSeeAll]);

  const handleMonitorAll = async () => {
    setIsMonitoring(true);
    try {
      await base44.functions.invoke('monitorAllTerminals', {});
      setTimeout(() => refetch(), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsMonitoring(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const locais = useMemo(() =>
    [...new Set(terminals.map(t => t.local).filter(Boolean))].sort(), [terminals]);

  const clientes = useMemo(() =>
    [...new Set(terminals.map(t => t.cliente_nome || t.cliente).filter(Boolean))].sort(), [terminals]);

  const filteredTerminals = useMemo(() => {
    let list = terminals.filter(t => {
      if (localFilter && t.local !== localFilter) return false;
      if (clienteFilter && t.cliente_nome !== clienteFilter && t.cliente !== clienteFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });
    if (sortBy === 'status') list = [...list].sort((a, b) => a.status === 'offline' ? -1 : 1);
    else if (sortBy === 'nome') list = [...list].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    else if (sortBy === 'ping') list = [...list].sort((a, b) => (b.segundos_sem_ping || 0) - (a.segundos_sem_ping || 0));
    return list;
  }, [terminals, localFilter, clienteFilter, statusFilter, sortBy]);

  const stats = useMemo(() => {
    const online = filteredTerminals.filter(t => t.status === 'online').length;
    const offline = filteredTerminals.filter(t => t.status === 'offline').length;
    return { total: filteredTerminals.length, online, offline };
  }, [filteredTerminals]);

  // Sync filters to localStorage for TV Mode mirroring
  useEffect(() => {
    localStorage.setItem('dashboard-filters', JSON.stringify({
      local: localFilter, cliente: clienteFilter, status: statusFilter, sort: sortBy
    }));
  }, [localFilter, clienteFilter, statusFilter, sortBy]);

  const formatTimeSince = (seconds) => {
    if (!seconds || seconds < 0) return '—';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };

  return (
    <PullToRefresh onRefresh={handleManualRefresh}>
      <div className="min-h-screen bg-slate-900 text-white">

        {/* Header */}
        <div className="bg-slate-800/50 border-b border-slate-700/50 px-4 sm:px-8 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-emerald-500/20 rounded-lg shrink-0">
                <Activity className="h-5 w-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">NOC Monitor</h1>
                <p className="text-xs text-slate-400 truncate">Terminais Biométricos</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-8 px-2 sm:px-3"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                <span className="hidden sm:inline ml-1 text-xs">Atualizar</span>
              </Button>
              <Button
                size="sm"
                onClick={handleMonitorAll}
                disabled={isMonitoring}
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-2 sm:px-3"
              >
                <Activity className={cn("h-3.5 w-3.5", isMonitoring && "animate-pulse")} />
                <span className="hidden sm:inline ml-1 text-xs">Verificar Agora</span>
              </Button>
              <Link
                to={`/TVMode${localFilter || clienteFilter ? `?${new URLSearchParams([...(localFilter ? [['local', localFilter]] : []), ...(clienteFilter ? [['cliente', clienteFilter]] : [])]).toString()}` : ''}`}
                className="hidden sm:block"
              >
                <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-8 px-2 sm:px-3 text-xs gap-1">
                  <Tv className="h-3.5 w-3.5" />
                  Modo TV
                </Button>
              </Link>
              <div className="hidden sm:block">
                <LiveClock />
              </div>
            </div>
          </div>
          {/* Mobile clock */}
          <div className="sm:hidden mt-1 text-right">
            <LiveClock />
          </div>
        </div>

        {/* KPI Strip */}
        <div className="px-4 sm:px-8 py-4 bg-slate-800/30 border-b border-slate-700/50">
          <div className="flex items-center justify-center gap-6 sm:gap-16 flex-wrap">
            <motion.div className="flex items-center gap-3 sm:gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <Monitor className="h-6 w-6 sm:h-8 sm:w-8 text-blue-400" />
              <div>
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Total</p>
                <p className="text-3xl sm:text-4xl font-bold text-blue-400 tabular-nums">{stats.total}</p>
              </div>
            </motion.div>
            <motion.div className="flex items-center gap-3 sm:gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Wifi className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-400" />
              <div>
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Online</p>
                <p className="text-3xl sm:text-4xl font-bold text-emerald-400 tabular-nums">{stats.online}</p>
              </div>
            </motion.div>
            <motion.div className="flex items-center gap-3 sm:gap-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <WifiOff className="h-6 w-6 sm:h-8 sm:w-8 text-red-400" />
              <div>
                <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Offline</p>
                <p className="text-3xl sm:text-4xl font-bold text-red-400 tabular-nums">{stats.offline}</p>
              </div>
            </motion.div>
            <motion.div className="flex items-center gap-3 sm:gap-4 pl-6 sm:pl-8 border-l border-slate-700" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              {stats.offline === 0
                ? <><CheckCircle className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-400" /><div><p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Status</p><p className="text-base sm:text-lg font-bold text-emerald-400">OPERACIONAL</p></div></>
                : <><AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-400 animate-pulse" /><div><p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Status</p><p className="text-base sm:text-lg font-bold text-red-400">ALERTA</p></div></>
              }
            </motion.div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 sm:px-8 py-3 bg-slate-800/20 border-b border-slate-700/30">
          <div className="flex flex-wrap items-end gap-2 sm:gap-3">
            <FilterDropdown
              label="Filtrar por Local"
              icon={MapPin}
              value={localFilter}
              onChange={setLocalFilter}
              options={locais}
              placeholder="Todos os locais"
            />
            <FilterDropdown
              label="Filtrar por Cliente"
              icon={Building2}
              value={clienteFilter}
              onChange={setClienteFilter}
              options={clientes}
              placeholder="Todos os clientes"
            />
            <FilterDropdown
              label="Status"
              icon={Activity}
              value={statusFilter}
              onChange={setStatusFilter}
              options={['online', 'offline']}
              placeholder="Todos os status"
            />
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />
                Ordenar por
              </label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-8 px-2 rounded-md border border-slate-600 bg-slate-800 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500"
              >
                <option value="status">Status (offline primeiro)</option>
                <option value="nome">Nome (A-Z)</option>
                <option value="ping">Sem ping (maior primeiro)</option>
              </select>
            </div>
            {(localFilter || clienteFilter || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setLocalFilter(null); setClienteFilter(null); setStatusFilter(null); }}
                className="text-slate-400 hover:text-white text-xs h-8"
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Terminals Grid */}
        <div className="p-4 sm:p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
            <AnimatePresence mode="popLayout">
              {filteredTerminals.map((terminal, index) => (
                <motion.div
                  key={terminal.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    "relative overflow-hidden rounded-2xl p-5 transition-all duration-300",
                    terminal.status === 'offline'
                      ? "bg-red-500/10 border border-red-500/30"
                      : "bg-slate-800/50 border border-slate-700/50 hover:border-slate-600/50"
                  )}
                >
                  {terminal.status === 'offline' && (
                    <motion.div
                      className="absolute inset-0 bg-red-500/5"
                      animate={{ opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                  <div className="relative">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-bold text-white truncate flex-1 mr-2 text-lg">{terminal.nome}</h3>
                      <StatusBadge status={terminal.status} />
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <p className="text-slate-400 truncate">
                        <span className="text-slate-500">Local:</span> {terminal.local}
                      </p>
                      <p className="text-slate-400 truncate">
                        <span className="text-slate-500">Cliente:</span> {terminal.cliente_nome || terminal.cliente}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Último ping</span>
                      <span className={cn(
                        "text-sm font-mono",
                        terminal.status === 'offline' ? "text-red-400 font-semibold" : "text-slate-400"
                      )}>
                        {formatTimeSince(terminal.segundos_sem_ping)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredTerminals.length === 0 && (
            <div className="text-center py-20 text-slate-500">
              <Monitor className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum terminal encontrado</p>
            </div>
          )}

          <div className="mt-8 text-center text-slate-600 text-sm">
            Auto-refresh a cada {refreshInterval >= 60000 ? (refreshInterval / 60000).toFixed(0) + ' minuto(s)' : (refreshInterval / 1000).toFixed(0) + ' segundo(s)'} • Modo NOC 24/7
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}