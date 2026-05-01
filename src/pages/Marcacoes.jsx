import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  ClipboardList, Search, Download, RefreshCw,
  User, Loader2, Upload, CheckCircle2, XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MODO_LABELS = { fp: '🖐️ FP', face: '😊 Face', card: '💳 Cartão', pw: '🔑 Senha', 1: '🖐️ FP', 3: '💳 Cartão', 8: '😊 Face', 15: '🔑 Senha' };
const TIPO_COLORS = { entrada: 'bg-emerald-100 text-emerald-700 border-emerald-200', saida: 'bg-rose-100 text-rose-700 border-rose-200', desconhecido: 'bg-slate-100 text-slate-600 border-slate-200' };

export default function Marcacoes() {
  const [search, setSearch] = useState('');
  const [terminalFilter, setTerminalFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [currentUser, setCurrentUser] = useState(null);
  const [collecting, setCollecting] = useState(null); // terminalId or 'all'

  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: marcacoes = [], isLoading, refetch } = useQuery({
    queryKey: ['marcacoes'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 1000),
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-marcacoes', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.Terminal.list('nome');
      const [a, b] = await Promise.all([
        base44.entities.Terminal.filter({ usuario_email: currentUser?.email }, 'nome'),
        base44.entities.Terminal.filter({ created_by: currentUser?.email }, 'nome'),
      ]);
      const seen = new Set();
      return [...a, ...b].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    },
    enabled: !!currentUser,
  });

  const { data: terminalUsers = [] } = useQuery({
    queryKey: ['terminal-users-map', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('enrollid', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'enrollid', 500);
    },
    enabled: !!currentUser,
  });

  const userMap = useMemo(() => {
    const m = {};
    terminalUsers.forEach(u => { m[u.enrollid] = u.nome; });
    return m;
  }, [terminalUsers]);

  // Set of terminal IDs belonging to this user
  const myTerminalIds = useMemo(() => new Set(terminals.map(t => t.id)), [terminals]);

  const allOwners = useMemo(() =>
    [...new Set(marcacoes.map(m => terminals.find(t => t.id === m.terminal_id)?.usuario_email || terminals.find(t => t.id === m.terminal_id)?.created_by).filter(Boolean))].sort(),
    [marcacoes, terminals]
  );

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to = dateTo ? new Date(dateTo + 'T23:59:59') : null;
    return marcacoes.filter(m => {
      // Ownership filter — non-admins only see own terminals' records
      if (!isAdmin && !myTerminalIds.has(m.terminal_id)) return false;
      if (isAdmin && ownerFilter !== 'all') {
        const t = terminals.find(t => t.id === m.terminal_id);
        const owner = t?.usuario_email || t?.created_by;
        if (owner !== ownerFilter) return false;
      }
      const ts = m.timestamp ? new Date(m.timestamp) : null;
      if (from && ts && ts < from) return false;
      if (to && ts && ts > to) return false;
      if (terminalFilter !== 'all' && m.terminal_id !== terminalFilter) return false;
      if (tipoFilter !== 'all' && m.tipo !== tipoFilter) return false;
      if (search) {
        const name = m.utilizador_nome || userMap[m.enrollid] || '';
        if (!name.toLowerCase().includes(search.toLowerCase()) && !String(m.enrollid).includes(search)) return false;
      }
      return true;
    });
  }, [marcacoes, dateFrom, dateTo, terminalFilter, tipoFilter, search, userMap, isAdmin, myTerminalIds, ownerFilter, terminals]);

  const stats = useMemo(() => ({
    total: filtered.length,
    entradas: filtered.filter(m => m.tipo === 'entrada').length,
    saidas: filtered.filter(m => m.tipo === 'saida').length,
    naoExportadas: filtered.filter(m => !m.exportado).length,
  }), [filtered]);

  const collectFromTerminal = async (terminal) => {
    const resp = await base44.functions.invoke('terminalControl', { terminal_id: terminal.id, action: 'getlogs' });
    const data = resp.data;
    if (data?.success && data.records?.length) {
      const toSave = data.records.map(r => ({
        terminal_id: terminal.id, terminal_nome: terminal.nome,
        enrollid: r.enrollid, utilizador_nome: userMap[r.enrollid] || '',
        timestamp: r.time || new Date().toISOString(),
        modo: r.mode === 1 ? 'fp' : r.mode === 3 ? 'card' : r.mode === 8 ? 'face' : r.mode === 15 ? 'pw' : String(r.mode),
        raw_mode: r.mode, tipo: 'desconhecido', local: terminal.local || '', exportado: false,
      }));
      await base44.entities.Marcacao.bulkCreate(toSave);
      return toSave.length;
    }
    return 0;
  };

  const handleCollectOne = async (terminal) => {
    setCollecting(terminal.id);
    try {
      const count = await collectFromTerminal(terminal);
      count > 0 ? toast.success(`${count} marcação(ões) de ${terminal.nome}`) : toast.info('Sem novas marcações');
      refetch();
    } catch (e) { toast.error(`Erro: ${e?.response?.data?.error || e.message}`); }
    finally { setCollecting(null); }
  };

  const handleCollectAll = async () => {
    setCollecting('all');
    let total = 0, errors = 0;
    for (const t of terminals) {
      try { total += await collectFromTerminal(t); }
      catch { errors++; }
    }
    setCollecting(null);
    refetch();
    errors === 0 ? toast.success(`${total} marcação(ões) recolhida(s) de ${terminals.length} terminal(is)`) : toast.error(`${total} OK / ${errors} erro(s)`);
  };

  const handleExportCSV = () => {
    const headers = ['Data/Hora', 'Terminal', 'ID', 'Utilizador', 'Tipo', 'Modo', 'Local', 'Exportado'];
    const rows = filtered.map(m => [
      m.timestamp ? format(new Date(m.timestamp), 'dd/MM/yyyy HH:mm:ss') : '',
      m.terminal_nome || '', m.enrollid, m.utilizador_nome || userMap[m.enrollid] || '',
      m.tipo || '', m.modo || '', m.local || '', m.exportado ? 'Sim' : 'Não',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `marcacoes_${dateFrom}_${dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 rounded-xl shrink-0">
              <ClipboardList className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Marcações</h1>
              <p className="text-xs text-slate-500">Registos de ponto dos terminais biométricos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Atualizar</span>
            </Button>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">CSV</span>
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: stats.total, colorIcon: 'text-blue-600', colorBg: 'bg-blue-100', icon: ClipboardList },
            { label: 'Entradas', value: stats.entradas, colorIcon: 'text-emerald-600', colorBg: 'bg-emerald-100', icon: User },
            { label: 'Saídas', value: stats.saidas, colorIcon: 'text-rose-600', colorBg: 'bg-rose-100', icon: User },
            { label: 'Por Exportar', value: stats.naoExportadas, colorIcon: 'text-amber-600', colorBg: 'bg-amber-100', icon: Upload },
          ].map(s => (
            <Card key={s.label} className="bg-white border-slate-200">
              <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.colorBg} shrink-0`}><s.icon className={`h-4 w-4 ${s.colorIcon}`} /></div>
                <div><p className="text-xs text-slate-500">{s.label}</p><p className="text-xl font-bold text-slate-800">{s.value}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recolher */}
        {terminals.length > 0 && (
          <Card className="bg-white border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-teal-600" /> Recolher Marcações
                </p>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs" onClick={handleCollectAll} disabled={collecting === 'all'}>
                  {collecting === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Recolher Todos os Terminais
                </Button>
              </div>
                      {/* Filters */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardContent className="p-3 sm:p-4 space-y-2">
            {/* Row 1: search + primary filters */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
              <div className="w-full sm:flex-1 sm:min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Nome, local, SN, IP, DNS, modelo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Tipo de conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="ip_local">IP Local</SelectItem>
                  <SelectItem value="ip_publico">IP Público</SelectItem>
                  <SelectItem value="dns">DNS/No-IP</SelectItem>
                  <SelectItem value="p2s">P2S VPN</SelectItem>
                  <SelectItem value="heartbeat">Heartbeat TCP</SelectItem>
                  <SelectItem value="adms_push">ADMS / Push</SelectItem>
                  <SelectItem value="sdk_tcp">SDK-TCP</SelectItem>
                  <SelectItem value="websocket_cloud">WebSocket Cloud</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs shrink-0"
                onClick={() => setShowExtraFilters(v => !v)}
              >
                <Search className="h-3.5 w-3.5" />
                {showExtraFilters ? 'Menos filtros' : 'Mais filtros'}
                {(fabricanteFilter !== 'all' || localFilter !== 'all' || userFilter !== 'all') && (
                  <span className="w-2 h-2 bg-blue-500 rounded-full" />
                )}
              </Button>
            </div>

            {/* Row 2: extra filters */}
            {showExtraFilters && (
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 pt-1 border-t border-slate-100">
                {/* Local */}
                <Select value={localFilter} onValueChange={setLocalFilter}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Local" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os locais</SelectItem>
                    {locaisDisponiveis.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>

                {/* Fabricante */}
                {fabricantes.length > 0 && (
                  <Select value={fabricanteFilter} onValueChange={setFabricanteFilter}>
                    <SelectTrigger className="w-full sm:w-[160px]">
                      <SelectValue placeholder="Fabricante" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os fabricantes</SelectItem>
                      {fabricantes.map(f => <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}

                {/* Utilizador (admin only) */}
                {isAdmin && (
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="h-9 w-full sm:w-auto rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">Todos os utilizadores</option>
                    {usuarios.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                )}

                {/* Clear extra filters */}
                {(fabricanteFilter !== 'all' || localFilter !== 'all' || userFilter !== 'all') && (
                  <Button variant="ghost" size="sm" className="h-9 text-xs text-slate-400" onClick={() => { setFabricanteFilter('all'); setLocalFilter('all'); setUserFilter('all'); }}>
                    Limpar
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
              <div className="flex flex-wrap gap-2">
                {terminals.map(t => (
                  <Button key={t.id} variant="outline" size="sm" disabled={!!collecting} onClick={() => handleCollectOne(t)}
                    className={cn('text-xs gap-1.5', t.status === 'online' ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500')}>
                    {collecting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {t.nome}
                    {t.status === 'online' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Utilizador ou ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-white" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-white" />
          <Select value={terminalFilter} onValueChange={setTerminalFilter}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Terminal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os terminais</SelectItem>
              {terminals.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
              <SelectItem value="desconhecido">Desconhecido</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && allOwners.length > 0 && (
            <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-slate-300 col-span-full sm:col-span-1">
              <option value="all">Todos os utilizadores</option>
              {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : (
          <Card className="bg-white border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">Data/Hora</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Terminal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Utilizador</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase hidden md:table-cell">Modo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase hidden lg:table-cell">Exportado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.slice(0, 300).map((m, i) => {
                    const nome = m.utilizador_nome || userMap[m.enrollid] || `ID:${m.enrollid}`;
                    const modoLabel = MODO_LABELS[m.modo] || MODO_LABELS[m.raw_mode] || m.modo || '—';
                    return (
                      <tr key={m.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{m.timestamp ? format(new Date(m.timestamp), 'dd/MM/yy HH:mm:ss') : '—'}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-medium text-slate-800 truncate max-w-[100px] lg:max-w-[140px]">{m.terminal_nome || '—'}</p>
                          {m.local && <p className="text-xs text-slate-400 truncate">{m.local}</p>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.enrollid}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-700 max-w-[120px] truncate">{nome}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell">{modoLabel}</td>
                        <td className="px-4 py-2.5"><Badge className={cn('text-xs', TIPO_COLORS[m.tipo] || TIPO_COLORS.desconhecido)}>{m.tipo || 'desconhecido'}</Badge></td>
                        <td className="px-4 py-2.5 hidden lg:table-cell">{m.exportado ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-slate-400">
                  <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>Sem marcações para o período selecionado</p>
                </div>
              )}
              {filtered.length > 300 && (
                <p className="text-center text-xs text-slate-400 py-3 border-t border-slate-100">A mostrar 300 de {filtered.length} registos. Refine o filtro de datas.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}