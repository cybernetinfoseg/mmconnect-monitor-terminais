import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Pencil, Trash2, Search, Upload, Download,
  CheckCircle2, XCircle, Loader2, Send, ChevronDown, ChevronUp,
  FileDown, FileUp, Zap, UserCheck, UserX, ArrowDownUp, ExternalLink
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ColaboradorForm from '@/components/colaboradores/ColaboradorForm';
import SyncPanel from '@/components/colaboradores/SyncPanel';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import useTenantContext from '@/hooks/useTenantContext';
import { resolvePermissions, ROLE_LABELS, ROLE_COLORS } from '@/components/auth/usePermissions.jsx';
import { Building2 } from 'lucide-react';

export default function Utilizadores() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [formData, setFormData] = useState({});
  const [sendingTo, setSendingTo] = useState(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendResults, setSendResults] = useState({});
  const [deletingFromTerminal, setDeletingFromTerminal] = useState(null);
  const [deletingFromAll, setDeletingFromAll] = useState(null);
  const [selectedTerminals, setSelectedTerminals] = useState([]);
  const [expandedUser, setExpandedUser] = useState(null);
  const [expandedOwnerFilter, setExpandedOwnerFilter] = useState({});
  const [importProgress, setImportProgress] = useState(null);
  const [filterDialogTerminalOwner, setFilterDialogTerminalOwner] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [showSync, setShowSync] = useState(false);
  const importRef = useRef();

  const queryClient = useQueryClient();
  const { currentUser, perms } = useTenantContext();

  const isAdmin = ['admin', 'super_admin'].includes(currentUser?.role);
  const { timezone: userTimezone } = useUserTimezone();

  const { data: appUsers = [] } = useQuery({
    queryKey: ['app-users-list'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser && isAdmin,
  });

  // Últimas marcações e ausências activas para enriquecer a listagem
  const { data: ultimasMarcacoes = [] } = useQuery({
    queryKey: ['ultimas-marcacoes-colabs'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 500),
    enabled: !!currentUser,
    refetchInterval: 60000,
  });

  const { data: ausenciasAtivas = [] } = useQuery({
    queryKey: ['ausencias-colabs-ativas'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 200),
    enabled: !!currentUser,
  });

  // Mapa enrollid → última marcação
  const ultimaMarcacaoMap = useMemo(() => {
    const m = {};
    [...ultimasMarcacoes].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(marc => {
      m[marc.enrollid] = marc;
    });
    return m;
  }, [ultimasMarcacoes]);

  // Mapa enrollid → ausência activa hoje
  const ausenciaAtivaMap = useMemo(() => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
    const m = {};
    ausenciasAtivas.forEach(a => {
      if (a.data_inicio <= hoje && a.data_fim >= hoje) m[a.enrollid] = a;
    });
    return m;
  }, [ausenciasAtivas, userTimezone]);

  const { data: allUsers = [], isLoading, refetch } = useQuery({
    queryKey: ['terminal-users', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('-created_date', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, '-created_date', 500);
    },
    enabled: !!currentUser,
  });

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-for-users', currentUser?.email, isAdmin],
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

  const allOwners = useMemo(() =>
    [...new Set(allUsers.map(u => u.owner_email).filter(Boolean))].sort(),
    [allUsers]
  );

  // ── Mutations ────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, owner_email: data.owner_email || currentUser?.email, terminais_ids: JSON.stringify(selectedTerminals) };
      if (editingUser) return base44.entities.TerminalUser.update(editingUser.id, payload);
      return base44.entities.TerminalUser.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['terminal-users']);
      setDialogOpen(false); setEditingUser(null); setFormData({}); setSelectedTerminals([]);
      toast.success(editingUser ? 'Colaborador atualizado' : 'Colaborador criado');
    },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TerminalUser.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['terminal-users']); toast.success('Colaborador eliminado'); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  // ── Terminal operations ───────────────────────────────────────────────────────

  const sendUserToTerminals = async (user, terminalIds) => {
    if (!terminalIds?.length) return {};
    const results = {};
    for (const tid of terminalIds) {
      try {
        const resp = await base44.functions.invoke('terminalControl', {
          terminal_id: tid, action: 'adduser',
          params: { enrollid: user.enrollid, name: user.nome, password: user.password || '', card: user.card || '', privilege: user.privilege || 0 },
        });
        results[tid] = { success: resp.data?.success, message: resp.data?.message || resp.data?.error };
      } catch (e) {
        results[tid] = { success: false, message: e?.response?.data?.error || e.message };
      }
    }
    return results;
  };

  const deleteUserFromTerminal = async (user, terminalId) => {
    setDeletingFromTerminal({ userId: user.id, terminalId });
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminalId, action: 'deleteuser', params: { enrollid: user.enrollid },
      });
      resp.data?.success ? toast.success('Removido do terminal') : toast.error(resp.data?.error || 'Erro ao remover');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message);
    }
    setDeletingFromTerminal(null);
  };

  const handleDeleteFromAll = async (user, terminalList) => {
    setDeletingFromAll(user.id);
    let ok = 0, fail = 0;
    for (const t of terminalList) {
      try {
        const resp = await base44.functions.invoke('terminalControl', { terminal_id: t.id, action: 'deleteuser', params: { enrollid: user.enrollid } });
        resp.data?.success ? ok++ : fail++;
      } catch { fail++; }
    }
    setDeletingFromAll(null);
    fail === 0 ? toast.success(`Removido de ${ok} terminal(is)`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  const handleSendOne = async (user, terminalIds) => {
    setSendingTo(user.id);
    const results = await sendUserToTerminals(user, terminalIds);
    setSendResults(prev => ({ ...prev, [user.id]: results }));
    setSendingTo(null);
    const ok = Object.values(results).filter(r => r.success).length;
    const fail = Object.values(results).filter(r => !r.success).length;
    fail === 0 ? toast.success(`Enviado para ${ok} terminal(is)`) : toast.error(`${ok} OK / ${fail} erro(s)`);
  };

  const handleSendAllToAll = async () => {
    if (!terminals.length) { toast.error('Sem terminais disponíveis'); return; }
    if (!filtered.length) { toast.error('Sem colaboradores para enviar'); return; }
    setSendingAll(true);
    let totalOk = 0, totalFail = 0;
    const terminalIds = terminals.map(t => t.id);
    for (const user of filtered) {
      const results = await sendUserToTerminals(user, terminalIds);
      totalOk += Object.values(results).filter(r => r.success).length;
      totalFail += Object.values(results).filter(r => !r.success).length;
    }
    setSendingAll(false);
    totalFail === 0 ? toast.success(`Todos enviados! ${totalOk} operações OK`) : toast.error(`${totalOk} OK / ${totalFail} erros`);
  };

  // ── CSV ───────────────────────────────────────────────────────────────────────

  const handleExportCSV = () => {
    const headers = ['enrollid', 'nome', 'email', 'telefone', 'departamento', 'cargo', 'numero_cracha', 'card', 'privilege', 'ativo', 'data_inicio', 'data_fim', 'grupo_acesso', 'observacoes', 'owner_email'];
    const rows = filtered.map(u => headers.map(h => u[h] ?? ''));
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'colaboradores.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) { toast.error('Ficheiro vazio ou inválido'); return; }
    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
    const rows = lines.slice(1).map(line => {
      const vals = line.split(sep);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim(); });
      return obj;
    });
    setImportProgress({ total: rows.length, done: 0 });
    let ok = 0;
    for (const row of rows) {
      if (!row.enrollid || !row.nome) continue;
      try {
        await base44.entities.TerminalUser.create({
          enrollid: Number(row.enrollid), nome: row.nome, email: row.email || '',
          telefone: row.telefone || '', departamento: row.departamento || '', cargo: row.cargo || '',
          numero_cracha: row.numero_cracha || '', card: row.card || '',
          privilege: Number(row.privilege) || 0, ativo: row.ativo === 'false' ? false : true,
          data_inicio: row.data_inicio || '', data_fim: row.data_fim || '',
          grupo_acesso: row.grupo_acesso || '', observacoes: row.observacoes || '',
          owner_email: row.owner_email || currentUser?.email, terminais_ids: '[]', bio_types: '[]',
        });
        ok++;
      } catch {}
      setImportProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }
    setImportProgress(null);
    queryClient.invalidateQueries(['terminal-users']);
    toast.success(`${ok} colaborador(es) importado(s)!`);
  };

  // ── Bulk by owner ─────────────────────────────────────────────────────────────

  const bulkOwnerTerminals = useMemo(() =>
    bulkOwner ? terminals.filter(t => t.usuario_email === bulkOwner || t.created_by === bulkOwner) : [],
    [terminals, bulkOwner]
  );
  const bulkOwnerUsers = useMemo(() =>
    bulkOwner ? allUsers.filter(u => u.owner_email === bulkOwner) : [],
    [allUsers, bulkOwner]
  );

  const handleBulkSendByOwner = async () => {
    if (!bulkOwner || !bulkOwnerUsers.length || !bulkOwnerTerminals.length) return;
    const terminalIds = bulkOwnerTerminals.map(t => t.id);
    const total = bulkOwnerUsers.length * terminalIds.length;
    setBulkSending(true); setBulkProgress({ done: 0, total, label: 'A enviar' });
    let ok = 0, fail = 0;
    for (const user of bulkOwnerUsers) {
      for (const tid of terminalIds) {
        try {
          const resp = await base44.functions.invoke('terminalControl', {
            terminal_id: tid, action: 'adduser',
            params: { enrollid: user.enrollid, name: user.nome, password: user.password || '', card: user.card || '', privilege: user.privilege || 0 },
          });
          resp.data?.success ? ok++ : fail++;
        } catch { fail++; }
        setBulkProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }
    setBulkSending(false); setBulkProgress(null);
    fail === 0 ? toast.success(`${ok} operações concluídas!`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  const handleBulkRemoveByOwner = async () => {
    if (!bulkOwner || !bulkOwnerUsers.length || !bulkOwnerTerminals.length) return;
    const terminalIds = bulkOwnerTerminals.map(t => t.id);
    const total = bulkOwnerUsers.length * terminalIds.length;
    setBulkRemoving(true); setBulkProgress({ done: 0, total, label: 'A remover' });
    let ok = 0, fail = 0;
    for (const user of bulkOwnerUsers) {
      for (const tid of terminalIds) {
        try {
          const resp = await base44.functions.invoke('terminalControl', { terminal_id: tid, action: 'deleteuser', params: { enrollid: user.enrollid } });
          resp.data?.success ? ok++ : fail++;
        } catch { fail++; }
        setBulkProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }
    }
    setBulkRemoving(false); setBulkProgress(null);
    fail === 0 ? toast.success(`${ok} remoções concluídas!`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = allUsers;
    if (isAdmin && ownerFilter !== 'all') list = list.filter(u => u.owner_email === ownerFilter);
    if (search) list = list.filter(u =>
      u.nome?.toLowerCase().includes(search.toLowerCase()) ||
      String(u.enrollid).includes(search) ||
      u.departamento?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.numero_cracha?.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [allUsers, search, ownerFilter, isAdmin]);

  const getVisibleTerminals = (userId) => {
    const selectedOwner = expandedOwnerFilter[userId] || '';
    if (!selectedOwner) return terminals;
    return terminals.filter(t => (t.usuario_email || t.created_by) === selectedOwner);
  };

  const filteredDialogTerminals = isAdmin && filterDialogTerminalOwner
    ? terminals.filter(t => t.usuario_email === filterDialogTerminalOwner || t.created_by === filterDialogTerminalOwner)
    : terminals;

  const handleNew = () => { setEditingUser(null); setFormData({ privilege: 0, ativo: true, bio_types: '[]' }); setSelectedTerminals([]); setFilterDialogTerminalOwner(''); setDialogOpen(true); };
  const handleEdit = (u) => {
    setEditingUser(u); setFormData(u); setFilterDialogTerminalOwner('');
    try { setSelectedTerminals(JSON.parse(u.terminais_ids || '[]')); } catch { setSelectedTerminals([]); }
    setDialogOpen(true);
  };

  // ── Render expanded panel ─────────────────────────────────────────────────────

  const renderExpandedPanel = (u, isMobile = false) => {
    const visibleTerminals = getVisibleTerminals(u.id);
    const sendResult = sendResults[u.id];
    const selectedOwnerVal = expandedOwnerFilter[u.id] || '';

    return (
      <div className={cn('space-y-3', isMobile ? 'mt-3 pt-3 border-t border-slate-100' : 'pt-3')}>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-slate-600">Enviar para terminal:</p>
          {isAdmin && (
            <Select value={selectedOwnerVal || 'all'} onValueChange={val => setExpandedOwnerFilter(prev => ({ ...prev, [u.id]: val === 'all' ? '' : val }))}>
              <SelectTrigger className="h-7 text-xs w-[200px]"><SelectValue placeholder="Todos os donos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os donos</SelectItem>
                {appUsers.map(au => <SelectItem key={au.email} value={au.email}>{au.full_name || au.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <span className="text-xs text-slate-400">{visibleTerminals.length} terminal(is)</span>
        </div>
        <div className={cn('grid gap-2', isMobile ? 'grid-cols-1' : 'grid-cols-3 xl:grid-cols-4')}>
          {visibleTerminals.map(t => {
            const res = sendResult?.[t.id];
            const isDeletingThis = deletingFromTerminal?.userId === u.id && deletingFromTerminal?.terminalId === t.id;
            return (
              <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{t.nome}</p>
                  <p className="text-xs text-slate-400 truncate">{t.local}</p>
                </div>
                <div className="flex items-center gap-1 ml-2 shrink-0">
                  {res && (res.success ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-400" title={res.message} />)}
                  <Button size="sm" className="h-6 px-1.5 bg-teal-600 hover:bg-teal-700" disabled={sendingTo === u.id} onClick={() => handleSendOne(u, [t.id])}>
                    {sendingTo === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 px-1.5 text-red-500 hover:bg-red-50 border-red-200" disabled={!!deletingFromTerminal} onClick={() => deleteUserFromTerminal(u, t.id)}>
                    {isDeletingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-700 gap-2 text-xs" disabled={sendingTo === u.id || !visibleTerminals.length} onClick={() => handleSendOne(u, visibleTerminals.map(t => t.id))}>
            {sendingTo === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Enviar para Todos ({visibleTerminals.length})
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-300 hover:bg-red-50 gap-2 text-xs" disabled={deletingFromAll === u.id || !visibleTerminals.length} onClick={() => handleDeleteFromAll(u, visibleTerminals)}>
            {deletingFromAll === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Eliminar de Todos
          </Button>
        </div>
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-100 rounded-xl shrink-0">
              <Users className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Colaboradores</h1>
              <p className="text-xs text-slate-500">{filtered.length} de {allUsers.length} colaborador(es) · Sincronização com terminais biométricos</p>
            </div>
            <div className="flex items-center gap-2">
              {!perms.isSuperAdmin && currentUser?.tenant_nome && (
                <Badge className="text-xs px-2 py-1 bg-blue-50 text-blue-700 border-blue-200">
                  <Building2 className="h-3 w-3 mr-1" />
                  {currentUser.tenant_nome}
                </Badge>
              )}
              <Badge className={cn('text-xs px-2 py-1', ROLE_COLORS[perms.role] || '')}>
                {ROLE_LABELS[perms.role] || perms.role}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowSync(!showSync)} className={cn('gap-1.5 text-xs', showSync && 'bg-teal-50 border-teal-300 text-teal-700')}>
              <ArrowDownUp className="h-3.5 w-3.5" /><span className="hidden sm:inline">Sincronizar</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0} className="gap-1.5 text-xs">
              <FileDown className="h-3.5 w-3.5" /><span className="hidden sm:inline">Exportar CSV</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} className="gap-1.5 text-xs">
              <FileUp className="h-3.5 w-3.5" /><span className="hidden sm:inline">Importar CSV</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSendAllToAll} disabled={sendingAll || !terminals.length || !filtered.length} className="gap-1.5 text-xs border-teal-300 text-teal-700 hover:bg-teal-50">
              {sendingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">Enviar Todos</span>
            </Button>
            <Button size="sm" onClick={handleNew} className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
            <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </div>
        </div>

        {/* Import progress */}
        {importProgress && (
          <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
            <p className="text-sm text-teal-700">A importar... {importProgress.done}/{importProgress.total}</p>
            <div className="flex-1 bg-teal-100 rounded-full h-2">
              <div className="bg-teal-600 h-2 rounded-full transition-all" style={{ width: `${importProgress.done / importProgress.total * 100}%` }} />
            </div>
          </div>
        )}

        {/* Sync Panel */}
        {showSync && (
          <SyncPanel
            terminals={terminals}
            allUsers={allUsers}
            currentUser={currentUser}
            onRefresh={() => queryClient.invalidateQueries(['terminal-users'])}
          />
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Pesquisar por nome, ID, departamento, crachá..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          {isAdmin && allOwners.length > 0 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="bg-white h-9 w-full sm:w-[220px] text-sm"><SelectValue placeholder="Filtrar por dono" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os donos</SelectItem>
                {appUsers.map(u => <SelectItem key={u.email} value={u.email}>{u.full_name || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Bulk Operations by Owner (admin only) */}
        {isAdmin && allOwners.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-slate-700">Operações em Massa por Dono</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-slate-500 mb-1 block">Selecionar Dono</label>
                <Select value={bulkOwner || 'none'} onValueChange={v => setBulkOwner(v === 'none' ? '' : v)} disabled={bulkSending || bulkRemoving}>
                  <SelectTrigger className="h-9 w-full text-sm"><SelectValue placeholder="— Escolher dono —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Escolher dono —</SelectItem>
                    {appUsers.map(u => {
                      const uT = terminals.filter(t => t.usuario_email === u.email || t.created_by === u.email);
                      const uU = allUsers.filter(x => x.owner_email === u.email);
                      return <SelectItem key={u.email} value={u.email}>{u.full_name || u.email} ({uU.length} colab., {uT.length} term.)</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              {bulkOwner && (
                <div className="flex gap-1.5 text-xs shrink-0">
                  <span className="bg-teal-50 text-teal-700 border border-teal-200 rounded px-2 py-1">{bulkOwnerUsers.length} colaboradores</span>
                  <span className="bg-slate-50 text-slate-600 border border-slate-200 rounded px-2 py-1">{bulkOwnerTerminals.length} terminais</span>
                </div>
              )}
              <div className="flex gap-2 shrink-0">
                <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs" disabled={!bulkOwner || !bulkOwnerUsers.length || !bulkOwnerTerminals.length || bulkSending || bulkRemoving} onClick={handleBulkSendByOwner}>
                  {bulkSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />} Enviar Todos
                </Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5 text-xs" disabled={!bulkOwner || !bulkOwnerUsers.length || !bulkOwnerTerminals.length || bulkSending || bulkRemoving} onClick={handleBulkRemoveByOwner}>
                  {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />} Remover Todos
                </Button>
              </div>
            </div>
            {bulkProgress && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{bulkProgress.label}... {bulkProgress.done}/{bulkProgress.total}</span>
                  <span>{Math.round(bulkProgress.done / bulkProgress.total * 100)}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={cn('h-1.5 rounded-full transition-all', bulkSending ? 'bg-teal-500' : 'bg-red-400')} style={{ width: `${bulkProgress.done / bulkProgress.total * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table / Cards */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : filtered.length === 0 ? (
          <Card className="bg-white border-slate-200">
            <CardContent className="py-16 text-center text-slate-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Nenhum colaborador encontrado</p>
              <Button onClick={handleNew} className="mt-4 bg-teal-600 hover:bg-teal-700 text-sm"><Plus className="h-4 w-4 mr-2" /> Adicionar colaborador</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="bg-white border-slate-200 hidden lg:block overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase w-16">ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Nome</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Departamento</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Biometria</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Terminais</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase hidden xl:table-cell">Última Marcação</th>
                    {isAdmin && <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Dono</th>}
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(u => {
                    const termIds = (() => { try { return JSON.parse(u.terminais_ids || '[]'); } catch { return []; } })();
                    const userTerminals = terminals.filter(t => termIds.includes(t.id));
                    const bioTypes = (() => { try { return JSON.parse(u.bio_types || '[]'); } catch { return []; } })();
                    const isExpanded = expandedUser === u.id;
                    return (
                      <React.Fragment key={u.id}>
                        <tr className={cn('hover:bg-slate-50 transition-colors', !u.ativo && 'opacity-50')}>
                          <td className="px-4 py-3">
                            <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold text-xs flex items-center justify-center">{u.enrollid}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {u.foto_url && <img src={u.foto_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 border border-teal-200" />}
                              <div>
                                <p className="font-semibold text-slate-800">{u.nome}</p>
                                {u.email && <p className="text-xs text-slate-400">{u.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            <p>{u.departamento || '—'}</p>
                            {u.cargo && <p className="text-slate-400">{u.cargo}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {bioTypes.includes(15) && <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">😊 Face</Badge>}
                              {(bioTypes.includes(1) || bioTypes.includes(2) || bioTypes.includes(3)) && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">🖐️ FP</Badge>}
                              {bioTypes.includes(11) && <Badge variant="outline" className="text-xs">💳</Badge>}
                              {bioTypes.includes(10) && <Badge variant="outline" className="text-xs">🔑</Badge>}
                              {u.privilege === 14 && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">Admin</Badge>}
                              {!u.ativo && <Badge variant="outline" className="text-xs text-slate-400">Inativo</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                                            <span className="text-xs text-slate-500">{userTerminals.length > 0 ? `${userTerminals.length} terminal(is)` : '—'}</span>
                                          </td>
                                          <td className="px-4 py-3 hidden xl:table-cell">
                                            {(() => {
                                              const ult = ultimaMarcacaoMap[u.enrollid];
                                              const aus = ausenciaAtivaMap[u.enrollid];
                                              const AUSENCIA_LABELS = { ferias: '🌴 Férias', baixa_medica: '🏥 Baixa', feriado: '🎉 Feriado', justificada: '📋 Just.', injustificada: '⚠️ Injust.' };
                                              return (
                                                <div className="space-y-0.5">
                                                  {aus && (
                                                    <Badge className="text-[10px] bg-orange-100 text-orange-700 border-orange-200 block w-fit">
                                                      {AUSENCIA_LABELS[aus.tipo] || aus.tipo}
                                                    </Badge>
                                                  )}
                                                  {ult ? (
                                                    <div>
                                                      <p className="text-[10px] font-mono text-slate-500">{new Date(ult.timestamp).toLocaleString('pt-PT', { timeZone: userTimezone || 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                                      <Badge className={`text-[9px] ${ult.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : ult.tipo === 'saida' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{ult.tipo}</Badge>
                                                    </div>
                                                  ) : <span className="text-[10px] text-slate-300">Sem registo</span>}
                                                </div>
                                              );
                                            })()}
                                          </td>
                                          {isAdmin && <td className="px-4 py-3 text-xs text-slate-400 max-w-[120px] truncate">{u.owner_email || '—'}</td>}
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-teal-600 hover:bg-teal-50" onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                                <Send className="h-3 w-3 mr-1" />{isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-1.5 text-blue-600 hover:bg-blue-50 gap-1" onClick={() => navigate(`/ColaboradorPerfil?enrollid=${u.enrollid}`)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => handleEdit(u)}><Pencil className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(u.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr><td colSpan={isAdmin ? 8 : 7} className="px-4 pb-4 bg-slate-50 border-b border-slate-200">{renderExpandedPanel(u, false)}</td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 lg:hidden">
              <AnimatePresence>
                {filtered.map(u => {
                  const termIds = (() => { try { return JSON.parse(u.terminais_ids || '[]'); } catch { return []; } })();
                  const userTerminals = terminals.filter(t => termIds.includes(t.id));
                  const bioTypes = (() => { try { return JSON.parse(u.bio_types || '[]'); } catch { return []; } })();
                  const isExpanded = expandedUser === u.id;
                  return (
                    <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <Card className={cn('bg-white border-slate-200', !u.ativo && 'opacity-60')}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {u.foto_url
                                ? <img src={u.foto_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0 border border-teal-200" />
                                : <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center shrink-0"><span className="text-teal-700 font-bold text-xs">{u.enrollid}</span></div>
                              }
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 text-sm">{u.nome}</p>
                                <p className="text-xs text-slate-400">{[u.departamento, u.cargo].filter(Boolean).join(' · ') || '—'}</p>
                                <div className="flex gap-1 mt-1.5 flex-wrap">
                                  {bioTypes.includes(15) && <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">😊</Badge>}
                                  {(bioTypes.includes(1) || bioTypes.includes(2) || bioTypes.includes(3)) && <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">🖐️</Badge>}
                                  {bioTypes.includes(11) && <Badge variant="outline" className="text-xs">💳</Badge>}
                                  {bioTypes.includes(10) && <Badge variant="outline" className="text-xs">🔑</Badge>}
                                  {userTerminals.length > 0 && <Badge className="text-xs bg-teal-50 text-teal-700 border-teal-200">{userTerminals.length} term.</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button size="sm" variant="outline" className="h-8 px-2 text-teal-600" onClick={() => setExpandedUser(isExpanded ? null : u.id)}>
                                <Send className="h-3 w-3" />{isExpanded ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50" onClick={() => navigate(`/ColaboradorPerfil?enrollid=${u.enrollid}`)}>
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => handleEdit(u)}><Pencil className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500 hover:bg-red-50" onClick={() => setDeleteId(u.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          {isExpanded && renderExpandedPanel(u, true)}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar Colaborador' : 'Novo Colaborador'}</DialogTitle>
          </DialogHeader>
          <ColaboradorForm
            formData={formData}
            setFormData={setFormData}
            terminals={terminals}
            selectedTerminals={selectedTerminals}
            setSelectedTerminals={setSelectedTerminals}
            filteredDialogTerminals={filteredDialogTerminals}
            isAdmin={isAdmin}
            appUsers={appUsers}
            filterDialogTerminalOwner={filterDialogTerminalOwner}
            setFilterDialogTerminalOwner={setFilterDialogTerminalOwner}
          />
          <div className="flex gap-2 pt-2 border-t border-slate-100 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1 bg-teal-600 hover:bg-teal-700" disabled={saveMutation.isPending || !formData.enrollid || !formData.nome} onClick={() => saveMutation.mutate(formData)}>
              {saveMutation.isPending ? 'A guardar...' : 'Guardar Colaborador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar colaborador?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente e não remove o colaborador dos terminais.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { deleteMutation.mutate(deleteId); setDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}