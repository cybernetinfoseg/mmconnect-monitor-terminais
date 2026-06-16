import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { cn } from '@/lib/utils';
import { addDays, differenceInDays, parseISO, format, differenceInYears } from 'date-fns';

// Icons
import {
  Users, FileText, CalendarDays, TrendingUp, AlertTriangle,
  Clock, UserCheck, Archive, Banknote, Building2,
  CalendarOff, Fingerprint, LayoutDashboard, ExternalLink,
  Plus, Search, Pencil, Trash2, Loader2, RefreshCw, Download,
  Upload, CheckCircle2, XCircle, BarChart2, CalendarClock,
  LayoutGrid, TableProperties, Sun, Monitor,
  ArrowUpDown, FileSpreadsheet, FileUp, FileDown
} from 'lucide-react';

// UI
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

// Sub-components
import ColaboradorRHForm from '@/components/rh/ColaboradorRHForm';
import PresencaCard from '@/components/presenca/PresencaCard';
import EscalaTrabalho from '@/components/horarios/EscalaTrabalho';
import RelatorioPorColaborador from '@/components/marcacoes/RelatorioPorColaborador';
import TabHorasExtra from '@/components/rh/tabs/TabHorasExtra';
import TabBancoHoras from '@/components/rh/tabs/TabBancoHoras';
import TabPayroll from '@/components/rh/tabs/TabPayroll';
import TabContratos from '@/components/rh/tabs/TabContratos';
import TabBaixasJustificacoes from '@/components/rh/tabs/TabBaixasJustificacoes';
import TabEnvioTerminais from '@/components/rh/tabs/TabEnvioTerminais';

import FeriasTab from '@/components/rh/FeriasTab';

