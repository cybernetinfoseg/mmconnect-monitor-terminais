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

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
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

  // Terminais suportados para controlo de acesso
  const terminaisAcesso = useMemo(() =>
    terminals.filter(t =>
      t.tipo_conexao === 'websocket_cloud' ||
      t.tipo_conexao === 'adms_push' ||
      t.tipo_conexao === 'sdk_tcp' ||
      ['ip_publico', 'dns', 'ip_local'].includes(t.tipo_conexao)
    ),
    [terminals]
  );

  const terminal = selectedTerminal ? terminals.find(t => t.id === selectedTerminal.id) || selectedTerminal : null;
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
    <div className="min-h-screen bg-slate-50 w-full">
      <div className="w-full max-w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-900 rounded-xl shrink-0">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Controlo de Portas</h1>
              <p className="text-xs text-slate-500">Gestão remota de portas e perímetros</p>
            </div>
          </div>
          {terminal && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium',
                terminal.status === 'online'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              )}>
                {terminal.status === 'online' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {terminal.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          )}
        </div>

        {/* Main Grid Layout (Sempre visível para manter a coluna de seleção ativa) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Coluna Esquerda — Lista de Terminais (Fica sempre visível à esquerda) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-[70vh] overflow-y-auto">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-500" /> Terminais
            </h3>
            <div className="space-y-1">
              {terminaisAcesso.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTerminal(t); setDoorState('normal'); }}
                  className={cn(
                    'w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all',
                    selectedTerminal?.id === t.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{t.nome}</p>
                    <p className="text-[10px] opacity-60 truncate">{t.local || t.fabricante || t.tipo_conexao}</p>
                  </div>
                </button>
              ))}
              {terminaisAcesso.length === 0 && (
                <p className="text-slate-500 text-xs py-4 text-center">Nenhum terminal disponível para controlo</p>
              )}
            </div>
          </div>

          {/* Coluna Central e Direita condicional ao Terminal selecionado (Desktop) */}
          {terminal ? (
            <>
              {/* Coluna Central — Comandos */}
              <div className="hidden lg:block bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-slate-900 font-bold text-base">{terminal.nome}</h2>
                    <p className="text-slate-500 text-xs">{terminal.local} · {terminal.fabricante?.toUpperCase() || 'Terminal'} · {terminal.tipo_conexao}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
                    doorState === 'normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                    doorState === 'unlock' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                    doorState === 'lock'   ? 'bg-red-50 border-red-200 text-red-700' :
                    'bg-blue-50 border-blue-200 text-blue-700'
                  )}>
                    {React.createElement(DOOR_STATES[doorState].icon, { className: 'h-3.5 w-3.5' })}
                    {DOOR_STATES[doorState].label}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DoorButton icon={DoorOpen} label="Abrir Porta" sublabel="Pulso único" color="emerald" loading={sending === 'opendoor{}'} onClick={() => sendCmd('opendoor', {}, 'Porta aberta')} />
                  <DoorButton icon={Unlock} label="Aberto Forçado" sublabel="Permanente" color="amber" active={doorState === 'unlock'} loading={sending === 'lockctrl{"fuc":1}'} disabled={!isTimmy} onClick={() => handleDoorAction('unlock')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={Lock} label="Bloquear" sublabel="Nenhum acesso" color="red" active={doorState === 'lock'} loading={sending === 'lockctrl{"fuc":2}'} disabled={!isTimmy} onClick={() => handleDoorAction('lock')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={RotateCcw} label="Modo Normal" sublabel="Repor estado" color="slate" loading={sending === 'lockctrl{"fuc":4}'} disabled={!isTimmy} onClick={() => handleDoorAction('normal')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={BellOff} label="Cancelar Alarme" sublabel="Silenciar" color="violet" loading={sending === 'lockctrl{"fuc":6}'} disabled={!isTimmy} onClick={() => handleAlarm(true)} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={Power} label="Reiniciar" sublabel="Reboot terminal" color="orange" loading={sending === 'reboot{}'} onClick={() => sendCmd('reboot', {}, 'Terminal a reiniciar...')} confirm="Tem a certeza que quer reiniciar o terminal?" />
                </div>
              </div>

              {/* Coluna Direita — Operações */}
              <div className="hidden lg:block space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-slate-900 font-semibold text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" />Operações Recentes</h3>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-slate-400" onClick={() => queryClient.invalidateQueries(['op-logs-acesso'])}><RefreshCw className="h-3 w-3" /></Button>
                  </div>
                  <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                    {opLogs.length === 0 ? <p className="text-slate-400 text-xs text-center py-6">Sem operações registadas</p> : opLogs.map(log => (
                      <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                        {log.sucesso ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0"><div className="flex items-center gap-1.5 flex-wrap"><Badge className="text-[9px] bg-slate-200 text-slate-600 px-1.5">{log.acao}</Badge><span className="text-[10px] text-slate-400 font-mono">{log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT', { timeZone: userTimezone || 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div><p className="text-[11px] text-slate-700 mt-0.5 truncate">{log.mensagem || '—'}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="hidden lg:flex lg:col-span-2 text-center py-16 items-center justify-center flex-col border border-dashed border-slate-200 rounded-xl bg-white">
              <Shield className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm font-medium">Selecione um terminal na lista para gerir os acessos.</p>
            </div>
          )}
        </div>

        {/* Mobile View: Modal de Comandos e logs inferiores */}
        {terminal && (
          <div className="lg:hidden space-y-4">
            <button
              onClick={() => setMobileCmdOpen(true)}
              className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left flex items-center justify-between shadow-sm"
            >
              <div>
                <p className="text-sm font-bold text-slate-990">{terminal.nome}</p>
                <p className="text-xs text-slate-500">{terminal.local} · {terminal.fabricante?.toUpperCase() || 'Terminal'}</p>
              </div>
              <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
                doorState === 'normal' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                doorState === 'unlock' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                doorState === 'lock' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'
              )}>
                {React.createElement(DOOR_STATES[doorState].icon, { className: 'h-3.5 w-3.5' })}
                {DOOR_STATES[doorState].label}
              </div>
            </button>

            <Dialog open={mobileCmdOpen} onOpenChange={setMobileCmdOpen}>
              <DialogContent className="w-[95vw] max-w-md max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{terminal.nome}</DialogTitle></DialogHeader>
                <p className="text-xs text-slate-500 -mt-2">{terminal.local} · {terminal.fabricante?.toUpperCase() || 'Terminal'} · {terminal.tipo_conexao}</p>

                <div className="grid grid-cols-2 gap-3">
                  <DoorButton icon={DoorOpen} label="Abrir Porta" sublabel="Pulso único" color="emerald" loading={sending === 'opendoor{}'} onClick={() => sendCmd('opendoor', {}, 'Porta aberta')} />
                  <DoorButton icon={Unlock} label="Aberto Forçado" sublabel="Permanente" color="amber" active={doorState === 'unlock'} loading={sending === 'lockctrl{"fuc":1}'} disabled={!isTimmy} onClick={() => handleDoorAction('unlock')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={Lock} label="Bloquear" sublabel="Nenhum acesso" color="red" active={doorState === 'lock'} loading={sending === 'lockctrl{"fuc":2}'} disabled={!isTimmy} onClick={() => handleDoorAction('lock')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={RotateCcw} label="Modo Normal" sublabel="Repor estado" color="slate" loading={sending === 'lockctrl{"fuc":4}'} disabled={!isTimmy} onClick={() => handleDoorAction('normal')} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={BellOff} label="Cancelar Alarme" sublabel="Silenciar" color="violet" loading={sending === 'lockctrl{"fuc":6}'} disabled={!isTimmy} onClick={() => handleAlarm(true)} disabledReason="Apenas Timmy WS" />
                  <DoorButton icon={Power} label="Reiniciar" sublabel="Reboot terminal" color="orange" loading={sending === 'reboot{}'} onClick={() => sendCmd('reboot', {}, 'Terminal a reiniciar...')} confirm="Tem a certeza que quer reiniciar o terminal?" />
                </div>

                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setMobileCmdOpen(false)}>Fechar</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Mobile Operations Log */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-slate-900 font-semibold text-sm mb-3">Operações Recentes</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {opLogs.length === 0 ? <p className="text-slate-400 text-xs text-center py-6">Sem operações</p> : opLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                    {log.sucesso ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0"><Badge className="text-[9px] bg-slate-200 text-slate-600 px-1.5">{log.acao}</Badge><p className="text-[11px] text-slate-700 mt-0.5 truncate">{log.mensagem || '—'}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
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
    blue:    { btn: 'bg-blue-700 hover:bg-blue-800 border-blue-600',      active: 'ring-2 ring-blue-400' },
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
        'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border text-white transition-all',
        c.btn,
        active && c.active,
        (disabled || loading) && 'opacity-40 cursor-not-allowed'
      )}
    >
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Icon className="h-6 w-6" />}
      <div className="text-center">
        <p className="text-xs font-bold">{label}</p>
        {sublabel && <p className="text-[10px] opacity-70">{sublabel}</p>}
      </div>
    </button>
  );
}