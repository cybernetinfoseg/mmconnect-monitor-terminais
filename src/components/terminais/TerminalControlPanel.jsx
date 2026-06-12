import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import OperationLogsList from './OperationLogsList';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  ClipboardList,
  DoorOpen,
  RefreshCw,
  Info,
  LockOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Zap,
  UserPlus,
  UserX,
  UserMinus,
  Users,
  Trash2,
  Settings2,
  RotateCcw,
  ListChecks,
  Timer,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import UserActionForm from './UserActionForm';

// Mapeia tipo de conexão / fabricante para ações suportadas
function getSupportedActions(terminal) {
  const tipo = terminal.tipo_conexao;
  const fab = terminal.fabricante || '';

  const all = {
    settime:     { label: 'Acertar Relógio',        icon: Clock,        color: 'blue',    desc: 'Sincronizar hora do terminal com o servidor' },
    getlogs:     { label: 'Recolher Marcações',      icon: ClipboardList,color: 'emerald', desc: 'Obter novos registos de ponto do terminal' },
    getalllog:   { label: 'Todos os Logs',           icon: ListChecks,   color: 'emerald', desc: 'Obter todos os registos de ponto (incluindo já recolhidos)' },
    opendoor:    { label: 'Abrir Porta',             icon: DoorOpen,     color: 'amber',   desc: 'Acionar abertura de porta remotamente', confirm: true },
    reboot:      { label: 'Reiniciar Terminal',      icon: RefreshCw,    color: 'orange',  desc: 'Reiniciar o terminal imediatamente', confirm: true, danger: true },
    getdevinfo:  { label: 'Info do Dispositivo',     icon: Info,         color: 'slate',   desc: 'Obter capacidades e estado do hardware' },
    getparam:    { label: 'Parâmetros',              icon: Settings2,    color: 'slate',   desc: 'Ler configurações actuais do terminal' },
    lockctrl:    { label: 'Estado da Porta',         icon: LockOpen,     color: 'violet',  desc: 'Forçar porta aberta, fechada ou abrir momentaneamente', form: true },
    getuserlist: { label: 'Listar Utilizadores',     icon: Users,        color: 'teal',    desc: 'Ver todos os utilizadores registados no terminal' },
    adduser:     { label: 'Adicionar Utilizador',    icon: UserPlus,     color: 'teal',    desc: 'Registar novo utilizador no terminal', form: true },
    blockuser:   { label: 'Bloquear Utilizador',     icon: UserX,        color: 'rose',    desc: 'Bloquear ou desbloquear acesso de utilizador', form: true },
    deleteuser:  { label: 'Remover Utilizador',      icon: UserMinus,    color: 'red',     desc: 'Eliminar utilizador do terminal', form: true },
    clearlog:    { label: 'Limpar Logs',             icon: Trash2,       color: 'orange',  desc: 'Apagar todos os registos de ponto do terminal', confirm: true, danger: true },
    clearusers:  { label: 'Limpar Utilizadores',     icon: Trash2,       color: 'red',     desc: 'Apagar TODOS os utilizadores e dados biométricos', confirm: true, danger: true },
    initdevice:  { label: 'Reset de Fábrica',        icon: RotateCcw,    color: 'red',     desc: 'Inicializar terminal — apaga tudo e repõe configurações de fábrica', confirm: true, danger: true },
    gettime:     { label: 'Ver Hora do Terminal',     icon: Timer,        color: 'blue',    desc: 'Obter hora atual do terminal e comparar com o servidor' },
    getdevcap:   { label: 'Capacidade do Dispositivo', icon: Cpu,         color: 'slate',   desc: 'Ver slots usados: utilizadores, faces, impressões digitais, logs' },
  };

  if (tipo === 'websocket_cloud') {
    return ['settime', 'gettime', 'getlogs', 'getalllog', 'opendoor', 'reboot', 'getdevinfo', 'getdevcap', 'getparam', 'lockctrl', 'getuserlist', 'adduser', 'blockuser', 'deleteuser', 'clearlog', 'clearusers', 'initdevice'].map(k => ({ key: k, ...all[k] }));
  }
  if (tipo === 'adms_push') {
    return ['settime', 'getlogs', 'opendoor', 'reboot', 'getdevinfo', 'adduser', 'blockuser', 'deleteuser'].map(k => ({ key: k, ...all[k] }));
  }
  if (tipo === 'sdk_tcp') {
    return ['settime', 'getlogs', 'opendoor', 'reboot', 'getdevinfo', 'adduser', 'blockuser', 'deleteuser'].map(k => ({ key: k, ...all[k] }));
  }
  if (['ip_publico', 'dns', 'ip_local'].includes(tipo)) {
    if (fab === 'hikvision') {
      return ['settime', 'getlogs', 'opendoor', 'reboot', 'adduser', 'blockuser', 'deleteuser', 'getdevinfo'].map(k => ({ key: k, ...all[k] }));
    }
    if (fab === 'dahua') {
      return ['settime', 'getlogs', 'opendoor', 'reboot', 'adduser', 'deleteuser', 'getdevinfo'].map(k => ({ key: k, ...all[k] }));
    }
  }

  return [];
}

