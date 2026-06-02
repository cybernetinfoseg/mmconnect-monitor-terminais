import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import {
  ClipboardList, Search, Download, RefreshCw,
  User, Loader2, Upload, CheckCircle2, XCircle, BarChart2
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { getModeInfo, getTimmyCapabilities } from '@/lib/timmyModels';
import RelatorioPorColaborador from '@/components/marcacoes/RelatorioPorColaborador';

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
  const [collectSearch, setCollectSearch] = useState('');
  const [collectTipo, setCollectTipo] = useState('all');
  const [collectStatus, setCollectStatus] = useState('all');
  const [collectLocal, setCollectLocal] = useState('all');
  const [collectFabricante, setCollectFabricante] = useState('all');
  const [collectUser, setCollectUser] = useState('all');

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

  // Converte raw_mode Timmy para string de modo e tipo de marcação
  const resolveMode = (rawMode, terminal) => {
    const cap = getTimmyCapabilities(terminal?.modelo);
    // modo string legível
    let modo = String(rawMode ?? '');
    if (rawMode >= 1 && rawMode <= 9) modo = 'fp';
    else if (rawMode === 10) modo = 'pw';
    else if (rawMode === 11) modo = 'card';
    else if (rawMode === 15) modo = 'face';
    else if (rawMode === 20) modo = 'face'; // face+fp → face
    return modo;
  };

  const collectFromTerminal = async (terminal) => {
    // TM-AI08 (face only) e outros: usar getnewlog que traz logs incrementais
    // Para terminais FP-only: getlogs traz todos; para face: getnewlog é mais eficiente
    const cap = getTimmyCapabilities(terminal?.modelo);
    const action = terminal.tipo_conexao === 'websocket_cloud' ? 'getlogs' : 'getlogs';
    const resp = await base44.functions.invoke('terminalControl', { terminal_id: terminal.id, action });
    const data = resp.data;
    if (data?.success && data.records?.length) {
      // Deduplicação: buscar marcações recentes deste terminal (últimas 2h) antes de guardar
      const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const existentes = await base44.entities.Marcacao.filter({ terminal_id: terminal.id }, '-timestamp', 2000).catch(() => []);
      const DEDUP_MS = 30000;
      const dedupSet = new Set();
      existentes.forEach(m => {
        if (m.timestamp) {
          const bucket = Math.floor(new Date(m.timestamp).getTime() / DEDUP_MS);
          dedupSet.add(`${m.enrollid}|${bucket}`);
        }
      });

      const toSave = data.records.map(r => {
        const rawMode = r.mode ?? r.Mode ?? r.verifyType ?? r.verifytype;
        const modo = resolveMode(rawMode, terminal);
        // Determinar tipo entrada/saída
        let tipo = 'desconhecido';
        const inoutVal = r.inout ?? r.InOutStatus;
        if (inoutVal === 0 || inoutVal === 'entrada') tipo = 'entrada';
        else if (inoutVal === 1 || inoutVal === 'saida') tipo = 'saida';
        // Converter timestamp "YYYY-MM-DD HH:MM:SS" → ISO 8601
        const rawTs = r.time ?? r.Time ?? r.timestamp ?? '';
        let ts = rawTs;
        if (rawTs && rawTs.includes(' ') && rawTs.includes('-')) {
          ts = rawTs.replace(' ', 'T');
        }
        const enrollid = r.enrollid ?? r.EnrollNumber ?? r.id;
        return {
          terminal_id: terminal.id, terminal_nome: terminal.nome,
          enrollid: Number(enrollid) || 0,
          utilizador_nome: userMap[enrollid] || '',
          timestamp: ts || new Date().toISOString(),
          modo, raw_mode: rawMode != null ? Number(rawMode) : null, tipo,
          local: terminal.local || '', exportado: false,
        };
      });
      // Filtrar duplicados
      const novas = toSave.filter(r => {
        if (!r.timestamp) return false;
        const bucket = Math.floor(new Date(r.timestamp).getTime() / DEDUP_MS);
        const key = `${r.enrollid}|${bucket}`;
        if (dedupSet.has(key)) return false;
        dedupSet.add(key);
        return true;
      });
      if (novas.length > 0) await base44.entities.Marcacao.bulkCreate(novas);
      return novas.length;
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

  const filteredCollectTerminals = useMemo(() => terminals.filter(t => {
    if (collectTipo !== 'all' && t.tipo_conexao !== collectTipo) return false;
    if (collectStatus !== 'all' && t.status !== collectStatus) return false;
    if (collectLocal !== 'all' && t.local !== collectLocal) return false;
    if (collectFabricante !== 'all' && t.fabricante !== collectFabricante) return false;
    if (collectUser !== 'all' && (t.usuario_email || t.created_by) !== collectUser) return false;
    if (collectSearch) {
      const q = collectSearch.toLowerCase();
      return t.nome?.toLowerCase().includes(q) || t.local?.toLowerCase().includes(q) ||
        t.numero_serie?.toLowerCase().includes(q) || t.ip_local?.toLowerCase().includes(q) ||
        t.ip_publico?.toLowerCase().includes(q) || String(t.porta || '').includes(q);
    }
    return true;
  }), [terminals, collectTipo, collectStatus, collectLocal, collectFabricante, collectUser, collectSearch]);

  const handleCollectAll = async () => {
    setCollecting('all');
    let total = 0, errors = 0;
    for (const t of filteredCollectTerminals) {
      try { total += await collectFromTerminal(t); }
      catch { errors++; }
    }
    setCollecting(null);
    refetch();
    errors === 0 ? toast.success(`${total} marcação(ões) recolhida(s) de ${filteredCollectTerminals.length} terminal(is)`) : toast.error(`${total} OK / ${errors} erro(s)`);
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
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-teal-600" /> Recolher Marcações
                </p>
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs" onClick={handleCollectAll} disabled={collecting === 'all' || filteredCollectTerminals.length === 0}>
                  {collecting === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {filteredCollectTerminals.length < terminals.length
                    ? `Recolher ${filteredCollectTerminals.length} Terminal(is)`
                    : 'Recolher Todos os Terminais'}
                </Button>
              </div>
              {/* Filtros de terminal */}
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Nome, SN, IP, porta..."
                    value={collectSearch}
                    onChange={e => setCollectSearch(e.target.value)}
                    className="pl-8 h-8 text-xs w-[180px]"
                  />
                </div>
                <Select value={collectTipo} onValueChange={setCollectTipo}>
                  <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
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
                <Select value={collectStatus} onValueChange={setCollectStatus}>
                  <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Todos os statu" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="offline">Offline</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={collectLocal} onValueChange={setCollectLocal}>
                  <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Todos os locais" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os locais</SelectItem>
                    {[...new Set(terminals.map(t => t.local).filter(Boolean))].sort().map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {[...new Set(terminals.map(t => t.fabricante).filter(Boolean))].length > 0 && (
                  <Select value={collectFabricante} onValueChange={setCollectFabricante}>
                    <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Todos os fabrican" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os fabricantes</SelectItem>
                      {[...new Set(terminals.map(t => t.fabricante).filter(Boolean))].sort().map(f => (
                        <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {isAdmin && (
                  <Select value={collectUser} onValueChange={setCollectUser}>
                    <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue placeholder="Todos os utilizadores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os utilizadores</SelectItem>
                      {[...new Set(terminals.map(t => t.usuario_email || t.created_by).filter(Boolean))].sort().map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {(collectSearch || collectTipo !== 'all' || collectStatus !== 'all' || collectLocal !== 'all' || collectFabricante !== 'all' || collectUser !== 'all') && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-400 px-2"
                    onClick={() => { setCollectSearch(''); setCollectTipo('all'); setCollectStatus('all'); setCollectLocal('all'); setCollectFabricante('all'); setCollectUser('all'); }}>
                    Limpar
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredCollectTerminals.map(t => {
                  const cap = getTimmyCapabilities(t.modelo);
                  const isTimmy = t.tipo_conexao === 'websocket_cloud';
                  return (
                    <Button key={t.id} variant="outline" size="sm" disabled={!!collecting} onClick={() => handleCollectOne(t)}
                      className={cn('text-xs gap-1.5 flex-col h-auto py-1.5 px-2.5 items-start', t.status === 'online' ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500')}>
                      <div className="flex items-center gap-1.5">
                        {collecting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        <span className="font-medium">{t.nome}</span>
                        {t.status === 'online' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                      </div>
                      {isTimmy && (
                        <span className="text-slate-400 text-[10px] font-normal">{cap.icon} {cap.name !== 'Timmy Genérico' ? cap.name : cap.description}</span>
                      )}
                    </Button>
                  );
                })}
               </div>
            </CardContent>
          </Card>
        )}

        {/* Main content tabs */}
        <Tabs defaultValue="lista">
          <TabsList className="mb-2">
            <TabsTrigger value="lista" className="gap-1.5 text-xs"><ClipboardList className="h-3.5 w-3.5" />Lista</TabsTrigger>
            <TabsTrigger value="colaboradores" className="gap-1.5 text-xs"><BarChart2 className="h-3.5 w-3.5" />Por Colaborador</TabsTrigger>
          </TabsList>

          <TabsContent value="colaboradores">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <RelatorioPorColaborador
                marcacoes={filtered}
                userMap={userMap}
                dateFrom={dateFrom}
                dateTo={dateTo}
              />
            </div>
          </TabsContent>

          <TabsContent value="lista">

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
                    const modeInfo = getModeInfo(m.modo, m.raw_mode);
                    const terminal = terminals.find(t => t.id === m.terminal_id);
                    const cap = terminal ? getTimmyCapabilities(terminal.modelo) : null;
                    return (
                      <tr key={m.id || i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{m.timestamp ? format(new Date(m.timestamp), 'dd/MM/yy HH:mm:ss') : '—'}</td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs font-medium text-slate-800 truncate max-w-[100px] lg:max-w-[160px]">{m.terminal_nome || '—'}</p>
                          {m.local && <p className="text-xs text-slate-400 truncate">{m.local}</p>}
                          {cap && cap.name !== 'Timmy Genérico' && (
                            <p className="text-xs text-slate-300 truncate hidden lg:block">{cap.icon} {cap.name}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.enrollid}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-slate-700 max-w-[120px] truncate">{nome}</td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <Badge className={cn('text-xs', modeInfo.color)}>
                            {modeInfo.icon} {modeInfo.label}
                          </Badge>
                        </td>
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
          </TabsContent>
        </Tabs>

      </div>
    </div>
  );
}