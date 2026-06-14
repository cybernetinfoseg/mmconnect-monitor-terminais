import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Send, Search, Loader2, CheckCircle2, XCircle,
  Monitor, Users, Building2, ChevronDown, ChevronUp, Trash2, RefreshCw, Camera, ArrowUpDown
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SyncBidirectional from '@/components/rh/SyncBidirectional';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Helper: envia UM colaborador para UM terminal ─────────────────────────────
async function enviarColaborador(colaborador, terminalId, comFoto = false) {
  // 1. Enviar dados do utilizador
  const resp = await base44.functions.invoke('terminalControl', {
    terminal_id: terminalId,
    action: 'adduser',
    params: {
      enrollid: colaborador.enrollid,
      name: colaborador.nome,
      password: colaborador.password || '',
      card: colaborador.card || '',
      privilege: colaborador.privilege || 0,
    },
  });
  const result = { success: !!resp.data?.success, message: resp.data?.message || resp.data?.error || '' };

  // 2. Se pedido e tem foto, enviar foto separadamente
  if (result.success && comFoto && colaborador.foto_url) {
    try {
      const fotoResp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminalId,
        action: 'setuserphoto',
        params: {
          enrollid: colaborador.enrollid,
          foto_url: colaborador.foto_url,
        },
      });
      if (fotoResp.data?.success) {
        result.message = (result.message || '') + ' + foto facial enviada';
        result.foto_enviada = true;
      } else {
        result.message = (result.message || '') + ' (foto: ' + (fotoResp.data?.message || 'falhou') + ')';
        result.foto_enviada = false;
      }
    } catch (e) {
      result.message = (result.message || '') + ` (foto: ${e.message})`;
      result.foto_enviada = false;
    }
  }

  return result;
}

async function removerColaborador(colaborador, terminalId) {
  const resp = await base44.functions.invoke('terminalControl', {
    terminal_id: terminalId,
    action: 'deleteuser',
    params: { enrollid: colaborador.enrollid },
  });
  return { success: !!resp.data?.success, message: resp.data?.message || resp.data?.error || '' };
}