const COLOR_MAP = {
  red:     'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
  blue:    'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
  amber:   'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
  orange:  'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100',
  slate:   'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
  violet:  'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100',
  teal:    'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100',
  rose:    'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100',
};

function ResultBox({ result }) {
  const [expanded, setExpanded] = useState(false);
  if (!result) return null;

  const hasData = result.data || result.records || result.count != null;

  return (
    <div className={cn(
      'rounded-lg border p-3 text-sm',
      result.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
    )}>
      <div className="flex items-start gap-2">
        {result.success
          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          : <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className={cn('font-medium', result.success ? 'text-emerald-800' : 'text-red-700')}>
            {result.message || result.error}
          </p>
          {result.note && <p className="text-xs text-slate-500 mt-1">{result.note}</p>}
          {result.count != null && (
            <p className="text-xs mt-1 text-emerald-700">Registos: <strong>{result.count}</strong></p>
          )}
          {result.records && result.records.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-slate-600 font-medium mb-1">Últimas marcações:</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.records.slice(0, 10).map((r, i) => (
                  <div key={i} className="text-xs font-mono bg-white rounded px-2 py-0.5 border border-emerald-100">
                    ID:{r.enrollid} | {r.time} | {r.mode === 1 ? '🖐️ FP' : r.mode === 3 ? '💳 Card' : r.mode === 8 ? '😊 Face' : r.mode === 10 ? '🤖 Face AI' : `mode:${r.mode}`}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Lista de utilizadores do terminal (getuserlist) */}
          {result.data?.users && result.data.users.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-slate-600 font-medium mb-1">Utilizadores no terminal ({result.data.users.length}):</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {result.data.users.slice(0, 20).map((u, i) => (
                  <div key={i} className="text-xs bg-white rounded px-2 py-0.5 border border-teal-100 flex gap-2">
                    <span className="font-mono text-slate-400">#{u.enrollid}</span>
                    <span className="font-medium">{u.name || '—'}</span>
                    {u.admin > 0 && <span className="text-amber-600 text-[10px]">admin</span>}
                  </div>
                ))}
                {result.data.total > 20 && (
                  <p className="text-[10px] text-slate-400 text-center">...e mais {result.data.total - 20}</p>
                )}
              </div>
            </div>
          )}
          {/* Hora do terminal (gettime) */}
          {result.data?.terminal_time && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white rounded p-2 border border-blue-100">
                <p className="text-slate-400">Terminal</p>
                <p className="font-mono font-semibold text-slate-700">{result.data.terminal_time}</p>
              </div>
              <div className="bg-white rounded p-2 border border-blue-100">
                <p className="text-slate-400">Servidor</p>
                <p className="font-mono font-semibold text-slate-700">{result.data.server_time}</p>
              </div>
              {result.data.desvio && (
                <div className="col-span-2 bg-amber-50 rounded p-2 border border-amber-100 text-amber-700 font-medium">
                  ⏱ Desvio: {result.data.desvio}
                </div>
              )}
            </div>
          )}
          {/* Capacidade do dispositivo (getdevcap) */}
          {result.data?.usersize && (
            <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
              {[
                { label: 'Utilizadores', used: result.data.useduser, total: result.data.usersize },
                { label: 'Faces', used: result.data.usedface, total: result.data.facesize },
                { label: 'Impressões', used: result.data.usedfp, total: result.data.fpsize },
                { label: 'Cartões', used: result.data.usedcard, total: result.data.cardsize },
                { label: 'Senhas', used: result.data.usedpwd, total: result.data.pwdsize },
                { label: 'Logs', used: result.data.usedlog, total: result.data.logsize },
              ].map(item => (
                <div key={item.label} className="bg-white rounded p-1.5 border border-slate-100 text-center">
                  <p className="text-slate-400 text-[10px]">{item.label}</p>
                  <p className="font-semibold text-slate-700">{item.used ?? '—'}<span className="text-slate-300">/{item.total ?? '?'}</span></p>
                </div>
              ))}
            </div>
          )}
          {hasData && result.data && (
            <button onClick={() => setExpanded(v => !v)} className="text-xs text-slate-500 mt-1 flex items-center gap-1 hover:text-slate-700">
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Ocultar detalhes' : 'Ver detalhes técnicos'}
            </button>
          )}
          {expanded && result.data && (
            <pre className="text-xs bg-white rounded p-2 mt-2 overflow-x-auto max-h-40 border border-slate-200 text-slate-600">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TerminalControlPanel({ terminal, open, onClose }) {
  const [loading, setLoading] = useState(null);
  const [results, setResults] = useState({});
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeForm, setActiveForm] = useState(null);

  // Fetch terminal users associated with this terminal
  const { data: terminalUsers = [] } = useQuery({
    queryKey: ['terminal-users-ctrl', terminal.id],
    queryFn: async () => {
      const all = await base44.entities.TerminalUser.list('-created_date', 500);
      return all.filter(u => {
        try { return JSON.parse(u.terminais_ids || '[]').includes(terminal.id); } catch { return false; }
      });
    },
    enabled: open,
  });

  const actions = getSupportedActions(terminal);
  const hasSupport = actions.length > 0;

  const executeAction = async (actionKey, params = {}) => {
    setLoading(actionKey);
    setResults(r => ({ ...r, [actionKey]: null }));
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminal.id,
        action: actionKey,
        params,
      });
      setResults(r => ({ ...r, [actionKey]: resp.data }));
    } catch (err) {
      const errorMsg = err?.response?.data?.error || err.message || 'Erro desconhecido';
      setResults(r => ({ ...r, [actionKey]: { success: false, error: errorMsg } }));
    } finally {
      setLoading(null);
    }
  };

  const handleFormSubmit = async (actionKey, formData) => {
    await executeAction(actionKey, formData);
    setActiveForm(null);
  };

  const handleActionClick = (action) => {
    if (action.form) {
      setActiveForm(activeForm === action.key ? null : action.key);
    } else if (action.confirm) {
      setConfirmAction(action);
    } else {
      executeAction(action.key);
    }
  };

  const getFabricanteLabel = () => {
    const fab = terminal.fabricante;
    const tipo = terminal.tipo_conexao;
    if (tipo === 'websocket_cloud') return 'Timmy/THbio WebSocket';
    if (tipo === 'adms_push') return `ZKTeco ADMS/Push`;
    if (tipo === 'sdk_tcp') return 'ZKTeco SDK-TCP';
    if (fab === 'hikvision') return 'Hikvision ISAPI';
    if (fab === 'dahua') return 'Dahua HTTP API';
    if (fab === 'zkteco') return 'ZKTeco';
    return fab || tipo;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg md:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Controlo Remoto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Terminal info */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{terminal.nome}</p>
                <p className="text-xs text-slate-500">{terminal.local}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="text-xs">{getFabricanteLabel()}</Badge>
                {terminal.numero_serie && (
                  <p className="text-xs text-slate-400 mt-1 font-mono">SN: {terminal.numero_serie}</p>
                )}
              </div>
            </div>
          </div>

          {/* No support */}
          {!hasSupport && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Controlo remoto não disponível</p>
                <p className="text-xs text-amber-700 mt-1">
                  O tipo de conexão <strong>{terminal.tipo_conexao}</strong> {terminal.fabricante ? `(${terminal.fabricante})` : ''} não suporta controlo remoto direto via plataforma.
                </p>
                <p className="text-xs text-amber-600 mt-2">
                  Para controlo remoto, configure o terminal como: <strong>WebSocket Cloud</strong> (Timmy), <strong>ADMS/Push</strong> (ZKTeco), ou com fabricante <strong>Hikvision/Dahua</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {hasSupport && (
            <div className="space-y-3">
              {actions.map((action) => {
                const Icon = action.icon;
                const isLoading = loading === action.key;
                const result = results[action.key];

                return (
                  <div key={action.key} className="space-y-2">
                    <button
                      onClick={() => handleActionClick(action)}
                      disabled={!!loading}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all',
                        COLOR_MAP[action.color],
                        loading && loading !== action.key ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                        isLoading && 'opacity-75'
                      )}
                    >
                      {isLoading
                        ? <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                        : <Icon className="h-5 w-5 shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{action.label}</p>
                        <p className="text-xs opacity-75">{action.desc}</p>
                      </div>
                      {action.danger && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs shrink-0">Cuidado</Badge>
                      )}
                    </button>

                    {/* Formulário inline para ações que precisam de dados */}
                    {activeForm === action.key && (
                      <UserActionForm
                        action={action.key}
                        loading={loading === action.key}
                        terminalUsers={terminalUsers}
                        onSubmit={(formData) => handleFormSubmit(action.key, formData)}
                        onCancel={() => setActiveForm(null)}
                      />
                    )}

                    {result && <ResultBox result={result} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Confirm dialog */}
          {confirmAction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm mx-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-2 rounded-lg',
                    confirmAction.danger ? 'bg-red-100' : 'bg-amber-100'
                  )}>
                    <AlertTriangle className={cn('h-5 w-5', confirmAction.danger ? 'text-red-600' : 'text-amber-600')} />
                  </div>
                  <div>
                    <p className="font-semibold">{confirmAction.label}</p>
                    <p className="text-sm text-slate-500">{terminal.nome}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{confirmAction.desc}</p>
                {confirmAction.danger && (
                  <p className="text-xs text-red-600 bg-red-50 rounded p-2">⚠️ Esta ação é imediata e não pode ser desfeita.</p>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setConfirmAction(null)}>
                    Cancelar
                  </Button>
                  <Button
                    className={cn('flex-1', confirmAction.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}
                    onClick={() => {
                      const action = confirmAction;
                      setConfirmAction(null);
                      executeAction(action.key);
                    }}
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <OperationLogsList terminalId={terminal.id} />
          </div>

          <p className="text-xs text-slate-400 text-center">
            Todas as ações são registadas no Audit Log
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}