import { calcularDia, fmtMin } from '@/lib/calculoHoras';
import { getModeInfo, getTimmyCapabilities } from '@/lib/timmyModels';
import { getDay, eachDayOfInterval, isWeekend, addMonths, subMonths,
  startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import { subDays } from 'date-fns';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TURNO_CORES = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

const TIPO_AUSENCIA_LABELS = { ferias: '🌴 Férias', baixa_medica: '🏥 Baixa Médica', feriado: '🎉 Feriado', justificada: '📋 Justificada', injustificada: '⚠️ Injustificada' };
const TIPO_AUSENCIA_COLORS = {
  ferias: 'bg-blue-100 text-blue-700 border-blue-200',
  baixa_medica: 'bg-rose-100 text-rose-700 border-rose-200',
  feriado: 'bg-amber-100 text-amber-700 border-amber-200',
  justificada: 'bg-slate-100 text-slate-600 border-slate-200',
  injustificada: 'bg-orange-100 text-orange-700 border-orange-200',
};

const ESTADO_FERIAS_CFG = {
  pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-red-100 text-red-700 border-red-200' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

const STATUS_PONTO = {
  presente:  { label: 'Presente',  color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2, dot: 'bg-emerald-500' },
  atrasado:  { label: 'Atrasado',  color: 'bg-amber-100 text-amber-700 border-amber-200',       icon: Clock,        dot: 'bg-amber-400' },
  faltou:    { label: 'Faltou',    color: 'bg-rose-100 text-rose-700 border-rose-200',          icon: XCircle,      dot: 'bg-rose-500' },
  ausencia:  { label: 'Ausência',  color: 'bg-blue-100 text-blue-700 border-blue-200',          icon: CalendarDays, dot: 'bg-blue-400' },
  folga:     { label: 'Folga',     color: 'bg-slate-100 text-slate-600 border-slate-200',       icon: CalendarDays, dot: 'bg-slate-400' },
};

const TIPO_MARCACAO_COLORS = { entrada: 'bg-emerald-100 text-emerald-700 border-emerald-200', saida: 'bg-rose-100 text-rose-700 border-rose-200', desconhecido: 'bg-slate-100 text-slate-600 border-slate-200' };

function parseDias(str) { try { return JSON.parse(str || '[]'); } catch { return []; } }
function fmtHora(ts) { if (!ts) return '—'; const raw = ts.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, ''); const d = new Date(raw); if (isNaN(d.getTime())) return ts; return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }); }
function fmtDataHora(ts) { if (!ts) return '—'; const raw = ts.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, ''); const d = new Date(raw); if (isNaN(d.getTime())) return ts; return d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function calcDiasUteis(inicio, fim) {
  if (!inicio || !fim) return 0;
  try { return eachDayOfInterval({ start: parseISO(inicio), end: parseISO(fim) }).filter(d => !isWeekend(d)).length; }
  catch { return 0; }
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
const TABS = [
  { key: 'overview',     label: 'Visão Geral',        icon: LayoutDashboard },
  { key: 'colab',        label: 'Colaboradores',       icon: Users },
  { key: 'ponto',        label: 'Ponto & Presença',    icon: Fingerprint },
  { key: 'horarios',     label: 'Horários & Turnos',   icon: CalendarClock },
  { key: 'ausencias',    label: 'Ausências',           icon: CalendarOff },
  { key: 'ferias',       label: 'Férias',              icon: CalendarDays },
  { key: 'horas_extra',  label: 'Horas Extra',         icon: TrendingUp },
  { key: 'banco_horas',  label: 'Banco de Horas',      icon: Archive },
  { key: 'baixas',       label: 'Baixas & Faltas',     icon: AlertTriangle },
  { key: 'contratos',    label: 'Contratos',           icon: FileText },
  { key: 'payroll',      label: 'Payroll',             icon: Banknote },
  { key: 'terminais',   label: 'Envio p/ Terminais',  icon: Monitor },
];

export default function RH() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [currentUser, setCurrentUser] = useState(null);
  const { timezone: userTimezone } = useUserTimezone();
  const queryClient = useQueryClient();

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isAdmin = currentUser?.role === 'admin';
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });

  // ── Shared data ──────────────────────────────
  const { data: colaboradores = [], isLoading: loadingColab } = useQuery({
    queryKey: ['colaboradores'],
    queryFn: () => base44.entities.Colaborador.list('-data_admissao', 500),
    enabled: !!currentUser,
  });
  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });
  const { data: contratos = [] } = useQuery({
    queryKey: ['contratos-rh'],
    queryFn: () => base44.entities.Contrato.list('-data_inicio', 500),
    enabled: !!currentUser,
  });
  const { data: pedidosFerias = [] } = useQuery({
    queryKey: ['pedidos-ferias'],
    queryFn: () => base44.entities.PedidoFerias.list('-created_date', 500),
    enabled: !!currentUser,
  });
  const { data: ausencias = [] } = useQuery({
    queryKey: ['ausencias'],
    queryFn: () => base44.entities.AusenciaFalta.list('-data_inicio', 300),
    enabled: !!currentUser,
  });
  const { data: terminalUsers = [] } = useQuery({
    queryKey: ['terminal-users-rh', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('nome', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500);
    },
    enabled: !!currentUser,
  });
  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-rh', currentUser?.email, isAdmin],
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
  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos-ferias', new Date().getFullYear()],
    queryFn: () => base44.entities.SaldoFerias.filter({ ano: new Date().getFullYear() }, 'colaborador_nome', 200),
    enabled: !!currentUser,
  });

  const horarioMap = useMemo(() => { const m = {}; horarios.forEach(h => { m[h.id] = h; }); return m; }, [horarios]);
  const userMap = useMemo(() => { const m = {}; terminalUsers.forEach(u => { m[u.enrollid] = u; }); return m; }, [terminalUsers]);
  const terminalUserMap = useMemo(() => { const m = {}; terminalUsers.forEach(u => { m[u.enrollid] = u; }); return m; }, [terminalUsers]);
  const myTerminalIds = useMemo(() => new Set(terminals.map(t => t.id)), [terminals]);

  // ── Overview stats ──────────────────────────
  const hoje_date = new Date();
  const em30Dias = addDays(hoje_date, 30);
  const anoAtual = hoje_date.getFullYear();
  const ativos = colaboradores.filter(c => c.ativo !== false);
  const inativos = colaboradores.filter(c => c.ativo === false);
  const contratosAtivos = contratos.filter(c => c.estado === 'ativo');
  const contratosAExpirar = contratosAtivos.filter(c => {
    if (!c.data_fim) return false;
    const fim = parseISO(c.data_fim);
    return fim >= hoje_date && fim <= em30Dias;
  });
  const feriasPendentes = pedidosFerias.filter(p => p.estado === 'pendente');
  const ausenciasAtivas = ausencias.filter(a => a.data_fim >= hoje);

  // ── Colaboradores tab state ──────────────────
  const [colSearch, setColSearch] = useState('');
  const [colDepFilter, setColDepFilter] = useState('all');
  const [colDialog, setColDialog] = useState(false);
  const [colEditingId, setColEditingId] = useState(null);
  const [colFormData, setColFormData] = useState({});
  const [colDeleteId, setColDeleteId] = useState(null);

  const syncColabToTerminal = async (colData) => {
    const enrollid = Number(colData.enrollid);
    if (!enrollid) return;
    const timmyTerminals = terminals.filter(t => t.marca?.toLowerCase().includes('timmy') && t.status === 'online');
    if (timmyTerminals.length === 0) return;
    for (const t of timmyTerminals) {
      try {
        await base44.functions.invoke('terminalControl', {
          terminal_id: t.id,
          action: 'setuser',
          enrollid,
          nome: colData.nome,
          card: colData.card || '',
          password: colData.password || '',
          privilege: colData.privilege ?? 0,
        });
      } catch {}
    }
  };

  const colSaveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = { ...data, owner_email: data.owner_email || currentUser?.email };
      if (colEditingId) return base44.entities.Colaborador.update(colEditingId, payload);
      return base44.entities.Colaborador.create(payload);
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries(['colaboradores']);
      setColDialog(false); setColEditingId(null); setColFormData({});
      toast.success(colEditingId ? 'Ficha atualizada' : 'Colaborador criado');
      await syncColabToTerminal(colFormData);
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });
  const colDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Colaborador.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['colaboradores']); toast.success('Colaborador eliminado'); },
  });

  const handleExportColabCSV = () => {
    const headers = ['Nome', 'N\u00ba Colaborador', 'EnrollID', 'Departamento', 'Cargo', 'Email', 'Telem\u00f3vel', 'Data Admiss\u00e3o', 'Ativo'];
    const rows = colaboradores.map(c => [
      c.nome || '', c.numero_colaborador || '', c.enrollid || '',
      c.departamento || '', c.cargo || '', c.email || '', c.telemovel || '',
      c.data_admissao || '', c.ativo !== false ? 'Sim' : 'N\u00e3o',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'colaboradores_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  const handleImportColabCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV vazio'); return; }
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      let created = 0;
      for (let i = 1; i < lines.length; i++) {
        try {
          const vals = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
          const row = {};
          headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
          if (!row['Nome']) continue;
          await base44.entities.Colaborador.create({
            nome: row['Nome'],
            numero_colaborador: row['N\u00ba Colaborador'] || '',
            enrollid: Number(row['EnrollID']) || 0,
            departamento: row['Departamento'] || '',
            cargo: row['Cargo'] || '',
            email: row['Email'] || '',
            telemovel: row['Telem\u00f3vel'] || '',
            data_admissao: row['Data Admiss\u00e3o'] || '',
            ativo: row['Ativo'] !== 'N\u00e3o',
          });
          created++;
        } catch { }
      }
      queryClient.invalidateQueries(['colaboradores']);
      toast.success(created + ' colaborador(es) importados');
    } catch { toast.error('Erro ao ler CSV'); }
    e.target.value = '';
  };

  const departamentos = [...new Set(colaboradores.map(c => c.departamento).filter(Boolean))].sort();
  const colFiltered = colaboradores.filter(c => {
    const matchSearch = !colSearch ||
      c.nome?.toLowerCase().includes(colSearch.toLowerCase()) ||
      c.numero_colaborador?.toLowerCase().includes(colSearch.toLowerCase()) ||
      c.cargo?.toLowerCase().includes(colSearch.toLowerCase()) ||
      String(c.enrollid || '').includes(colSearch);
    return matchSearch && (colDepFilter === 'all' || c.departamento === colDepFilter);
  });

  // ── Ponto tab state ──────────────────────────
  const [pontoTab, setPontoTab] = useState('presenca');
  const [presSearch, setPresSearch] = useState('');
  const [marcSearch, setMarcSearch] = useState('');
  const [marcTerminal, setMarcTerminal] = useState('all');
  const [marcTipo, setMarcTipo] = useState('all');
  const [marcFrom, setMarcFrom] = useState(format(subDays(hoje_date, 7), 'yyyy-MM-dd'));
  const [marcTo, setMarcTo] = useState(format(hoje_date, 'yyyy-MM-dd'));
  const [collecting, setCollecting] = useState(null);
  const [selectedDate, setSelectedDate] = useState(hoje);
  const [pontoFiltroStatus, setPontoFiltroStatus] = useState('todos');
  const [pontoSearch, setPontoSearch] = useState('');

  // Marcação edit dialog state
  const [marcEditDialog, setMarcEditDialog] = useState(false);
  const [marcEditData, setMarcEditData] = useState(null);
  const [marcDeleteId, setMarcDeleteId] = useState(null);

  const marcEditMutation = useMutation({
    mutationFn: (data) => base44.entities.Marcacao.update(marcEditData?.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['marcacoes-rh']);
      setMarcEditDialog(false); setMarcEditData(null);
      toast.success('Marcação atualizada');
    },
    onError: e => toast.error(`Erro: ${e.message}`),
  });
  const marcDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Marcacao.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['marcacoes-rh']);
      queryClient.invalidateQueries(['movimentos_acesso']);
      setMarcDeleteId(null);
      toast.success('Marcação eliminada');
    },
  });

  const { data: marcacoes = [], isLoading: loadingMarc, refetch: refetchMarc, dataUpdatedAt: marcUpdatedAt } = useQuery({
    queryKey: ['marcacoes-rh'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 2000),
    enabled: !!currentUser,
    refetchInterval: 30000,
  });
  const { data: escalaHoje = [] } = useQuery({
    queryKey: ['escala-hoje-rh'],
    queryFn: () => base44.entities.EscalaDia.filter({ data: hoje }, '-created_date', 500),
    enabled: !!currentUser,
    refetchInterval: 60000,
  });
  const { data: escalasDia = [] } = useQuery({
    queryKey: ['ponto-escala', selectedDate],
    queryFn: () => base44.entities.EscalaDia.filter({ data: selectedDate }, '-created_date', 500),
    enabled: !!currentUser,
  });

  const ausenciaMap = useMemo(() => {
    const m = {};
    ausencias.forEach(a => { if (a.data_inicio <= hoje && a.data_fim >= hoje) m[a.enrollid] = a; });
    return m;
  }, [ausencias, hoje]);

  const escalaHojeMap = useMemo(() => { const m = {}; escalaHoje.forEach(e => { m[e.colaborador_id] = e; }); return m; }, [escalaHoje]);

  // presença em tempo real
  const presencaStatus = useMemo(() => {
    const marcoesHoje = marcacoes.filter(m => {
      if (!m.timestamp) return false;
      if (!isAdmin && !myTerminalIds.has(m.terminal_id)) return false;
      return new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' }) === hoje;
    });
    const porColab = {};
    marcoesHoje.forEach(m => {
      if (!porColab[m.enrollid]) porColab[m.enrollid] = [];
      porColab[m.enrollid].push(m);
    });
    return Object.entries(porColab).map(([enrollidStr, mlist]) => {
      const enrollid = Number(enrollidStr);
      const userInfo = userMap[enrollid];
      const sorted = [...mlist].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const ultima = sorted[sorted.length - 1];
      const primeira = sorted[0];
      return {
        enrollid,
        nome: ultima.utilizador_nome || userInfo?.nome || `ID:${enrollid}`,
        departamento: userInfo?.departamento || '',
        cargo: userInfo?.cargo || '',
        horario_id: userInfo?.horario_id || null,
        dentro: ultima.tipo === 'entrada',
        ultimaMarcacao: ultima, primeiraMarcacao: primeira, marcacoesHoje: sorted,
        terminal_nome: ultima.terminal_nome, local: ultima.local,
      };
    }).sort((a, b) => { if (a.dentro && !b.dentro) return -1; if (!a.dentro && b.dentro) return 1; return a.nome.localeCompare(b.nome); });
  }, [marcacoes, userMap, myTerminalIds, isAdmin, userTimezone, hoje]);

  const presFiltered = useMemo(() => {
    if (!presSearch.trim()) return presencaStatus;
    const q = presSearch.toLowerCase();
    return presencaStatus.filter(p => p.nome.toLowerCase().includes(q) || String(p.enrollid).includes(q));
  }, [presencaStatus, presSearch]);

  const ausentesNaoMarcaram = useMemo(() => {
    const dowHoje = getDay(hoje_date);
    const enrollidsComMarcacao = new Set(presencaStatus.map(p => p.enrollid));
    return terminalUsers.filter(u => {
      if (!u.ativo) return false;
      if (enrollidsComMarcacao.has(u.enrollid)) return false;
      if (ausenciaMap[u.enrollid]) return false;
      const escala = escalaHojeMap[u.id];
      if (escala) {
        if (['folga', 'ferias', 'feriado'].includes(escala.tipo)) return false;
        if (escala.tipo === 'normal' && escala.horario_id) {
          const h = horarioMap[escala.horario_id];
          if (h) { const dias = parseDias(h.dias_semana); return dias.length === 0 || dias.includes(dowHoje); }
        }
      }
      if (!u.horario_id) return false;
      const h = horarioMap[u.horario_id];
      if (!h) return false;
      const dias = parseDias(h.dias_semana);
      return dias.length === 0 || dias.includes(dowHoje);
    });
  }, [terminalUsers, presencaStatus, ausenciaMap, escalaHojeMap, horarioMap]);

  // marcações lista
  const marcacoesFiltered = useMemo(() => {
    const from = marcFrom ? new Date(marcFrom + 'T00:00:00') : null;
    const to = marcTo ? new Date(marcTo + 'T23:59:59') : null;
    return marcacoes.filter(m => {
      if (!isAdmin && !myTerminalIds.has(m.terminal_id)) return false;
      const ts = m.timestamp ? new Date(m.timestamp) : null;
      if (from && ts && ts < from) return false;
      if (to && ts && ts > to) return false;
      if (marcTerminal !== 'all' && m.terminal_id !== marcTerminal) return false;
      if (marcTipo !== 'all' && m.tipo !== marcTipo) return false;
      if (marcSearch) {
        const name = m.utilizador_nome || userMap[m.enrollid] || '';
        if (!name.toLowerCase().includes(marcSearch.toLowerCase()) && !String(m.enrollid).includes(marcSearch)) return false;
      }
      return true;
    });
  }, [marcacoes, marcFrom, marcTo, marcTerminal, marcTipo, marcSearch, userMap, isAdmin, myTerminalIds]);

  const collectFromTerminal = async (terminal) => {
    const resp = await base44.functions.invoke('terminalControl', { terminal_id: terminal.id, action: 'getlogs' });
    const data = resp.data;
    if (data?.success && data.records?.length) {
      const existentes = await base44.entities.Marcacao.filter({ terminal_id: terminal.id }, '-timestamp', 2000).catch(() => []);
      const DEDUP_MS = 30000;
      const dedupSet = new Set();
      existentes.forEach(m => { if (m.timestamp) { const b = Math.floor(new Date(m.timestamp).getTime() / DEDUP_MS); dedupSet.add(`${m.enrollid}|${b}`); } });
      const toSave = data.records.map(r => {
         const rawMode = r.mode ?? r.Mode ?? r.verifyType ?? r.verifytype;
         let modo = String(rawMode ?? '');
         if (rawMode >= 1 && rawMode <= 9) modo = 'fp'; else if (rawMode === 10) modo = 'pw'; else if (rawMode === 11) modo = 'card'; else if (rawMode === 15 || rawMode === 20) modo = 'face';
         const rawTs = r.time ?? r.Time ?? r.timestamp ?? '';
         let ts = rawTs;
         if (rawTs && rawTs.includes(' ') && rawTs.includes('-')) ts = rawTs.replace(' ', 'T');
         if (!ts) return null;
         const enrollid = r.enrollid ?? r.EnrollNumber ?? r.id;
         let tipo = 'desconhecido';
         const inoutVal = r.inout ?? r.InOutStatus;
         if (inoutVal === 0 || inoutVal === 'entrada') tipo = 'entrada';
         else if (inoutVal === 1 || inoutVal === 'saida') tipo = 'saida';
         else if (ts) { try { const dt = new Date(ts.includes('T') ? ts : ts + 'T00:00:00'); const hora = dt.getHours(); if (hora >= 7 && hora <= 12) tipo = 'entrada'; else if (hora >= 16 && hora <= 19) tipo = 'saida'; } catch { } }
         return { terminal_id: terminal.id, terminal_nome: terminal.nome, enrollid: Number(enrollid) || 0, utilizador_nome: userMap[enrollid] || '', timestamp: ts, modo, raw_mode: rawMode != null ? Number(rawMode) : null, tipo, local: terminal.local || '', exportado: false };
       }).filter(Boolean);
      const novas = toSave.filter(r => { if (!r.timestamp) return false; const b = Math.floor(new Date(r.timestamp).getTime() / DEDUP_MS); const k = `${r.enrollid}|${b}`; if (dedupSet.has(k)) return false; dedupSet.add(k); return true; });
      if (novas.length > 0) await base44.entities.Marcacao.bulkCreate(novas);
      return novas.length;
    }
    return 0;
  };

  const handleCollectOne = async (terminal) => {
    setCollecting(terminal.id);
    try { const count = await collectFromTerminal(terminal); count > 0 ? toast.success(`${count} marcação(ões) de ${terminal.nome}`) : toast.info('Sem novas marcações'); refetchMarc(); }
    catch (e) { toast.error(`Erro: ${e?.response?.data?.error || e.message}`); }
    finally { setCollecting(null); }
  };

  const handleExportMarcacoesCSV = () => {
    const headers = ['Data/Hora', 'Terminal', 'ID', 'Utilizador', 'Tipo', 'Modo'];
    const rows = marcacoesFiltered.map(m => [
      fmtDataHora(m.timestamp),
      m.terminal_nome || '', m.enrollid, m.utilizador_nome || userMap[m.enrollid] || '', m.tipo || '', m.modo || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `marcacoes_${marcFrom}_${marcTo}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado!');
  };

  // ponto diário
  const escalaDiaMap = useMemo(() => { const m = {}; escalasDia.forEach(e => { m[e.colaborador_id] = e; }); return m; }, [escalasDia]);
  const ausenciaMapDia = useMemo(() => {
    const m = {};
    ausencias.forEach(a => { if (a.data_inicio <= selectedDate && a.data_fim >= selectedDate) m[a.enrollid] = a; });
    return m;
  }, [ausencias, selectedDate]);
  const marcacoesDia = useMemo(() => {
    const m = {};
    marcacoes.forEach(marc => {
      const d = new Date(marc.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
      if (d !== selectedDate) return;
      if (!m[marc.enrollid]) m[marc.enrollid] = [];
      m[marc.enrollid].push(marc);
    });
    return m;
  }, [marcacoes, selectedDate, userTimezone]);
  const dowDia = useMemo(() => getDay(new Date(selectedDate + 'T12:00:00')), [selectedDate]);

  const linhasPonto = useMemo(() => {
    const result = [];
    terminalUsers.filter(u => u.ativo).forEach(u => {
      const escalaDia = escalaDiaMap[u.id];
      let horario = null, tipoEscala = 'normal';
      if (escalaDia) {
        tipoEscala = escalaDia.tipo;
        if (escalaDia.tipo === 'normal' && escalaDia.horario_id) horario = horarioMap[escalaDia.horario_id];
        else if (['folga', 'ferias', 'feriado'].includes(escalaDia.tipo)) horario = null;
        else if (escalaDia.tipo === 'extra' && escalaDia.horario_id) horario = horarioMap[escalaDia.horario_id];
      } else { horario = u.horario_id ? horarioMap[u.horario_id] : null; }
      let deveTrabalhar = false;
      if (!['folga', 'ferias', 'feriado'].includes(tipoEscala) && horario) {
        const dias = parseDias(horario.dias_semana);
        deveTrabalhar = dias.length === 0 || dias.includes(dowDia);
      }
      const ausencia = ausenciaMapDia[u.enrollid];
      const marcs = marcacoesDia[u.enrollid] || [];
      if (!deveTrabalhar && !ausencia && marcs.length === 0) return;
      const calc = calcularDia(marcs, horario);
      const sorted = [...marcs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const primeira = sorted[0] || null;
      const ultima = sorted[sorted.length - 1] || null;
      let status;
      if (ausencia) status = 'ausencia';
      else if (['folga', 'ferias', 'feriado'].includes(tipoEscala)) status = 'folga';
      else if (marcs.length === 0 && deveTrabalhar) status = 'faltou';
      else if (calc.minutosAtraso > 0) status = 'atrasado';
      else status = 'presente';
      result.push({ u, horario, calc, primeira, ultima, status, ausencia, tipoEscala, deveTrabalhar });
    });
    const order = { faltou: 0, atrasado: 1, presente: 2, ausencia: 3, folga: 4 };
    return result.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || a.u.nome.localeCompare(b.u.nome));
  }, [terminalUsers, horarioMap, escalaDiaMap, ausenciaMapDia, marcacoesDia, dowDia]);

  const summaryPonto = useMemo(() => ({
    total: linhasPonto.length, faltou: linhasPonto.filter(l => l.status === 'faltou').length,
    atrasado: linhasPonto.filter(l => l.status === 'atrasado').length, presente: linhasPonto.filter(l => l.status === 'presente').length,
    ausencia: linhasPonto.filter(l => l.status === 'ausencia').length, folga: linhasPonto.filter(l => l.status === 'folga').length,
    comExtra: linhasPonto.filter(l => l.calc.minutosExtra > 0).length,
  }), [linhasPonto]);

  const pontoFiltered = useMemo(() => linhasPonto.filter(l => {
    const matchStatus = pontoFiltroStatus === 'todos' || l.status === pontoFiltroStatus;
    const matchSearch = !pontoSearch.trim() || l.u.nome.toLowerCase().includes(pontoSearch.toLowerCase()) || String(l.u.enrollid).includes(pontoSearch);
    return matchStatus && matchSearch;
  }), [linhasPonto, pontoFiltroStatus, pontoSearch]);

  const exportPontoCSV = () => {
    const headers = ['Nome', 'ID', 'Estado', 'Entrada Real', 'Saída Real', 'Entrada Prev.', 'Saída Prev.', 'Atraso', 'Hora Extra', 'Efectivas'];
    const rows = pontoFiltered.map(l => [
      l.u.nome, l.u.enrollid, STATUS_PONTO[l.status]?.label || l.status,
      fmtHora(l.primeira?.timestamp), fmtHora(l.ultima?.tipo === 'saida' ? l.ultima?.timestamp : null),
      l.horario?.hora_entrada || '', l.horario?.hora_saida || '',
      l.calc.minutosAtraso > 0 ? fmtMin(l.calc.minutosAtraso) : '', l.calc.minutosExtra > 0 ? fmtMin(l.calc.minutosExtra) : '', fmtMin(l.calc.minutosEfetivos),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ponto_${selectedDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Horários tab state ──────────────────────
  const [horTab, setHorTab] = useState('turnos');
  const [horDialog, setHorDialog] = useState(false);
  const [horEditingId, setHorEditingId] = useState(null);
  const [horDeleteId, setHorDeleteId] = useState(null);
  const [assigningId, setAssigningId] = useState(null);
  const [horForm, setHorForm] = useState({ nome: '', hora_entrada: '08:00', hora_saida_almoco: '', hora_entrada_almoco: '', hora_saida: '17:00', horas_diarias: 8, tolerancia_minutos: 10, dias_semana: '[1,2,3,4,5]', ativo: true, cor: '#10b981' });

  const horSaveMutation = useMutation({
    mutationFn: (data) => { const p = { ...data, owner_email: currentUser?.email }; if (horEditingId) return base44.entities.Horario.update(horEditingId, p); return base44.entities.Horario.create(p); },
    onSuccess: () => { queryClient.invalidateQueries(['horarios']); setHorDialog(false); toast.success(horEditingId ? 'Horário atualizado' : 'Horário criado'); },
  });
  const horDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Horario.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['horarios']); toast.success('Horário eliminado'); },
  });
  const handleAssign = async (colaboradorId, horarioId) => {
    setAssigningId(colaboradorId);
    try { await base44.entities.TerminalUser.update(colaboradorId, { horario_id: horarioId }); queryClient.invalidateQueries(['terminal-users-rh']); toast.success(horarioId ? 'Horário atribuído' : 'Horário removido'); }
    catch { toast.error('Erro ao atribuir horário'); }
    finally { setAssigningId(null); }
  };
  const handleAssignColab = async (colaboradorId, horarioId) => {
    setAssigningId(colaboradorId);
    try { await base44.entities.Colaborador.update(colaboradorId, { horario_id: horarioId || '' }); queryClient.invalidateQueries(['colaboradores']); toast.success(horarioId ? 'Horário atribuído' : 'Horário removido'); }
    catch { toast.error('Erro ao atribuir horário'); }
    finally { setAssigningId(null); }
  };
  const toggleDia = (dia) => {
    const dias = parseDias(horForm.dias_semana);
    const novo = dias.includes(dia) ? dias.filter(d => d !== dia) : [...dias, dia].sort();
    setHorForm(f => ({ ...f, dias_semana: JSON.stringify(novo) }));
  };

  const colaboradoresPorHorario = useMemo(() => {
    const map = {}; horarios.forEach(h => { map[h.id] = []; });
    terminalUsers.forEach(c => { if (c.horario_id && map[c.horario_id]) map[c.horario_id].push(c); });
    return map;
  }, [horarios, terminalUsers]);

  const presencaHojeMap = useMemo(() => {
    const porColab = {};
    [...marcacoes].filter(m => m.timestamp && new Date(m.timestamp).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA'))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach(m => { porColab[m.enrollid] = m.tipo; });
    return porColab;
  }, [marcacoes]);

  // ── Ausências tab state ──────────────────────
  const [ausDialog, setAusDialog] = useState(false);
  const [ausEditingId, setAusEditingId] = useState(null);
  const [ausDeleteId, setAusDeleteId] = useState(null);
  const [ausForm, setAusForm] = useState({ enrollid: '', utilizador_nome: '', tipo: 'ferias', data_inicio: hoje, data_fim: hoje, motivo: '', aprovado: false });
  const [ausSearch, setAusSearch] = useState('');
  const [ausOwnerFilter, setAusOwnerFilter] = useState('all');

  const ausSaveMutation = useMutation({
    mutationFn: (data) => { const p = { ...data, enrollid: Number(data.enrollid), owner_email: currentUser?.email }; if (ausEditingId) return base44.entities.AusenciaFalta.update(ausEditingId, p); return base44.entities.AusenciaFalta.create(p); },
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); setAusDialog(false); toast.success('Ausência guardada'); },
  });
  const ausDeleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AusenciaFalta.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); toast.success('Ausência eliminada'); },
  });
  const ausApproveMutation = useMutation({
    mutationFn: ({ id, aprovado }) => base44.entities.AusenciaFalta.update(id, { aprovado }),
    onSuccess: () => { queryClient.invalidateQueries(['ausencias']); toast.success('Estado atualizado'); },
  });

  const ausFiltradosColab = useMemo(() => {
    let list = terminalUsers;
    if (ausSearch.trim()) { const q = ausSearch.toLowerCase(); list = list.filter(c => c.nome?.toLowerCase().includes(q) || String(c.enrollid).includes(q)); }
    return list;
  }, [terminalUsers, ausSearch]);

  const ausAtivasHoje = ausencias.filter(a => a.data_fim >= hoje);
  const ausPassadas = ausencias.filter(a => a.data_fim < hoje);

  // ── Férias tab state ── (moved to FeriasTab)

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Recursos Humanos</h1>
            <p className="text-sm text-slate-500">Centro de gestão de colaboradores, ponto, horários e férias</p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 flex-wrap bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn('flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                  activeTab === tab.key ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100')}>
                <Icon className="h-3.5 w-3.5" />{tab.label}
              </button>
            );
          })}
        </div>

        {/* ══════════════ OVERVIEW ══════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: 'Colaboradores Ativos', value: ativos.length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Contratos Ativos', value: contratosAtivos.length, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Férias Pendentes', value: feriasPendentes.length, icon: CalendarDays, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Contratos a Expirar', value: contratosAExpirar.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Ausências Ativas', value: ausenciasAtivas.length, icon: CalendarOff, color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map((kpi, i) => (
                <Card key={i} className="bg-white border-slate-200">
                  <CardContent className="p-4">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', kpi.bg)}>
                      <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                    </div>
                    <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Alertas */}
            {(contratosAExpirar.length > 0 || feriasPendentes.length > 0) && (
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas</h2>
                {contratosAExpirar.map(c => {
                  const dias = differenceInDays(parseISO(c.data_fim), hoje_date);
                  const urgent = dias <= 7;
                  return (
                    <div key={c.id} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm', urgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200')}>
                      <AlertTriangle className={cn('h-4 w-4 shrink-0', urgent ? 'text-red-600' : 'text-amber-600')} />
                      <span className={urgent ? 'text-red-600' : 'text-amber-600'}>Contrato de {c.colaborador_nome} expira em {dias} dia(s)</span>
                    </div>
                  );
                })}
                {feriasPendentes.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border text-sm bg-blue-50 border-blue-200">
                    <CalendarDays className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-blue-600">{feriasPendentes.length} pedido(s) de férias aguardam aprovação</span>
                  </div>
                )}
              </div>
            )}

            {/* Departamentos */}
            {ativos.length > 0 && (() => {
              const depMap = {};
              ativos.forEach(c => { const dep = c.departamento || 'Sem Departamento'; depMap[dep] = (depMap[dep] || 0) + 1; });
              const depStats = Object.entries(depMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
              return (
                <Card className="bg-white border-slate-200">
                  <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-slate-700">Colaboradores por Departamento</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {depStats.map(([dep, count], i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 w-44 truncate">{dep}</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / ativos.length) * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-slate-700 w-8 text-right">{count}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Quick nav */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Ver Colaboradores', tab: 'colab', icon: Users, color: 'bg-blue-50 border-blue-200 text-blue-700' },
                { label: 'Ponto & Presença', tab: 'ponto', icon: Fingerprint, color: 'bg-teal-50 border-teal-200 text-teal-700' },
                { label: 'Horários & Turnos', tab: 'horarios', icon: CalendarClock, color: 'bg-violet-50 border-violet-200 text-violet-700' },
                { label: 'Gerir Ausências', tab: 'ausencias', icon: CalendarOff, color: 'bg-orange-50 border-orange-200 text-orange-700' },
                { label: 'Gerir Férias', tab: 'ferias', icon: CalendarDays, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                { label: 'Payroll & Recibos', nav: '/Payroll', icon: Banknote, color: 'bg-slate-50 border-slate-200 text-slate-700' },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <button key={i} onClick={() => item.tab ? setActiveTab(item.tab) : navigate(item.nav)}
                    className={cn('flex items-center gap-3 p-4 rounded-xl border font-medium text-sm hover:shadow-md transition-all', item.color)}>
                    <Icon className="h-5 w-5 shrink-0" />{item.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════ COLABORADORES ══════════════ */}
        {activeTab === 'colab' && (
          <div className="space-y-4">

            {/* Header bar */}
            <div className="flex items-center justify-between flex-wrap gap-4 bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-teal-50 rounded-xl">
                  <Users className="h-6 w-6 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Colaboradores</h2>
                  <p className="text-sm text-slate-500">{colaboradores.length} colaborador(es) · Sincronização com terminais biométricos</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => handleExportColabCSV()}>
                  <FileDown className="h-3.5 w-3.5" /> Exportar CSV
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => document.getElementById('colab-csv-import').click()}>
                  <FileUp className="h-3.5 w-3.5" /> Importar CSV
                </Button>
                <input id="colab-csv-import" type="file" accept=".csv" className="hidden" onChange={handleImportColabCSV} />
                <Button size="sm" onClick={() => { setColEditingId(null); setColFormData({ ativo: true, num_dependentes: 0, pais: 'Portugal', nacionalidade: 'Portuguesa', genero: 'nao_especificado' }); setColDialog(true); }} className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Novo
                </Button>
              </div>
            </div>

            {/* Search & filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input placeholder="Pesquisar por nome, ID, departamento, crachá..." value={colSearch} onChange={e => setColSearch(e.target.value)} className="pl-10 bg-white" />
              </div>
              <Select value={colDepFilter} onValueChange={setColDepFilter}>
                <SelectTrigger className="bg-white w-full sm:w-[200px]"><SelectValue placeholder="Todos os departamentos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os departamentos</SelectItem>
                  {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {loadingColab ? (
              <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
            ) : colFiltered.length === 0 ? (
              <Card className="bg-white border-slate-200">
                <CardContent className="py-16 text-center text-slate-400">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Nenhum colaborador encontrado</p>
                  <Button onClick={() => setColDialog(true)} className="mt-4 bg-blue-600 hover:bg-blue-700 text-sm"><Plus className="h-4 w-4 mr-2" /> Criar ficha</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Desktop table */}
                <Card className="bg-white border-slate-200 hidden lg:block overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Colaborador</th>
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Departamento / Cargo</th>
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Contacto</th>
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Admissão</th>
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Horário</th>
                        <th className="text-left px-4 py-3 text-xs uppercase font-semibold text-slate-500">Estado</th>
                        <th className="text-right px-4 py-3 text-xs uppercase font-semibold text-slate-500">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {colFiltered.map(c => {
                        const hor = horarioMap[c.horario_id];
                        const idade = c.data_nascimento ? differenceInYears(new Date(), parseISO(c.data_nascimento)) : null;
                        return (
                          <tr key={c.id} className={cn('hover:bg-slate-50 transition-colors', !c.ativo && 'opacity-60')}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {c.foto_url ? <img src={c.foto_url} alt="" className="w-8 h-8 rounded-full object-cover border border-blue-200" /> : <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">{c.nome?.charAt(0)}</div>}
                                <div>
                                  <p className="font-semibold text-slate-800">{c.nome}</p>
                                  <p className="text-xs text-slate-400">{c.numero_colaborador || `#${c.enrollid || '—'}`}{idade ? ` · ${idade} anos` : ''}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-slate-700 text-xs font-medium">{c.departamento || '—'}</p>
                              <p className="text-slate-400 text-xs">{c.cargo || '—'}</p>
                            </td>
                            <td className="px-4 py-3">
                              {c.email && <p className="text-xs text-slate-500 truncate max-w-[160px]">{c.email}</p>}
                              {c.telemovel && <p className="text-xs text-slate-400">{c.telemovel}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{c.data_admissao ? format(parseISO(c.data_admissao), 'dd/MM/yyyy') : '—'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{hor ? <Badge variant="outline" className="text-xs">{hor.nome}</Badge> : '—'}</td>
                            <td className="px-4 py-3">
                              {c.ativo !== false ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Ativo</Badge> : <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Inativo</Badge>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" className="h-7 px-2 text-blue-600 hover:bg-blue-50 gap-1" onClick={() => navigate(`/ColaboradorPerfil?id=${c.id}`)}>
                                  <ExternalLink className="h-3 w-3" /><span className="text-xs">Perfil</span>
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setColEditingId(c.id); setColFormData({ ...c }); setColDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setColDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
                {/* Mobile cards */}
                <div className="space-y-3 lg:hidden">
                  {colFiltered.map(c => (
                    <Card key={c.id} className={cn('bg-white border-slate-200', !c.ativo && 'opacity-60')}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {c.foto_url ? <img src={c.foto_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" /> : <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold shrink-0">{c.nome?.charAt(0)}</div>}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div><p className="font-semibold text-slate-800 text-sm">{c.nome}</p><p className="text-xs text-slate-500">{[c.departamento, c.cargo].filter(Boolean).join(' · ') || '—'}</p></div>
                              <div className="flex gap-1.5 shrink-0">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => { setColEditingId(c.id); setColFormData({ ...c }); setColDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 text-red-500" onClick={() => setColDeleteId(c.id)}><Trash2 className="h-3 w-3" /></Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {c.ativo !== false ? <Badge className="text-xs bg-emerald-100 text-emerald-700">Ativo</Badge> : <Badge className="text-xs bg-slate-100 text-slate-500">Inativo</Badge>}
                              <Button size="sm" variant="outline" className="h-6 px-2 text-blue-600 gap-1 text-xs" onClick={() => navigate(`/ColaboradorPerfil?id=${c.id}`)}><ExternalLink className="h-3 w-3" />Perfil</Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}

          </div>
        )}

        {/* ══════════════ PONTO & PRESENÇA ══════════════ */}
        {activeTab === 'ponto' && (
          <div className="space-y-4">
            {/* Sub tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit flex-wrap">
              {[
                { key: 'presenca', label: 'Presença Hoje', icon: Building2 },
                { key: 'marcacoes', label: 'Marcações', icon: Fingerprint },
                { key: 'relatorio', label: 'Relatório Diário', icon: CalendarDays },
                { key: 'porColab', label: 'Por Colaborador', icon: BarChart2 },
              ].map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.key} onClick={() => setPontoTab(t.key)}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                      pontoTab === t.key ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                    <Icon className="h-3.5 w-3.5" />{t.label}
                  </button>
                );
              })}
            </div>

            {/* Presença */}
            {pontoTab === 'presenca' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs text-slate-500">Atualizado {marcUpdatedAt ? new Date(marcUpdatedAt).toLocaleTimeString('pt-PT', { timeZone: userTimezone || 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'} · auto-refresh 30s</p>
                    {terminals.filter(t => t.ultimo_ping).length > 0 && (
                      <p className="text-[10px] text-slate-400 flex items-center gap-1 flex-wrap">
                        <span>Terminais:</span>
                        {terminals.filter(t => t.ultimo_ping).slice(0, 4).map(t => (
                          <span key={t.id} className={cn('inline-flex items-center gap-0.5', t.status === 'online' ? 'text-emerald-500' : 'text-slate-400')}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', t.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300')} />
                            {t.nome}
                          </span>
                        ))}
                        {terminals.filter(t => t.ultimo_ping).length > 4 && <span>+{terminals.filter(t => t.ultimo_ping).length - 4}</span>}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchMarc()} className="gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Atualizar</Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: 'Dentro', value: presencaStatus.filter(p => p.dentro).length, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                    { label: 'Saíram', value: presencaStatus.filter(p => !p.dentro).length, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
                    { label: 'Total hoje', value: presencaStatus.length, color: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
                    { label: 'Com horário', value: presencaStatus.filter(p => p.horario_id).length, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
                    { label: 'Não marcaram', value: ausentesNaoMarcaram.length, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
                  ].map((k, i) => (
                    <Card key={i} className={cn('border', k.bg)}>
                      <CardContent className="p-3 text-center">
                        <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="relative max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Pesquisar colaborador..." value={presSearch} onChange={e => setPresSearch(e.target.value)} className="pl-10 bg-white" />
                </div>
                {presFiltered.filter(p => p.dentro).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />No local ({presFiltered.filter(p => p.dentro).length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {presFiltered.filter(p => p.dentro).map(p => <PresencaCard key={p.enrollid} pessoa={p} timezone={userTimezone} horarioMap={horarioMap} ausenciaAtiva={ausenciaMap[p.enrollid]} />)}
                    </div>
                  </div>
                )}
                {presFiltered.filter(p => !p.dentro).length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-rose-600 mb-2 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />Saíram ({presFiltered.filter(p => !p.dentro).length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {presFiltered.filter(p => !p.dentro).map(p => <PresencaCard key={p.enrollid} pessoa={p} timezone={userTimezone} horarioMap={horarioMap} ausenciaAtiva={ausenciaMap[p.enrollid]} />)}
                    </div>
                  </div>
                )}
                {ausentesNaoMarcaram.length > 0 && !presSearch && (
                  <div>
                    <p className="text-sm font-semibold text-orange-600 mb-2 flex items-center gap-2"><AlertTriangle className="w-3 h-3" />Esperados · Sem registo ({ausentesNaoMarcaram.length})</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                      {ausentesNaoMarcaram.map(u => {
                        const h = u.horario_id ? horarioMap[u.horario_id] : null;
                        return (
                          <div key={u.id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center gap-2.5 opacity-70">
                            <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center shrink-0 text-xs font-bold text-orange-700">{u.nome[0]?.toUpperCase()}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700 truncate">{u.nome}</p>
                              {h && <p className="text-[10px] text-slate-400 truncate">{h.nome} · {h.hora_entrada}–{h.hora_saida}</p>}
                            </div>
                            <Badge className="text-[9px] bg-orange-100 text-orange-600 border-orange-200 shrink-0">Ausente</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Marcações lista */}
            {pontoTab === 'marcacoes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchMarc()} className="gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button>
                    {isAdmin && <Button variant="outline" size="sm" onClick={handleExportMarcacoesCSV} disabled={marcacoesFiltered.length === 0} className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />CSV</Button>}
                  </div>
                </div>
                {/* Recolher terminais (avançado — expandir manualmente) */}
                {terminals.length > 0 && (
                  <details className="bg-white border border-slate-200 rounded-xl group">
                    <summary className="cursor-pointer select-none list-none">
                      <div className="flex items-center justify-between gap-2 p-4">
                        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Download className="h-4 w-4 text-teal-600" />Recolher Marcações (Avançado)</p>
                        <span className="text-xs text-slate-400 group-open:hidden">Expandir ▼</span>
                        <span className="text-xs text-slate-400 hidden group-open:inline">Recolher ▲</span>
                      </div>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      <p className="text-xs text-slate-500 italic">As marcações chegam automaticamente via WebSocket/ADMS. Use esta opção apenas para recuperação ou terminais offline.</p>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs" onClick={async () => {
                          setCollecting('all'); let total = 0, errors = 0;
                          for (const t of terminals) { try { total += await collectFromTerminal(t); } catch { errors++; } }
                          setCollecting(null); refetchMarc();
                          errors === 0 ? toast.success(`${total} marcação(ões) de ${terminals.length} terminal(is)`) : toast.error(`${total} OK / ${errors} erro(s)`);
                        }} disabled={collecting === 'all'}>
                          {collecting === 'all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Recolher Todos
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {terminals.map(t => (
                          <Button key={t.id} variant="outline" size="sm" disabled={!!collecting} onClick={() => handleCollectOne(t)}
                            className={cn('text-xs gap-1.5', t.status === 'online' ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500')}>
                            {collecting === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            {t.nome}{t.status === 'online' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </details>
                )}
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total', value: marcacoesFiltered.length },
                    { label: 'Entradas', value: marcacoesFiltered.filter(m => m.tipo === 'entrada').length },
                    { label: 'Saídas', value: marcacoesFiltered.filter(m => m.tipo === 'saida').length },
                    { label: 'Por Exportar', value: marcacoesFiltered.filter(m => !m.exportado).length },
                  ].map(s => (
                    <Card key={s.label} className="bg-white border-slate-200">
                      <CardContent className="p-3"><p className="text-xs text-slate-500">{s.label}</p><p className="text-xl font-bold text-slate-800">{s.value}</p></CardContent>
                    </Card>
                  ))}
                </div>
                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Utilizador ou ID..." value={marcSearch} onChange={e => setMarcSearch(e.target.value)} className="pl-10 bg-white" />
                  </div>
                  <Input type="date" value={marcFrom} onChange={e => setMarcFrom(e.target.value)} className="bg-white" />
                  <Input type="date" value={marcTo} onChange={e => setMarcTo(e.target.value)} className="bg-white" />
                  <Select value={marcTipo} onValueChange={setMarcTipo}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* Table */}
                {loadingMarc ? (
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
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Tipo</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase w-16">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {marcacoesFiltered.slice(0, 300).map((m, i) => {
                            const nome = m.utilizador_nome || userMap[m.enrollid]?.nome || `ID:${m.enrollid}`;
                            const modeInfo = getModeInfo(m.modo, m.raw_mode);
                            return (
                              <tr key={m.id || i} className="hover:bg-slate-50 group">
                                <td className="px-4 py-2.5 font-mono text-xs text-slate-600 whitespace-nowrap">{fmtDataHora(m.timestamp)}</td>
                                <td className="px-4 py-2.5 text-xs font-medium text-slate-800">{m.terminal_nome || '—'}</td>
                                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.enrollid}</td>
                                <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{nome}</td>
                                <td className="px-4 py-2.5"><Badge className={cn('text-xs', TIPO_MARCACAO_COLORS[m.tipo] || TIPO_MARCACAO_COLORS.desconhecido)}>{m.tipo || 'desconhecido'}</Badge></td>
                                <td className="px-4 py-2.5 text-right">
                                  <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Editar" onClick={() => { setMarcEditData({ ...m }); setMarcEditDialog(true); }}>
                                      <Pencil className="h-3 w-3 text-slate-400 hover:text-blue-600" />
                                    </Button>
                                    {isAdmin && (
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Eliminar" onClick={() => setMarcDeleteId(m.id)}>
                                        <Trash2 className="h-3 w-3 text-slate-400 hover:text-red-600" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {marcacoesFiltered.length === 0 && <div className="py-12 text-center text-slate-400"><p>Sem marcações para o período</p></div>}
                      {marcacoesFiltered.length > 300 && <p className="text-center text-xs text-slate-400 py-3 border-t">A mostrar 300 de {marcacoesFiltered.length}. Refine o filtro.</p>}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* Por colaborador */}
            {pontoTab === 'porColab' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <Input type="date" value={marcFrom} onChange={e => setMarcFrom(e.target.value)} className="bg-white" />
                  <Input type="date" value={marcTo} onChange={e => setMarcTo(e.target.value)} className="bg-white" />
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <RelatorioPorColaborador
                    marcacoes={marcacoesFiltered}
                    userMap={Object.fromEntries(terminalUsers.map(u => [u.enrollid, u.nome]))}
                    dateFrom={marcFrom}
                    dateTo={marcTo}
                    userTimezone={userTimezone}
                    horarioMap={horarioMap}
                    terminalUserMap={terminalUserMap}
                    ausencias={ausencias}
                  />
                </div>
              </div>
            )}

            {/* Relatório diário */}
            {pontoTab === 'relatorio' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <Button variant="outline" size="sm" onClick={() => refetchMarc()} className="gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" />Atualizar</Button>
                  <Button variant="outline" size="sm" onClick={exportPontoCSV} className="gap-1.5 text-xs"><Download className="h-3.5 w-3.5" />CSV</Button>
                </div>
                {/* KPI */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {[
                    { key: 'total', label: 'Total', val: summaryPonto.total, color: 'bg-slate-50 border-slate-200 text-slate-700' },
                    { key: 'presente', label: 'Presentes', val: summaryPonto.presente, color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                    { key: 'atrasado', label: 'Atrasados', val: summaryPonto.atrasado, color: 'bg-amber-50 border-amber-200 text-amber-700' },
                    { key: 'faltou', label: 'Faltaram', val: summaryPonto.faltou, color: 'bg-rose-50 border-rose-200 text-rose-700' },
                    { key: 'ausencia', label: 'Ausências', val: summaryPonto.ausencia, color: 'bg-blue-50 border-blue-200 text-blue-700' },
                    { key: 'folga', label: 'Folgas', val: summaryPonto.folga, color: 'bg-slate-50 border-slate-300 text-slate-600' },
                    { key: 'comExtra', label: 'Hora Extra', val: summaryPonto.comExtra, color: 'bg-violet-50 border-violet-200 text-violet-700' },
                  ].map(kpi => (
                    <button key={kpi.key} onClick={() => setPontoFiltroStatus(kpi.key === 'comExtra' || kpi.key === 'total' ? 'todos' : (pontoFiltroStatus === kpi.key ? 'todos' : kpi.key))}
                      className={cn('border rounded-xl p-3 text-center transition-all hover:shadow-sm', kpi.color, pontoFiltroStatus === kpi.key && 'ring-2 ring-offset-1 ring-violet-400')}>
                      <p className="text-xl font-bold">{kpi.val}</p>
                      <p className="text-[11px] font-medium mt-0.5 opacity-80">{kpi.label}</p>
                    </button>
                  ))}
                </div>
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input placeholder="Pesquisar..." value={pontoSearch} onChange={e => setPontoSearch(e.target.value)} className="pl-10 bg-white" />
                </div>
                {pontoFiltered.length === 0 ? (
                  <div className="py-16 text-center text-slate-400"><p>Sem dados para mostrar</p></div>
                ) : (
                  <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="px-4 py-3 text-left">Colaborador</th>
                          <th className="px-3 py-3 text-left">Horário</th>
                          <th className="px-3 py-3 text-center">Estado</th>
                          <th className="px-3 py-3 text-center">Entrada Real</th>
                          <th className="px-3 py-3 text-center">Saída Real</th>
                          <th className="px-3 py-3 text-center">Atraso</th>
                          <th className="px-3 py-3 text-center">Extra</th>
                          <th className="px-3 py-3 text-center">Efectivas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pontoFiltered.map(({ u, horario, calc, primeira, ultima, status, ausencia }) => {
                          const cfg = STATUS_PONTO[status];
                          const Icon = cfg?.icon;
                          const saidaReal = ultima?.tipo === 'saida' ? ultima?.timestamp : null;
                          return (
                            <tr key={u.id} className={cn('hover:bg-slate-50', status === 'faltou' && 'bg-rose-50/40')}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={cn('w-2 h-2 rounded-full shrink-0', cfg?.dot)} />
                                  <div><p className="font-semibold text-slate-800">{u.nome}</p><p className="text-[10px] text-slate-400">#{u.enrollid}</p></div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-slate-500">{horario ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: horario.cor || '#8b5cf6' }} />{horario.nome}</span> : <span className="text-slate-300">—</span>}</td>
                              <td className="px-3 py-3 text-center">
                                <Badge className={cn('text-[10px] px-2 py-0.5 border gap-1', cfg?.color)}>{Icon && <Icon className="h-3 w-3" />}{cfg?.label || status}</Badge>
                              </td>
                              <td className="px-3 py-3 text-center font-mono text-slate-700">{primeira ? fmtHora(primeira.timestamp) : <span className="text-slate-200">—</span>}</td>
                              <td className="px-3 py-3 text-center font-mono text-slate-700">
                                {calc.aindaDentro && !saidaReal ? <span className="text-emerald-500 animate-pulse text-[10px]">● dentro</span> : saidaReal ? fmtHora(saidaReal) : <span className="text-slate-200">—</span>}
                              </td>
                              <td className="px-3 py-3 text-center">{calc.minutosAtraso > 0 ? <span className="font-semibold text-amber-600">+{fmtMin(calc.minutosAtraso)}</span> : <span className="text-slate-200">—</span>}</td>
                              <td className="px-3 py-3 text-center">{calc.minutosExtra > 0 ? <span className="font-semibold text-violet-600">{fmtMin(calc.minutosExtra)}</span> : <span className="text-slate-200">—</span>}</td>
                              <td className="px-3 py-3 text-center text-slate-600 font-semibold">{calc.minutosEfetivos > 0 ? fmtMin(calc.minutosEfetivos) : <span className="text-slate-200">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ HORÁRIOS ══════════════ */}
        {activeTab === 'horarios' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {[{ key: 'turnos', label: 'Turnos', icon: LayoutGrid }, { key: 'escala', label: 'Escala', icon: TableProperties }].map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.key} onClick={() => setHorTab(t.key)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        horTab === t.key ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                      <Icon className="h-3.5 w-3.5" />{t.label}
                    </button>
                  );
                })}
              </div>
              <Button onClick={() => { setHorEditingId(null); setHorForm({ nome: '', hora_entrada: '08:00', hora_saida_almoco: '', hora_entrada_almoco: '', hora_saida: '17:00', horas_diarias: 8, tolerancia_minutos: 10, dias_semana: '[1,2,3,4,5]', ativo: true, cor: '#10b981' }); setHorDialog(true); }} className="bg-violet-600 hover:bg-violet-700 gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" /> Novo Horário
              </Button>
            </div>

            {horTab === 'turnos' && (
              horarios.length === 0 ? (
                <Card className="bg-white border-slate-200"><CardContent className="py-16 text-center text-slate-400"><CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Nenhum horário criado</p></CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {horarios.map(h => {
                    const dias = parseDias(h.dias_semana);
                    const colabs = colaboradoresPorHorario[h.id] || [];
                    return (
                      <Card key={h.id} className="bg-white border-slate-200">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: h.cor || '#10b981' }} />
                              <h3 className="font-semibold text-slate-800">{h.nome}</h3>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setHorEditingId(h.id); setHorForm({ nome: h.nome, hora_entrada: h.hora_entrada, hora_saida_almoco: h.hora_saida_almoco || '', hora_entrada_almoco: h.hora_entrada_almoco || '', hora_saida: h.hora_saida, horas_diarias: h.horas_diarias ?? 8, tolerancia_minutos: h.tolerancia_minutos ?? 10, dias_semana: h.dias_semana || '[1,2,3,4,5]', ativo: h.ativo !== false, cor: h.cor || '#10b981' }); setHorDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setHorDeleteId(h.id)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-sm flex-wrap">
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-0.5"><Clock className="h-3 w-3 text-emerald-600" /><span className="font-mono text-xs font-semibold text-emerald-700">{h.hora_entrada}</span></div>
                            <span className="text-slate-300 text-xs">→</span>
                            <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg px-2 py-0.5"><Clock className="h-3 w-3 text-rose-500" /><span className="font-mono text-xs font-semibold text-rose-600">{h.hora_saida}</span></div>
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {[0,1,2,3,4,5,6].map(d => (
                              <span key={d} className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', dias.includes(d) ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-slate-50 border-slate-200 text-slate-400')}>{DIAS_SEMANA[d]}</span>
                            ))}
                          </div>
                          <div className="pt-2 border-t border-slate-100">
                            <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1 justify-between">
                              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{colabs.length} colaborador(es)</span>
                              {(() => { const presentes = colabs.filter(c => presencaHojeMap[c.enrollid] === 'entrada').length; return presentes > 0 ? <span className="text-emerald-600 font-semibold flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{presentes} presentes</span> : null; })()}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {colabs.slice(0, 4).map(c => { const presente = presencaHojeMap[c.enrollid] === 'entrada'; return <span key={c.id} className={`text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[100px] ${presente ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.nome}</span>; })}
                              {colabs.length > 4 && <span className="text-[10px] text-slate-400">+{colabs.length - 4}</span>}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )
            )}

            {horTab === 'escala' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-slate-500">
                    {ativos.length > 0 ? `${ativos.length} colaborador(es) ativo(s) · Clique no ✏️ para editar a escala de cada um` : 'Crie colaboradores primeiro'}
                  </p>
                </div>
                {ativos.length === 0 ? (
                  <Card className="bg-white border-slate-200">
                    <CardContent className="py-16 text-center text-slate-400">
                      <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium mb-2">Nenhum colaborador ativo</p>
                      <p className="text-sm mb-4">Crie colaboradores no separador "Colaboradores" para gerir escalas.</p>
                      <Button onClick={() => setActiveTab('colab')} className="bg-blue-600 hover:bg-blue-700 text-xs gap-1.5">
                        <Users className="h-3.5 w-3.5" /> Ir para Colaboradores
                      </Button>
                    </CardContent>
                  </Card>
                ) : horarios.length === 0 ? (
                  <Card className="bg-white border-slate-200">
                    <CardContent className="py-16 text-center text-slate-400">
                      <CalendarClock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium mb-2">Nenhum horário/turno criado</p>
                      <p className="text-sm mb-4">Crie horários no separador "Turnos" para depois atribuir na escala.</p>
                      <Button onClick={() => setHorTab('turnos')} className="bg-violet-600 hover:bg-violet-700 text-xs gap-1.5">
                        <Plus className="h-3.5 w-3.5" /> Criar turnos
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <EscalaTrabalho colaboradores={ativos} horarios={horarios} onAssign={handleAssignColab} assigningId={assigningId} ownerEmail={currentUser?.email} />
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ AUSÊNCIAS ══════════════ */}
        {activeTab === 'ausencias' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {Object.entries(TIPO_AUSENCIA_LABELS).map(([tipo, label]) => {
                  const count = ausencias.filter(a => a.tipo === tipo && a.data_fim >= hoje).length;
                  return (
                    <div key={tipo} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-slate-800">{count}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                    </div>
                  );
                })}
              </div>
              <Button onClick={() => { setAusEditingId(null); setAusForm({ enrollid: '', utilizador_nome: '', tipo: 'ferias', data_inicio: hoje, data_fim: hoje, motivo: '', aprovado: false }); setAusSearch(''); setAusDialog(true); }} className="bg-orange-600 hover:bg-orange-700 gap-1.5 text-xs self-start">
                <Plus className="h-3.5 w-3.5" /> Registar Ausência
              </Button>
            </div>

            {ausAtivasHoje.length > 0 && (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200"><p className="text-xs font-semibold text-amber-700">🗓 Ausências Ativas ou Futuras ({ausAtivasHoje.length})</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Colaborador</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Período</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">Dias</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">✓</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-slate-600">Ações</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {ausAtivasHoje.map(a => {
                        let dias = 0;
                        try { dias = eachDayOfInterval({ start: parseISO(a.data_inicio), end: parseISO(a.data_fim) }).length; } catch { }
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3"><p className="text-xs font-medium text-slate-800">{a.utilizador_nome || `ID:${a.enrollid}`}</p><p className="text-[10px] text-slate-400 font-mono">#{a.enrollid}</p></td>
                            <td className="px-4 py-3"><Badge className={cn('text-[10px]', TIPO_AUSENCIA_COLORS[a.tipo] || TIPO_AUSENCIA_COLORS.justificada)}>{TIPO_AUSENCIA_LABELS[a.tipo] || a.tipo}</Badge></td>
                            <td className="px-4 py-3 text-xs text-slate-600"><p>{format(parseISO(a.data_inicio), 'dd/MM/yyyy')}</p><p className="text-slate-400">→ {format(parseISO(a.data_fim), 'dd/MM/yyyy')}</p></td>
                            <td className="px-4 py-3 text-center"><span className="text-xs font-semibold text-slate-700">{dias}d</span></td>
                            <td className="px-4 py-3 text-center">
                              {isAdmin ? (
                                <button onClick={() => ausApproveMutation.mutate({ id: a.id, aprovado: !a.aprovado })}>
                                  {a.aprovado ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300 hover:text-emerald-400 transition-colors" />}
                                </button>
                              ) : (a.aprovado ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-300" />)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={() => { setAusEditingId(a.id); setAusForm({ enrollid: a.enrollid, utilizador_nome: a.utilizador_nome || '', tipo: a.tipo, data_inicio: a.data_inicio, data_fim: a.data_fim, motivo: a.motivo || '', aprovado: a.aprovado || false }); setAusDialog(true); }}><Pencil className="h-3 w-3" /></Button>
                                {isAdmin && <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => setAusDeleteId(a.id)}><Trash2 className="h-3 w-3" /></Button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {ausPassadas.length > 0 && (
              <Card className="bg-white border-slate-200 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200"><p className="text-xs font-semibold text-slate-500">Histórico ({ausPassadas.length})</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Colaborador</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-slate-600">Período</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-slate-600">Dias</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100 opacity-60">
                      {ausPassadas.slice(0, 50).map(a => {
                        let dias = 0;
                        try { dias = eachDayOfInterval({ start: parseISO(a.data_inicio), end: parseISO(a.data_fim) }).length; } catch { }
                        return (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 text-xs text-slate-700">{a.utilizador_nome || `ID:${a.enrollid}`}</td>
                            <td className="px-4 py-2"><Badge className={cn('text-[10px]', TIPO_AUSENCIA_COLORS[a.tipo] || TIPO_AUSENCIA_COLORS.justificada)}>{TIPO_AUSENCIA_LABELS[a.tipo] || a.tipo}</Badge></td>
                            <td className="px-4 py-2 text-xs text-slate-600">{format(parseISO(a.data_inicio), 'dd/MM/yyyy')} → {format(parseISO(a.data_fim), 'dd/MM/yyyy')}</td>
                            <td className="px-4 py-2 text-center text-xs font-semibold text-slate-700">{dias}d</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {ausencias.length === 0 && (
              <Card className="bg-white border-slate-200"><CardContent className="py-16 text-center text-slate-400"><CalendarOff className="h-12 w-12 mx-auto mb-3 opacity-30" /><p>Nenhuma ausência registada</p></CardContent></Card>
            )}
          </div>
        )}

        {/* ══════════════ HORAS EXTRA ══════════════ */}
        {activeTab === 'horas_extra' && (
          <TabHorasExtra currentUser={currentUser} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
        )}

        {/* ══════════════ BANCO DE HORAS ══════════════ */}
        {activeTab === 'banco_horas' && (
          <TabBancoHoras currentUser={currentUser} />
        )}

        {/* ══════════════ BAIXAS & JUSTIFICAÇÕES ══════════════ */}
        {activeTab === 'baixas' && (
          <TabBaixasJustificacoes currentUser={currentUser} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
        )}

        {/* ══════════════ CONTRATOS ══════════════ */}
        {activeTab === 'contratos' && (
          <TabContratos currentUser={currentUser} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
        )}

        {/* ══════════════ PAYROLL ══════════════ */}
        {activeTab === 'payroll' && (
          <TabPayroll currentUser={currentUser} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
        )}

        {/* ══════════════ ENVIO PARA TERMINAIS ══════════════ */}
        {activeTab === 'terminais' && (
          <TabEnvioTerminais currentUser={currentUser} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
        )}

        {/* ══════════════ FÉRIAS ══════════════ */}
        {activeTab === 'ferias' && (
          <FeriasTab
            colaboradores={colaboradores}
            pedidosFerias={pedidosFerias}
            saldos={saldos}
            anoAtual={anoAtual}
            currentUser={currentUser}
            userTimezone={userTimezone}
            hoje_date={hoje_date}
          />
        )}
      </div>

      {/* ════ Dialogs ════ */}

      {/* Colaborador form dialog */}
      <Dialog open={colDialog} onOpenChange={setColDialog}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{colEditingId ? 'Editar Ficha' : 'Nova Ficha de Colaborador'}</DialogTitle></DialogHeader>
          <ColaboradorRHForm data={colFormData} onChange={setColFormData} horarios={horarios} />
          <div className="flex gap-2 pt-3 border-t border-slate-100 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => { setColDialog(false); setColEditingId(null); setColFormData({}); }}>Cancelar</Button>
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={colSaveMutation.isPending || !colFormData.nome} onClick={() => colSaveMutation.mutate(colFormData)}>
              {colSaveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {colEditingId ? 'Guardar Alterações' : 'Criar Colaborador'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!colDeleteId} onOpenChange={open => !open && setColDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar ficha?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { colDeleteMutation.mutate(colDeleteId); setColDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Horário form dialog */}
      <Dialog open={horDialog} onOpenChange={setHorDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{horEditingId ? 'Editar Horário' : 'Novo Horário'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Nome do horário</label><Input value={horForm.nome} onChange={e => setHorForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Turno Manhã..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-slate-600 block mb-1">🟢 Entrada</label><Input type="time" value={horForm.hora_entrada} onChange={e => setHorForm(f => ({ ...f, hora_entrada: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">🔴 Saída</label><Input type="time" value={horForm.hora_saida} onChange={e => setHorForm(f => ({ ...f, hora_saida: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 block mb-1">🍽 Saída pausa</label><Input type="time" value={horForm.hora_saida_almoco} onChange={e => setHorForm(f => ({ ...f, hora_saida_almoco: e.target.value }))} /></div>
              <div><label className="text-xs text-slate-400 block mb-1">🔁 Regresso</label><Input type="time" value={horForm.hora_entrada_almoco} onChange={e => setHorForm(f => ({ ...f, hora_entrada_almoco: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Horas diárias</label><Input type="number" min={1} max={24} step={0.5} value={horForm.horas_diarias} onChange={e => setHorForm(f => ({ ...f, horas_diarias: Number(e.target.value) }))} /></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Tolerância (min)</label><Input type="number" min={0} max={60} value={horForm.tolerancia_minutos} onChange={e => setHorForm(f => ({ ...f, tolerancia_minutos: Number(e.target.value) }))} /></div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Dias da semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {[0,1,2,3,4,5,6].map(d => {
                  const dias = parseDias(horForm.dias_semana);
                  return <button key={d} onClick={() => toggleDia(d)} className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', dias.includes(d) ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300')}>{DIAS_SEMANA[d]}</button>;
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-2">Cor</label>
              <div className="flex gap-2 flex-wrap">
                {TURNO_CORES.map(c => <button key={c} onClick={() => setHorForm(f => ({ ...f, cor: c }))} className={cn('w-7 h-7 rounded-full border-2 transition-all', horForm.cor === c ? 'border-slate-800 scale-110' : 'border-transparent')} style={{ backgroundColor: c }} />)}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setHorDialog(false)}>Cancelar</Button>
              <Button className="flex-1 bg-violet-600 hover:bg-violet-700" disabled={!horForm.nome || horSaveMutation.isPending} onClick={() => horSaveMutation.mutate(horForm)}>{horSaveMutation.isPending ? 'A guardar...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!horDeleteId} onOpenChange={open => !open && setHorDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar horário?</AlertDialogTitle><AlertDialogDescription>Os colaboradores associados perderão este horário.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { horDeleteMutation.mutate(horDeleteId); setHorDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ausência form dialog */}
      <Dialog open={ausDialog} onOpenChange={setAusDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>{ausEditingId ? 'Editar Ausência' : 'Registar Ausência'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600 block">Colaborador</label>
              <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" /><Input placeholder="Pesquisar por ID ou nome..." value={ausSearch} onChange={e => setAusSearch(e.target.value)} className="pl-8 h-8 text-xs" /></div>
              <Select value={String(ausForm.enrollid)} onValueChange={v => { const c = terminalUsers.find(x => String(x.enrollid) === v); setAusForm(f => ({ ...f, enrollid: v, utilizador_nome: c?.nome || '' })); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar colaborador" /></SelectTrigger>
                <SelectContent>
                  {ausFiltradosColab.map(c => <SelectItem key={c.enrollid} value={String(c.enrollid)}>{c.nome} (#{c.enrollid})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Tipo</label>
              <Select value={ausForm.tipo} onValueChange={v => setAusForm(f => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TIPO_AUSENCIA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Data início</label><Input type="date" value={ausForm.data_inicio} onChange={e => setAusForm(f => ({ ...f, data_inicio: e.target.value }))} /></div>
              <div><label className="text-xs font-medium text-slate-600 block mb-1">Data fim</label><Input type="date" value={ausForm.data_fim} onChange={e => setAusForm(f => ({ ...f, data_fim: e.target.value }))} /></div>
            </div>
            <div><label className="text-xs font-medium text-slate-600 block mb-1">Motivo</label><Input value={ausForm.motivo} onChange={e => setAusForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Descrever..." /></div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setAusDialog(false)}>Cancelar</Button>
              <Button className="flex-1 bg-orange-600 hover:bg-orange-700" disabled={!ausForm.enrollid || !ausForm.data_inicio || !ausForm.data_fim || ausSaveMutation.isPending} onClick={() => ausSaveMutation.mutate(ausForm)}>{ausSaveMutation.isPending ? 'A guardar...' : 'Guardar'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!ausDeleteId} onOpenChange={open => !open && setAusDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar ausência?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { ausDeleteMutation.mutate(ausDeleteId); setAusDeleteId(null); }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Marcação edit dialog */}
      <Dialog open={marcEditDialog} onOpenChange={open => { setMarcEditDialog(open); if (!open) setMarcEditData(null); }}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader><DialogTitle>Editar Marcação</DialogTitle></DialogHeader>
          {marcEditData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Data/Hora</Label>
                  <Input
                    type="datetime-local"
                    value={marcEditData.timestamp ? new Date(marcEditData.timestamp).toISOString().slice(0, 16) : ''}
                    onChange={e => setMarcEditData(f => ({ ...f, timestamp: new Date(e.target.value).toISOString() }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Tipo</Label>
                  <Select value={marcEditData.tipo || 'desconhecido'} onValueChange={v => setMarcEditData(f => ({ ...f, tipo: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entrada">Entrada</SelectItem>
                      <SelectItem value="saida">Saída</SelectItem>
                      <SelectItem value="desconhecido">Desconhecido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">ID (EnrollID)</Label>
                  <Input type="number" value={marcEditData.enrollid || ''} onChange={e => setMarcEditData(f => ({ ...f, enrollid: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-600">Modo</Label>
                  <Input value={marcEditData.modo || ''} onChange={e => setMarcEditData(f => ({ ...f, modo: e.target.value }))} placeholder="fp, face, card, pw..." />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Nome do Utilizador</Label>
                <Input value={marcEditData.utilizador_nome || ''} onChange={e => setMarcEditData(f => ({ ...f, utilizador_nome: e.target.value }))} placeholder="Nome no terminal..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Terminal</Label>
                <Input value={marcEditData.terminal_nome || ''} disabled className="bg-slate-50" />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />A edição corrige divergências nos dados vindos do terminal. Use com cuidado.</p>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" className="flex-1" onClick={() => { setMarcEditDialog(false); setMarcEditData(null); }}>Cancelar</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={marcEditMutation.isPending} onClick={() => marcEditMutation.mutate({
                  timestamp: marcEditData.timestamp,
                  tipo: marcEditData.tipo,
                  enrollid: marcEditData.enrollid,
                  modo: marcEditData.modo,
                  utilizador_nome: marcEditData.utilizador_nome,
                })}>
                  {marcEditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Marcação delete dialog */}
      <AlertDialog open={!!marcDeleteId} onOpenChange={open => !open && setMarcDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Eliminar Marcação?</AlertDialogTitle><AlertDialogDescription>Esta ação é permanente. A marcação será removida do sistema.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => marcDeleteMutation.mutate(marcDeleteId)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}