// ── Componente de linha de colaborador (envio individual) ─────────────────────
function ColaboradorRow({ colab, terminals, onSendOne, onRemoveOne, onSendPhoto, sendingId }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [results, setResults] = useState({});
  const [sendingPhoto, setSendingPhoto] = useState(false);

  const handleEnviar = async () => {
    if (!selectedTerminal) { toast.error('Selecione um terminal'); return; }
    const result = await onSendOne(colab, selectedTerminal);
    setResults(prev => ({ ...prev, [selectedTerminal]: result }));
  };

  const handleRemover = async () => {
    if (!selectedTerminal) { toast.error('Selecione um terminal'); return; }
    const result = await onRemoveOne(colab, selectedTerminal);
    setResults(prev => ({ ...prev, [selectedTerminal]: result }));
  };

  const handleSendPhoto = async () => {
    if (!selectedTerminal) { toast.error('Selecione um terminal'); return; }
    if (!colab.foto_url) { toast.error('Colaborador sem foto definida'); return; }
    setSendingPhoto(true);
    const result = await onSendPhoto(colab, selectedTerminal);
    setResults(prev => ({ ...prev, [selectedTerminal]: result }));
    setSendingPhoto(false);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {colab.foto_url
            ? <img src={colab.foto_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0 border border-teal-200" />
            : <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0 text-teal-700 font-bold text-xs">{colab.enrollid || '?'}</div>
          }
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-800 text-sm truncate">{colab.nome}</p>
            <p className="text-xs text-slate-400 truncate">{[colab.departamento, colab.cargo].filter(Boolean).join(' · ') || '—'}</p>
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          className={cn('h-7 px-2 gap-1 text-xs', expanded ? 'bg-teal-50 border-teal-300 text-teal-700' : 'text-slate-500')}
          onClick={() => setExpanded(e => !e)}
        >
          <Send className="h-3 w-3" />
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedTerminal || 'none'} onValueChange={v => setSelectedTerminal(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-[180px] bg-white">
                <SelectValue placeholder="Escolher terminal..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Escolher terminal —</SelectItem>
                {terminals.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                      <span>{t.nome}</span>
                      {t.local && <span className="text-slate-400 text-xs">— {t.local}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700 gap-1"
              disabled={!selectedTerminal || sendingId === colab.id}
              onClick={handleEnviar}
            >
              {sendingId === colab.id
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Send className="h-3 w-3" />}
              Enviar
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-8 px-3 text-xs text-red-500 border-red-200 hover:bg-red-50 gap-1"
              disabled={!selectedTerminal || sendingId === colab.id}
              onClick={handleRemover}
            >
              <Trash2 className="h-3 w-3" />
              Remover
            </Button>
            {colab.foto_url && (
              <Button
                size="sm" variant="outline"
                className="h-8 px-3 text-xs text-teal-600 border-teal-200 hover:bg-teal-50 gap-1"
                disabled={!selectedTerminal || sendingPhoto}
                onClick={handleSendPhoto}
                title="Enviar apenas a foto facial para o terminal (requer modelo AI)"
              >
                {sendingPhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                Foto
              </Button>
            )}
          </div>

          {/* Resultados por terminal */}
          {selectedTerminal && results[selectedTerminal] && (
            <div className={cn(
              'flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
              results[selectedTerminal].success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            )}>
              {results[selectedTerminal].success
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                : <XCircle className="h-3.5 w-3.5 shrink-0" />}
              {results[selectedTerminal].success ? 'Operação concluída com sucesso' : (results[selectedTerminal].message || 'Erro na operação')}
            </div>
          )}

          {/* Envio para todos os terminais */}
          <div className="border-t border-slate-200 pt-3">
            <p className="text-xs text-slate-500 mb-2">Enviar para todos os terminais:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {terminals.map(t => {
                const res = results[t.id];
                return (
                  <div key={t.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white gap-2">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-400' : 'bg-slate-300')} />
                      <p className="text-xs font-medium truncate">{t.nome}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {res && (res.success
                        ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        : <XCircle className="h-3 w-3 text-red-400" title={res.message} />
                      )}
                      <Button
                        size="sm"
                        className="h-6 w-6 p-0 bg-teal-600 hover:bg-teal-700"
                        disabled={sendingId === colab.id}
                        onClick={async () => {
                          const r = await onSendOne(colab, t.id);
                          setResults(prev => ({ ...prev, [t.id]: r }));
                        }}
                      >
                        {sendingId === colab.id ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function TabEnvioTerminais({ currentUser, colaboradores }) {
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [incluirFoto, setIncluirFoto] = useState(false);

  // Envio por departamento
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedTerminalDept, setSelectedTerminalDept] = useState('');
  const [sendingDept, setSendingDept] = useState(false);
  const [deptProgress, setDeptProgress] = useState(null);
  const [deptResults, setDeptResults] = useState(null);

  // Envio em massa
  const [selectedTerminalAll, setSelectedTerminalAll] = useState('');
  const [sendingAll, setSendingAll] = useState(false);
  const [allProgress, setAllProgress] = useState(null);
  const [allResults, setAllResults] = useState(null);

  // Sync dialog
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-rh-envio'],
    queryFn: () => base44.entities.Terminal.list('nome'),
    enabled: !!currentUser,
  });

  const departamentos = useMemo(() =>
    [...new Set(colaboradores.map(c => c.departamento).filter(Boolean))].sort(),
    [colaboradores]
  );

  const filtered = useMemo(() =>
    colaboradores.filter(c =>
      !search ||
      c.nome?.toLowerCase().includes(search.toLowerCase()) ||
      c.departamento?.toLowerCase().includes(search.toLowerCase()) ||
      String(c.enrollid || '').includes(search)
    ),
    [colaboradores, search]
  );

  const colabsPorDept = useMemo(() =>
    selectedDept ? colaboradores.filter(c => c.departamento === selectedDept) : [],
    [colaboradores, selectedDept]
  );

  // ── Handlers ──
  const handleSendOne = async (colab, terminalId) => {
    setSendingId(colab.id);
    try {
      const result = await enviarColaborador(colab, terminalId, incluirFoto);
      const term = terminals.find(t => t.id === terminalId);
      result.success
        ? toast.success(`${colab.nome} enviado para "${term?.nome}"${result.foto_enviada ? ' 📷' : ''}`)
        : toast.error(`Erro: ${result.message}`);
      setSendingId(null);
      return result;
    } catch (e) {
      setSendingId(null);
      toast.error(e.message);
      return { success: false, message: e.message };
    }
  };

  const handleSendPhoto = async (colab, terminalId) => {
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminalId,
        action: 'setuserphoto',
        params: { enrollid: colab.enrollid, foto_url: colab.foto_url },
      });
      const term = terminals.find(t => t.id === terminalId);
      const ok = !!resp.data?.success;
      ok
        ? toast.success(`Foto de ${colab.nome} enviada para "${term?.nome}"`)
        : toast.error(`Erro ao enviar foto: ${resp.data?.message || 'falhou'}`);
      return { success: ok, message: resp.data?.message || resp.data?.error || '' };
    } catch (e) {
      toast.error(e.message);
      return { success: false, message: e.message };
    }
  };

  const handleRemoveOne = async (colab, terminalId) => {
    setSendingId(colab.id);
    try {
      const result = await removerColaborador(colab, terminalId);
      const term = terminals.find(t => t.id === terminalId);
      result.success
        ? toast.success(`${colab.nome} removido de "${term?.nome}"`)
        : toast.error(`Erro: ${result.message}`);
      setSendingId(null);
      return result;
    } catch (e) {
      setSendingId(null);
      toast.error(e.message);
      return { success: false, message: e.message };
    }
  };

  const handleEnviarDepartamento = async (acao = 'enviar') => {
    if (!selectedDept || !selectedTerminalDept) { toast.error('Selecione departamento e terminal'); return; }
    const colabsDoDept = colabsPorDept.filter(c => c.ativo !== false && c.enrollid);
    if (!colabsDoDept.length) { toast.error('Nenhum colaborador ativo neste departamento'); return; }

    setSendingDept(true);
    setDeptProgress({ done: 0, total: colabsDoDept.length, label: acao === 'enviar' ? 'A enviar' : 'A remover' });
    setDeptResults(null);
    let ok = 0, fail = 0;
    const details = [];

    for (const colab of colabsDoDept) {
      const result = acao === 'enviar'
        ? await enviarColaborador(colab, selectedTerminalDept, incluirFoto).catch(e => ({ success: false, message: e.message }))
        : await removerColaborador(colab, selectedTerminalDept).catch(e => ({ success: false, message: e.message }));
      result.success ? ok++ : fail++;
      details.push({ nome: colab.nome, enrollid: colab.enrollid, ...result });
      setDeptProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setSendingDept(false);
    setDeptProgress(null);
    setDeptResults({ ok, fail, details, terminal: terminals.find(t => t.id === selectedTerminalDept)?.nome, departamento: selectedDept, acao });
    fail === 0 ? toast.success(`${ok} colaboradores processados com sucesso`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  const handleEnviarTodos = async (acao = 'enviar') => {
    if (!selectedTerminalAll) { toast.error('Selecione um terminal'); return; }
    const ativos = colaboradores.filter(c => c.ativo !== false && c.enrollid);
    if (!ativos.length) { toast.error('Nenhum colaborador ativo'); return; }

    setSendingAll(true);
    setAllProgress({ done: 0, total: ativos.length, label: acao === 'enviar' ? 'A enviar todos' : 'A remover todos' });
    setAllResults(null);
    let ok = 0, fail = 0;
    const details = [];

    for (const colab of ativos) {
      const result = acao === 'enviar'
        ? await enviarColaborador(colab, selectedTerminalAll, incluirFoto).catch(e => ({ success: false, message: e.message }))
        : await removerColaborador(colab, selectedTerminalAll).catch(e => ({ success: false, message: e.message }));
      result.success ? ok++ : fail++;
      details.push({ nome: colab.nome, enrollid: colab.enrollid, ...result });
      setAllProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setSendingAll(false);
    setAllProgress(null);
    setAllResults({ ok, fail, details, terminal: terminals.find(t => t.id === selectedTerminalAll)?.nome, acao });
    fail === 0 ? toast.success(`${ok} colaboradores processados com sucesso`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  // ── Componente de resultados ──
  const ResultsPanel = ({ results }) => {
    if (!results) return null;
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-semibold text-slate-600">
            {results.acao === 'enviar' ? 'Envio' : 'Remoção'} → "{results.terminal}"
            {results.departamento && ` (${results.departamento})`}
          </span>
          <div className="flex gap-1.5">
            <Badge className="bg-emerald-100 text-emerald-700 text-xs">{results.ok} OK</Badge>
            {results.fail > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{results.fail} erros</Badge>}
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
          {results.details.slice(0, 50).map((d, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5">
              {d.success
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
              <span className="text-xs text-slate-700 flex-1 truncate">{d.nome}</span>
              <span className="text-xs text-slate-400 font-mono">#{d.enrollid}</span>
              {!d.success && d.message && <span className="text-xs text-red-400 truncate max-w-[120px]" title={d.message}>{d.message}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Barra de progresso ──
  const ProgressBar = ({ progress, color = 'bg-teal-500' }) => {
    if (!progress) return null;
    const pct = Math.round(progress.done / progress.total * 100);
    return (
      <div className="space-y-1.5 mt-3">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{progress.label}... {progress.done}/{progress.total}</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5">
          <div className={cn('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  if (terminals.length === 0) {
    return (
      <Card className="bg-white">
        <CardContent className="py-16 text-center text-slate-400">
          <Monitor className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhum terminal configurado</p>
          <p className="text-xs mt-1">Configure terminais na secção "Terminais" para poder enviar colaboradores.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sync button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium text-slate-700">Envio de colaboradores para os terminais biométricos</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSyncDialogOpen(true)}>
          <ArrowUpDown className="h-3.5 w-3.5" /> Sincronizar Todos
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg"><Users className="h-4 w-4 text-teal-600" /></div>
            <div><p className="text-xl font-bold text-teal-600">{colaboradores.filter(c => c.ativo !== false).length}</p><p className="text-xs text-slate-500">Colaboradores ativos</p></div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg"><Monitor className="h-4 w-4 text-slate-600" /></div>
            <div><p className="text-xl font-bold text-slate-700">{terminals.length}</p><p className="text-xs text-slate-500">Terminais disponíveis</p></div>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-50 rounded-lg"><Monitor className="h-4 w-4 text-emerald-600" /></div>
            <div><p className="text-xl font-bold text-emerald-600">{terminals.filter(t => t.status === 'online').length}</p><p className="text-xs text-slate-500">Terminais online</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Toggle incluir foto */}
      <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <Camera className="h-4 w-4 text-teal-600 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-700">Incluir foto facial</p>
          <p className="text-xs text-slate-400">Apenas modelos AI com câmara (TM-AIFace, TM-AI07F, TM-AI08...)</p>
        </div>
        <button
          onClick={() => setIncluirFoto(v => !v)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
            incluirFoto ? 'bg-teal-600' : 'bg-slate-300'
          )}
        >
          <span className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
            incluirFoto ? 'translate-x-4' : 'translate-x-0.5'
          )} />
        </button>
      </div>

      <Tabs defaultValue="individual">
        <TabsList>
          <TabsTrigger value="individual" className="gap-1.5"><Users className="h-3.5 w-3.5" />Individual</TabsTrigger>
          <TabsTrigger value="departamento" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Por Departamento</TabsTrigger>
          <TabsTrigger value="todos" className="gap-1.5"><Monitor className="h-3.5 w-3.5" />Todos → Terminal</TabsTrigger>
        </TabsList>

        {/* ── INDIVIDUAL ── */}
        <TabsContent value="individual" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
          </div>
          <p className="text-xs text-slate-500">{filtered.length} colaboradores · Expanda para enviar para um terminal específico ou todos</p>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <Card className="bg-white"><CardContent className="py-8 text-center text-slate-400"><p>Nenhum colaborador encontrado</p></CardContent></Card>
            ) : filtered.map(colab => (
              <ColaboradorRow
                key={colab.id}
                colab={colab}
                terminals={terminals}
                onSendOne={handleSendOne}
                onRemoveOne={handleRemoveOne}
                onSendPhoto={handleSendPhoto}
                sendingId={sendingId}
              />
            ))}
          </div>
        </TabsContent>

        {/* ── POR DEPARTAMENTO ── */}
        <TabsContent value="departamento" className="mt-4 space-y-4">
          <Card className="bg-white border-slate-200">
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Departamento</label>
                  <Select value={selectedDept || 'none'} onValueChange={v => setSelectedDept(v === 'none' ? '' : v)} disabled={sendingDept}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Escolher departamento..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Escolher departamento —</SelectItem>
                      {departamentos.map(d => {
                        const count = colaboradores.filter(c => c.departamento === d && c.ativo !== false).length;
                        return <SelectItem key={d} value={d}>{d} ({count} ativos)</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600">Terminal de destino</label>
                  <Select value={selectedTerminalDept || 'none'} onValueChange={v => setSelectedTerminalDept(v === 'none' ? '' : v)} disabled={sendingDept}>
                    <SelectTrigger className="bg-white"><SelectValue placeholder="Escolher terminal..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Escolher terminal —</SelectItem>
                      {terminals.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <div className="flex items-center gap-2">
                            <span className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                            {t.nome} {t.local && <span className="text-slate-400 text-xs">— {t.local}</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedDept && (
                <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  <strong className="text-slate-800">{colabsPorDept.filter(c => c.ativo !== false).length}</strong> colaboradores ativos em <strong>{selectedDept}</strong>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-teal-600 hover:bg-teal-700 gap-2"
                  disabled={!selectedDept || !selectedTerminalDept || sendingDept}
                  onClick={() => handleEnviarDepartamento('enviar')}
                >
                  {sendingDept ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Departamento → Terminal
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50 gap-2"
                  disabled={!selectedDept || !selectedTerminalDept || sendingDept}
                  onClick={() => handleEnviarDepartamento('remover')}
                >
                  {sendingDept ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remover do Terminal
                </Button>
              </div>

              <ProgressBar progress={deptProgress} />
              <ResultsPanel results={deptResults} />
            </CardContent>
          </Card>

          {/* Lista de colaboradores do departamento selecionado */}
          {selectedDept && colabsPorDept.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 px-1">Colaboradores de "{selectedDept}":</p>
              {colabsPorDept.map(c => (
                <div key={c.id} className={cn('flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm', !c.ativo && 'opacity-50')}>
                  <div className="w-7 h-7 rounded-full bg-teal-100 flex items-center justify-center shrink-0 text-teal-700 font-bold text-xs">{c.enrollid || '?'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{c.nome}</p>
                    <p className="text-xs text-slate-400">{c.cargo || '—'}</p>
                  </div>
                  {!c.ativo && <Badge variant="outline" className="text-xs text-slate-400 shrink-0">Inativo</Badge>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TODOS → TERMINAL ── */}
        <TabsContent value="todos" className="mt-4 space-y-4">
          <Card className="bg-white border-slate-200">
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">Terminal de destino</label>
                <Select value={selectedTerminalAll || 'none'} onValueChange={v => setSelectedTerminalAll(v === 'none' ? '' : v)} disabled={sendingAll}>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Escolher terminal..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Escolher terminal —</SelectItem>
                    {terminals.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                          {t.nome} {t.local && <span className="text-slate-400 text-xs">— {t.local}</span>}
                          <Badge className={cn('text-xs', t.status === 'online' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{t.status || 'offline'}</Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Serão enviados <strong>{colaboradores.filter(c => c.ativo !== false && c.enrollid).length}</strong> colaboradores ativos (com enrollid) para o terminal selecionado.
              </div>

              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-teal-600 hover:bg-teal-700 gap-2"
                  disabled={!selectedTerminalAll || sendingAll}
                  onClick={() => handleEnviarTodos('enviar')}
                >
                  {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Todos → Terminal
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50 gap-2"
                  disabled={!selectedTerminalAll || sendingAll}
                  onClick={() => handleEnviarTodos('remover')}
                >
                  {sendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remover Todos do Terminal
                </Button>
              </div>

              <ProgressBar progress={allProgress} />
              <ResultsPanel results={allResults} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sync Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sincronizacao com Terminais Timmy</DialogTitle></DialogHeader>
          <SyncBidirectional terminals={terminals} colaboradores={colaboradores.filter(c => c.ativo !== false)} />
          <div className="flex justify-end pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setSyncDialogOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}