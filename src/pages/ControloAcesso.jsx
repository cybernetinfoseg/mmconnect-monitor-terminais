import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Shield, DoorOpen, Lock, Unlock, Power,
  RefreshCw, CheckCircle2, XCircle, Loader2, Zap, BellOff,
  Wifi, WifiOff, RotateCcw, Monitor
} from 'lucide-react';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DOOR_STATES = {
  normal:  { label: 'Modo Normal',    icon: DoorOpen,   color: 'bg-emerald-500', fuc: null,  desc: 'Acesso pelo método configurado' },
  unlock:  { label: 'Aberto Forçado', icon: Unlock,     color: 'bg-amber-500',   fuc: 1,    desc: 'Porta desbloqueada permanentemente' },
  lock:    { label: 'Fechado Forçado',icon: Lock,       color: 'bg-red-600',     fuc: 2,    desc: 'Porta bloqueada, ninguém entra' },
  temp:    { label: 'Abertura Temp.', icon: DoorOpen,   color: 'bg-blue-500',    fuc: 3,    desc: 'Abre brevemente e fecha sozinha' },
  reset:   { label: 'Reset Relay',    icon: RotateCcw,  color: 'bg-slate-500',   fuc: 4,    desc: 'Repõe o estado normal do relay' },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ControloAcesso() {
  const [currentUser, setCurrentUser] = useState(null);
  const { timezone: userTimezone } = useUserTimezone();
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [sending, setSending] = useState(null);
  const [doorState, setDoorState] = useState('normal');
  const [mobileCmdOpen, setMobileCmdOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => { 
    base44.auth.me().then(setCurrentUser).catch(() => {}); 
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-acesso', currentUser?.email, isAdmin],
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

  const { data: opLogs = [] } = useQuery({
    queryKey: ['op-logs-acesso', selectedTerminal?.id],
    queryFn: () => base44.entities.OperationLog.filter({ terminal_id: selectedTerminal?.id }, '-timestamp', 20),
    enabled: !!selectedTerminal,
    refetchInterval: 15000,
  });

  // Filtra os terminais suportados para o controlo de acesso
  const terminaisAcesso = useMemo(() =>
    terminals.filter(t =>
      t.tipo_conexao === 'websocket_cloud' ||
      t.tipo_conexao === 'adms_push' ||
      t.tipo_conexao === 'sdk_tcp' ||
      ['ip_publico', 'dns', 'ip_local'].includes(t.tipo_conexao)
    ),
    [terminals]
  );

  // Sincroniza o terminal selecionado com a lista atualizada
  const terminal = useMemo(() => {
    if (!selectedTerminal) return null;
    return terminals.find(t => t.id === selectedTerminal.id) || selectedTerminal;
  }, [selectedTerminal, terminals]);

  const isTimmy = terminal?.tipo_conexao === 'websocket_cloud';

  const sendCmd = useCallback(async (action, params = {}, label = '') => {
    if (!terminal) { toast.error('Nenhum terminal selecionado'); return null; }
    setSending(action + JSON.stringify(params));
    try {
      const resp = await base44.functions.invoke('terminalControl', { terminal_id: terminal.id, action, params });
      const data = resp.data;
      if (data?.success !== false) {
        toast.success(data?.message || label || 'Comando executado');
      } else {
        toast.error(data?.error || data?.message || 'Comando falhou');
      }
      queryClient.invalidateQueries(['op-logs-acesso']);
      return data;
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Erro de comunicação');
      return null;
    } finally {
      setSending(null);
    }
  }, [terminal, queryClient]);

  const handleDoorAction = async (stateKey) => {
    const state = DOOR_STATES[stateKey];
    if (stateKey === 'normal' || stateKey === 'reset') {
      await sendCmd('lockctrl', { fuc: 4 }, 'Relay reposto ao estado normal');
      setDoorState('normal');
    } else if (state.fuc) {
      if (stateKey === 'temp') {
        await sendCmd('opendoor', {}, 'Porta aberta temporariamente');
        setDoorState('temp');
        setTimeout(() => setDoorState('normal'), 5000);
      } else {
        await sendCmd('lockctrl', { fuc: state.fuc }, state.label);
        setDoorState(stateKey);
      }
    }
  };

  const handleAlarm = async (cancelar) => {
    await sendCmd('lockctrl', { fuc: 6 }, cancelar ? 'Alarme cancelado' : 'Alarme acionado');
  };

  return (
    <div className="h-full w-full bg-slate-50 flex flex-col overflow-hidden">
      
      {/* Top Header Dinâmico */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-900 rounded-lg">
            <Shield className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Controlo de Acesso</h1>
            <p className="text-xs text-slate-500">Gestão centralizada de acessos, zonas, visitantes e planta</p>
          </div>
        </div>
        {terminal && (
          <div className="flex items-center gap-2">
            <span className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium shadow-sm',
              terminal.status === 'online'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-red-50 border-red-200 text-red-700'
            )}>
              {terminal.status === 'online' ? <Wifi className="h-3 w-3 animate-pulse" /> : <WifiOff className="h-3 w-3" />}
              {terminal.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </div>
        )}
      </div>

      {/* Main Grid — O Enquadramento Azul Completo */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4 h-[calc(100vh-140px)]">

        {/* BARRA LATERAL ESQUERDA: Sempre visível e ativa, independente da seleção */}
        <div className="w-80 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-700">Terminais</h3>
            <Badge variant="secondary" className="ml-auto text-[10px] bg-slate-200 text-slate-700">{terminaisAcesso.length}</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {terminaisAcesso.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTerminal(t); setDoorState('normal'); }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all border',
                  selectedTerminal?.id === t.id
                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                    : 'bg-white border-transparent text-slate-700 hover:bg-slate-50 hover:border-slate-100'
                )}
              >
                <div className={cn('w-2.5 h-2.5 rounded-full shrink-0 shadow-sm', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{t.nome}</p>
                  <p className={cn("text-[10px] truncate mt-0.5", selectedTerminal?.id === t.id ? "text-slate-400" : "text-slate-400")}>
                    {t.local || t.fabricante || t.tipo_conexao}
                  </p>
                </div>
              </button>
            ))}
            {terminaisAcesso.length === 0 && (
              <p className="text-slate-400 text-xs py-8 text-center">Nenhum terminal configurado.</p>
            )}
          </div>
        </div>

        {/* CONTEÚDO DA DIREITA: Alterna entre ecrã vazio e painel de controlo ativo */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {terminal ? (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-hidden">
              
              {/* Painel de Ações (Retângulo Vermelho) */}
              <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between overflow-y-auto shadow-sm">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-slate-900 font-bold text-base">{terminal.nome}</h2>
                      <p className="text-slate-500 text-xs">{terminal.local} · {terminal.fabricante?.toUpperCase() || 'Terminal'} · {terminal.tipo_conexao}</p>
                    </div>
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border shadow-sm',
                      doorState === 'normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      doorState === 'unlock' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                      doorState === 'lock'   ? 'bg-red-50 border-red-200 text-red-700' :
                      'bg-blue-50 border-blue-200 text-blue-700'
                    )}>
                      {React.createElement(DOOR_STATES[doorState].icon, { className: 'h-3.5 w-3.5' })}
                      {DOOR_STATES[doorState].label}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <DoorButton icon={DoorOpen} label="Abrir Porta" sublabel="Pulso único" color="emerald" loading={sending === 'opendoor{}'} onClick={() => sendCmd('opendoor', {}, 'Porta aberta')} />
                    <DoorButton icon={Unlock} label="Aberto Forçado" sublabel="Permanente" color="amber" active={doorState === 'unlock'} loading={sending === 'lockctrl{"fuc":1}'} disabled={!isTimmy} onClick={() => handleDoorAction('unlock')} disabledReason="Apenas Timmy WS" />
                    <DoorButton icon={Lock} label="Bloquear" sublabel="Nenhum acesso" color="red" active={doorState === 'lock'} loading={sending === 'lockctrl{"fuc":2}'} disabled={!isTimmy} onClick={() => handleDoorAction('lock')} disabledReason="Apenas Timmy WS" />
                    <DoorButton icon={RotateCcw} label="Modo Normal" sublabel="Repor estado" color="slate" loading={sending === 'lockctrl{"fuc":4}'} disabled={!isTimmy} onClick={() => handleDoorAction('normal')} disabledReason="Apenas Timmy WS" />
                    <DoorButton icon={BellOff} label="Cancelar Alarme" sublabel="Silenciar" color="violet" loading={sending === 'lockctrl{"fuc":6}'} disabled={!isTimmy} onClick={() => handleAlarm(true)} disabledReason="Apenas Timmy WS" />
                    <DoorButton icon={Power} label="Reiniciar" sublabel="Reboot terminal" color="orange" loading={sending === 'reboot{}'} onClick={() => sendCmd('reboot', {}, 'Terminal a reiniciar...')} confirm="Tem a certeza que quer reiniciar o terminal?" />
                  </div>
                </div>
              </div>

              {/* Bloco de Operações Recentes (Retângulo Verde - Alinhado à Direita/Abaixo) */}
              <div className="bg-white border border-slate-200 rounded-xl p-0 flex flex-col overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                  <h3 className="text-slate-900 font-semibold text-xs flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Operações Recentes
                  </h3>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600" onClick={() => queryClient.invalidateQueries(['op-logs-acesso'])}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
                  {opLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 py-8">
                      <p className="text-xs">Sem operações registadas</p>
                    </div>
                  ) : (
                    opLogs.map(log => (
                      <div key={log.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-100 shadow-sm">
                        {log.sucesso ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap justify-between">
                            <Badge className="text-[9px] bg-slate-100 text-slate-600 border-slate-200 px-1.5 font-medium">{log.acao}</Badge>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT', { timeZone: userTimezone || 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-700 mt-1 leading-relaxed break-words">{log.mensagem || '—'}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : (
            /* Estado Vazio Inteligente — Mantém a UI limpa dentro da caixa azul */
            <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl bg-white p-8 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3 border border-slate-100">
                <Shield className="h-6 w-6 text-slate-300" />
              </div>
              <p className="text-slate-500 text-sm font-medium">Selecione um terminal na barra lateral esquerda para iniciar o controlo e monitorização.</p>
            </div>
          )}
        </div>

      </div>

      {/* Suporte Mobile (Opcional — Aciona Dialog se necessário em telas pequenas) */}
      {terminal && (
        <div className="lg:hidden p-4 bg-white border-t border-slate-200 shrink-0">
          <Button onClick={() => setMobileCmdOpen(true)} className="w-full bg-slate-900 text-white text-xs">
            Ver Painel de Controlo do Terminal
          </Button>
          <Dialog open={mobileCmdOpen} onOpenChange={setMobileCmdOpen}>
            <DialogContent className="w-[95vw] max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{terminal.nome}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <DoorButton icon={DoorOpen} label="Abrir Porta" color="emerald" onClick={() => sendCmd('opendoor', {}, 'Porta aberta')} />
                <DoorButton icon={Unlock} label="Aberto Forçado" color="amber" active={doorState === 'unlock'} disabled={!isTimmy} onClick={() => handleDoorAction('unlock')} />
                <DoorButton icon={Lock} label="Bloquear" color="red" active={doorState === 'lock'} disabled={!isTimmy} onClick={() => handleDoorAction('lock')} />
                <DoorButton icon={RotateCcw} label="Modo Normal" color="slate" disabled={!isTimmy} onClick={() => handleDoorAction('normal')} />
                <DoorButton icon={BellOff} label="Cancelar Alarme" color="violet" disabled={!isTimmy} onClick={() => handleAlarm(true)} />
                <DoorButton icon={Power} label="Reiniciar" color="orange" onClick={() => sendCmd('reboot', {}, 'A reiniciar...')} confirm="Reiniciar terminal?" />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function DoorButton({ icon: Icon, label, sublabel, color, loading, onClick, disabled, active, disabledReason, confirm }) {
  const colorMap = {
    emerald: { btn: 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500', active: 'ring-2 ring-emerald-400' },
    amber:   { btn: 'bg-amber-600 hover:bg-amber-700 border-amber-500',   active: 'ring-2 ring-amber-400' },
    red:     { btn: 'bg-red-700 hover:bg-red-800 border-red-600',         active: 'ring-2 ring-red-400' },
    slate:   { btn: 'bg-slate-600 hover:bg-slate-700 border-slate-500',   active: 'ring-2 ring-slate-400' },
    violet:  { btn: 'bg-violet-700 hover:bg-violet-800 border-violet-600',active: 'ring-2 ring-violet-400' },
    orange:  { btn: 'bg-orange-700 hover:bg-orange-800 border-orange-600',active: 'ring-2 ring-orange-400' },
  };
  const c = colorMap[color] || colorMap.slate;

  const handleClick = () => {
    if (confirm && !window.confirm(confirm)) return;
    onClick();
  };

  return (
    <button
      disabled={disabled || loading}
      onClick={handleClick}
      title={disabled ? disabledReason : undefined}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 p-3.5 rounded-xl border text-white transition-all shadow-sm',
        c.btn,
        active && c.active,
        (disabled || loading) && 'opacity-30 cursor-not-allowed'
      )}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
      <div className="text-center">
        <p className="text-xs font-bold leading-tight">{label}</p>
        {sublabel && <p className="text-[9px] opacity-70 mt-0.5">{sublabel}</p>}
      </div>
    </button>
  );
}