import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  Shield, DoorOpen, DoorClosed, Lock, Unlock, Power,
  AlertTriangle, RefreshCw, Info, Users, Clock,
  CheckCircle2, XCircle, Loader2, Zap, Bell, BellOff,
  ChevronDown, ChevronRight, Wifi, WifiOff, Settings,
  RotateCcw, Trash2, Eye, Ban, UserCheck
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Constantes ───────────────────────────────────────────────────────────────

const DOOR_STATES = {
  normal:  { label: 'Modo Normal',    icon: DoorOpen,   color: 'bg-emerald-500', fuc: null,  desc: 'Acesso pelo método configurado' },
  unlock:  { label: 'Aberto Forçado', icon: Unlock,     color: 'bg-amber-500',  fuc: 1,    desc: 'Porta desbloqueada permanentemente' },
  lock:    { label: 'Fechado Forçado',icon: Lock,       color: 'bg-red-600',    fuc: 2,    desc: 'Porta bloqueada, ninguém entra' },
  temp:    { label: 'Abertura Temp.', icon: DoorOpen,   color: 'bg-blue-500',   fuc: 3,    desc: 'Abre brevemente e fecha sozinha' },
  reset:   { label: 'Reset Relay',    icon: RotateCcw,  color: 'bg-slate-500',  fuc: 4,    desc: 'Repõe o estado normal do relay' },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ControloAcesso() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [sending, setSending] = useState(null);
  const [doorState, setDoorState] = useState('normal');
  const [devInfo, setDevInfo] = useState(null);
  const [devInfoLoading, setDevInfoLoading] = useState(false);
  const [userList, setUserList] = useState(null);
  const [userListLoading, setUserListLoading] = useState(false);
  const [blockingUser, setBlockingUser] = useState(null);
  const [expandedSection, setExpandedSection] = useState('door');
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

  const { data: scheduledActions = [] } = useQuery({
    queryKey: ['scheduled-acesso', selectedTerminal?.id],
    queryFn: () => base44.entities.ScheduledAction.filter({ terminal_id: selectedTerminal?.id }, '-created_date', 10),
    enabled: !!selectedTerminal,
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
  const isZKTeco = terminal?.fabricante === 'zkteco' || terminal?.tipo_conexao === 'adms_push' || terminal?.tipo_conexao === 'sdk_tcp';

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
        // Abertura temporária — usar opendoor simples
        await sendCmd('opendoor', {}, 'Porta aberta temporariamente');
        setDoorState('temp');
        setTimeout(() => setDoorState('normal'), 5000);
      } else {
        await sendCmd('lockctrl', { fuc: state.fuc }, state.label);
        setDoorState(stateKey);
      }
    }
  };

  const handleGetDevInfo = async () => {
    setDevInfoLoading(true);
    const data = await sendCmd('getdevinfo', {}, 'Informação obtida');
    if (data?.data) setDevInfo(data.data);
    setDevInfoLoading(false);
  };

  const handleGetUserList = async () => {
    setUserListLoading(true);
    const data = await sendCmd('getuserlist', { count: 200 }, 'Lista de utilizadores obtida');
    if (data?.data?.users) setUserList(data.data.users);
    setUserListLoading(false);
  };

  const handleBlockUser = async (enrollid, block) => {
    setBlockingUser(enrollid);
    await sendCmd('blockuser', { enrollid, block }, block ? `Utilizador ${enrollid} bloqueado` : `Utilizador ${enrollid} desbloqueado`);
    setBlockingUser(null);
  };

  const handleAlarm = async (cancelar) => {
    await sendCmd('lockctrl', { fuc: 6 }, cancelar ? 'Alarme cancelado' : 'Alarme acionado');
  };

  const Section = ({ id, title, icon: Icon, children, defaultOpen = false }) => {
    const open = expandedSection === id;
    return (
      <Card className="bg-white border-slate-200 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          onClick={() => setExpandedSection(open ? null : id)}
        >
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-500" />
            <span className="font-semibold text-slate-700 text-sm">{title}</span>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </button>
        {open && <div className="px-4 pb-4 border-t border-slate-100">{children}</div>}
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900/60 border border-blue-700/50 rounded-xl shrink-0">
              <Shield className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">Controlo de Acesso</h1>
              <p className="text-xs text-slate-400">Gestão remota de portas e perímetros</p>
            </div>
          </div>
          {terminal && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium',
                terminal.status === 'online'
                  ? 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400'
                  : 'bg-red-900/40 border-red-700/50 text-red-400'
              )}>
                {terminal.status === 'online' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {terminal.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          )}
        </div>

        {/* Seleção de terminal */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <label className="text-xs text-slate-400 font-medium block mb-2">Selecionar Terminal</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {terminaisAcesso.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTerminal(t); setDevInfo(null); setUserList(null); setDoorState('normal'); setExpandedSection('door'); }}
                className={cn(
                  'flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all',
                  selectedTerminal?.id === t.id
                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                    : 'bg-slate-700/40 border-slate-600/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-500'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-400' : 'bg-slate-500')} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{t.nome}</p>
                  <p className="text-[10px] opacity-70 truncate">{t.local || t.fabricante || t.tipo_conexao}</p>
                </div>
              </button>
            ))}
            {terminaisAcesso.length === 0 && (
              <p className="text-slate-500 text-xs col-span-full py-4 text-center">Nenhum terminal disponível para controlo</p>
            )}
          </div>
        </div>

        {!terminal ? (
          <div className="text-center py-16">
            <Shield className="h-16 w-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 font-medium">Selecione um terminal para iniciar o controlo</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Coluna esquerda — Painel de porta */}
            <div className="lg:col-span-2 space-y-4">

              {/* Painel principal de porta */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-white font-bold text-base">{terminal.nome}</h2>
                    <p className="text-slate-400 text-xs">{terminal.local} · {terminal.fabricante?.toUpperCase() || 'Terminal'} · {terminal.tipo_conexao}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border',
                    doorState === 'normal' ? 'bg-emerald-900/50 border-emerald-600/50 text-emerald-400' :
                    doorState === 'unlock' ? 'bg-amber-900/50 border-amber-600/50 text-amber-400' :
                    doorState === 'lock'   ? 'bg-red-900/50 border-red-600/50 text-red-400' :
                    'bg-blue-900/50 border-blue-600/50 text-blue-400'
                  )}>
                    {React.createElement(DOOR_STATES[doorState].icon, { className: 'h-3.5 w-3.5' })}
                    {DOOR_STATES[doorState].label}
                  </div>
                </div>

                {/* Botões de controlo de porta */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

                  {/* ABRIR (pulso) */}
                  <DoorButton
                    icon={DoorOpen}
                    label="Abrir Porta"
                    sublabel="Pulso único"
                    color="emerald"
                    loading={sending === 'opendoor{}'}
                    onClick={() => sendCmd('opendoor', {}, 'Porta aberta')}
                  />

                  {/* ABERTO FORÇADO */}
                  <DoorButton
                    icon={Unlock}
                    label="Aberto Forçado"
                    sublabel="Permanente"
                    color="amber"
                    active={doorState === 'unlock'}
                    loading={sending === 'lockctrl{"fuc":1}'}
                    disabled={!isTimmy}
                    onClick={() => handleDoorAction('unlock')}
                    disabledReason="Apenas Timmy WS"
                  />

                  {/* FECHADO FORÇADO */}
                  <DoorButton
                    icon={Lock}
                    label="Bloquear"
                    sublabel="Nenhum acesso"
                    color="red"
                    active={doorState === 'lock'}
                    loading={sending === 'lockctrl{"fuc":2}'}
                    disabled={!isTimmy}
                    onClick={() => handleDoorAction('lock')}
                    disabledReason="Apenas Timmy WS"
                  />

                  {/* RESET / NORMAL */}
                  <DoorButton
                    icon={RotateCcw}
                    label="Modo Normal"
                    sublabel="Repor estado"
                    color="slate"
                    loading={sending === 'lockctrl{"fuc":4}'}
                    disabled={!isTimmy}
                    onClick={() => handleDoorAction('normal')}
                    disabledReason="Apenas Timmy WS"
                  />

                  {/* ALARME OFF */}
                  <DoorButton
                    icon={BellOff}
                    label="Cancelar Alarme"
                    sublabel="Silenciar"
                    color="violet"
                    loading={sending === 'lockctrl{"fuc":6}'}
                    disabled={!isTimmy}
                    onClick={() => handleAlarm(true)}
                    disabledReason="Apenas Timmy WS"
                  />

                  {/* REBOOT */}
                  <DoorButton
                    icon={Power}
                    label="Reiniciar"
                    sublabel="Reboot terminal"
                    color="orange"
                    loading={sending === 'reboot{}'}
                    onClick={() => sendCmd('reboot', {}, 'Terminal a reiniciar...')}
                    confirm="Tem a certeza que quer reiniciar o terminal?"
                  />
                </div>

                {/* Sincronizar hora */}
                <div className="flex gap-2 pt-1 border-t border-slate-700/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent gap-1.5"
                    disabled={!!sending}
                    onClick={() => sendCmd('settime', {}, 'Relógio sincronizado')}
                  >
                    {sending === 'settime{}' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    Sincronizar Relógio
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs border-slate-600 text-slate-300 hover:bg-slate-700 bg-transparent gap-1.5"
                    disabled={!!sending || devInfoLoading}
                    onClick={handleGetDevInfo}
                  >
                    {devInfoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Info className="h-3.5 w-3.5" />}
                    Info Dispositivo
                  </Button>
                </div>

                {/* Device Info */}
                {devInfo && (
                  <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 text-xs space-y-1.5">
                    <p className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Informação do Dispositivo</p>
                    {Object.entries(devInfo).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                        <span className="text-slate-200 font-mono text-right truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agendamentos ativos */}
              <Section id="schedule" title={`Agendamentos (${scheduledActions.length})`} icon={Clock}>
                <div className="pt-3 space-y-2">
                  {scheduledActions.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Sem agendamentos para este terminal</p>
                  ) : scheduledActions.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                      <div>
                        <p className="text-xs font-medium text-slate-800">{s.nome}</p>
                        <div className="flex gap-2 mt-0.5">
                          <Badge className="text-[10px] bg-slate-200 text-slate-600">{s.acao}</Badge>
                          <Badge className="text-[10px] bg-blue-100 text-blue-700">{s.frequencia} · {s.hora}</Badge>
                          {!s.ativo && <Badge className="text-[10px] bg-orange-100 text-orange-700">Inativo</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {s.ultimo_resultado === 'sucesso' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                         s.ultimo_resultado === 'falha' ? <XCircle className="h-4 w-4 text-red-400" /> : null}
                      </div>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-400 text-center">Gerencie os agendamentos na página <a href="/Agendamentos" className="underline text-blue-500">Agendamentos</a></p>
                </div>
              </Section>

              {/* Gestão de utilizadores no terminal */}
              {isTimmy && (
                <Section id="users" title="Utilizadores no Terminal" icon={Users}>
                  <div className="pt-3 space-y-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs gap-1.5"
                      disabled={userListLoading || !!sending}
                      onClick={handleGetUserList}
                    >
                      {userListLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      Obter Lista do Terminal
                    </Button>
                    {userList && (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {userList.map(u => (
                          <div key={u.enrollid} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50">
                            <div>
                              <p className="text-xs font-medium text-slate-800">{u.name || `ID:${u.enrollid}`}</p>
                              <p className="text-[10px] text-slate-400 font-mono">#{u.enrollid} · priv:{u.admin ?? 0}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px] text-amber-600 border-amber-200 hover:bg-amber-50"
                                disabled={blockingUser === u.enrollid}
                                onClick={() => handleBlockUser(u.enrollid, true)}
                              >
                                {blockingUser === u.enrollid ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3 mr-1" />}
                                Bloquear
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[10px] text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                                disabled={blockingUser === u.enrollid}
                                onClick={() => handleBlockUser(u.enrollid, false)}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                Desbloquear
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Operações de manutenção avançadas */}
              {isAdmin && (
                <Section id="advanced" title="Operações Avançadas" icon={Settings}>
                  <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {isTimmy && (
                      <>
                        <ActionButton
                          icon={Eye}
                          label="Ver Parâmetros"
                          color="blue"
                          disabled={!!sending}
                          onClick={() => sendCmd('getparam', {}, 'Parâmetros obtidos')}
                        />
                        <ConfirmActionButton
                          icon={Trash2}
                          label="Limpar Logs"
                          sublabel="Remove logs do terminal"
                          color="orange"
                          disabled={!!sending}
                          onClick={() => sendCmd('clearlog', {}, 'Logs eliminados do terminal')}
                          confirmMsg="Atenção: esta ação elimina TODOS os logs do terminal. Continuar?"
                        />
                        <ConfirmActionButton
                          icon={Users}
                          label="Limpar Utilizadores"
                          sublabel="Remove todos os utlizadores"
                          color="red"
                          disabled={!!sending}
                          onClick={() => sendCmd('clearusers', {}, 'Utilizadores eliminados do terminal')}
                          confirmMsg="Atenção: esta ação elimina TODOS os utilizadores do terminal. Continuar?"
                        />
                        <ConfirmActionButton
                          icon={RotateCcw}
                          label="Reset de Fábrica"
                          sublabel="Inicializa o terminal"
                          color="red"
                          disabled={!!sending}
                          onClick={() => sendCmd('initdevice', {}, 'Terminal inicializado (reset fábrica)')}
                          confirmMsg="ATENÇÃO CRÍTICA: Reset de fábrica irá apagar TUDO. Tem a certeza?"
                        />
                      </>
                    )}
                  </div>
                </Section>
              )}
            </div>

            {/* Coluna direita — Logs */}
            <div className="space-y-4">
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Operações Recentes
                  </h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-slate-400 hover:text-white"
                    onClick={() => queryClient.invalidateQueries(['op-logs-acesso'])}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {opLogs.length === 0 ? (
                    <p className="text-slate-500 text-xs text-center py-6">Sem operações registadas</p>
                  ) : opLogs.map(log => (
                    <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/40 border border-slate-700/30">
                      {log.sucesso
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[9px] bg-slate-700 text-slate-300 px-1.5">{log.acao}</Badge>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 mt-0.5 truncate">{log.mensagem || '—'}</p>
                        <p className="text-[10px] text-slate-500 truncate">{log.executado_por}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Referência rápida de ações */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-400" />
                  Referência de Comandos
                </h3>
                <div className="space-y-2">
                  {Object.entries(DOOR_STATES).map(([key, s]) => (
                    <div key={key} className="flex items-center gap-2">
                      <div className={cn('w-2 h-2 rounded-full shrink-0', s.color)} />
                      <div>
                        <p className="text-[11px] text-slate-300 font-medium">{s.label}</p>
                        <p className="text-[10px] text-slate-500">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-700/50 mt-2">
                    <p className="text-[10px] text-slate-500">
                      Comandos avançados (fuc=1–4) requerem terminal <span className="text-blue-400">Timmy WebSocket Cloud</span>.
                      Terminais ZKTeco/Hikvision/Dahua suportam abertura básica.
                    </p>
                  </div>
                </div>
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

function ActionButton({ icon: Icon, label, color, disabled, onClick }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all',
        'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <Icon className="h-4 w-4 text-slate-500" />
      {label}
    </button>
  );
}

function ConfirmActionButton({ icon: Icon, label, sublabel, color, disabled, onClick, confirmMsg }) {
  const colorMap = {
    orange: 'text-orange-600 border-orange-200 hover:bg-orange-50',
    red:    'text-red-600 border-red-200 hover:bg-red-50',
  };
  const handleClick = () => {
    if (!window.confirm(confirmMsg)) return;
    onClick();
  };
  return (
    <button
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all bg-white',
        colorMap[color] || 'text-slate-700 border-slate-200 hover:bg-slate-50',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <Icon className="h-4 w-4" />
      <div>
        <p className="text-xs font-medium">{label}</p>
        {sublabel && <p className="text-[10px] opacity-60">{sublabel}</p>}
      </div>
    </button>
  );
}