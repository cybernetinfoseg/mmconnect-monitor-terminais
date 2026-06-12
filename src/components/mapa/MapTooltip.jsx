import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, X, Wifi, LockOpen, LockKeyhole, DoorOpen, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import TerminalIcon from './TerminalIcon';
import { toast } from 'sonner';

const DOOR_ACTIONS = [
  {
    key: 'lockctrl',
    params: { mode: 'open' },
    label: 'Forçar Porta Aberta',
    desc: 'Mantém a porta permanentemente aberta',
    icon: LockOpen,
    color: 'violet',
  },
  {
    key: 'lockctrl',
    params: { mode: 'close' },
    label: 'Forçar Porta Fechada',
    desc: 'Cancela o estado forçado / fecha a porta',
    icon: LockKeyhole,
    color: 'slate',
  },
  {
    key: 'opendoor',
    params: {},
    label: 'Abrir Momentaneamente',
    desc: 'Abre e fecha automaticamente (1 pulso)',
    icon: DoorOpen,
    color: 'amber',
  },
];

const COLOR_MAP = {
  violet: 'bg-violet-50 border-violet-200 text-violet-800 hover:bg-violet-100',
  slate:  'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
  amber:  'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100',
};

// Smart tooltip that stays inside the map
// posX/posY are percentages (0-100) of the marker inside the map
export default function MapTooltip({ terminal, posX, posY, onClose }) {
  const [loadingAction, setLoadingAction] = useState(null);

  if (!terminal) return null;

  // Decide tooltip direction based on marker position
  const goLeft = posX > 65;
  const goUp = posY > 60;

  const style = {
    position: 'absolute',
    zIndex: 50,
    ...(goLeft
      ? { right: `${100 - posX + 3}%` }
      : { left: `${posX + 3}%` }),
    ...(goUp
      ? { bottom: `${100 - posY + 3}%` }
      : { top: `${posY + 3}%` }),
  };

  const statusLabel = terminal.status === 'online' ? 'ONLINE'
    : terminal.status === 'warning' ? 'AVISO'
    : terminal.status === 'offline' ? 'OFFLINE'
    : 'DESCONHECIDO';

  const statusClass = terminal.status === 'online'
    ? 'bg-emerald-100 text-emerald-700'
    : terminal.status === 'warning'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700';

  // Only show door commands for supported terminal types
  const supportsLockCtrl = ['websocket_cloud', 'adms_push', 'sdk_tcp', 'ip_publico', 'dns', 'ip_local'].includes(terminal.tipo_conexao);

  const handleAction = async (action) => {
    const actionId = action.key + JSON.stringify(action.params);
    setLoadingAction(actionId);
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminal.id,
        action: action.key,
        params: action.params,
      });
      if (resp.data?.success) {
        toast.success(`${action.label} — OK`);
      } else {
        toast.error(resp.data?.error || resp.data?.message || 'Erro ao executar comando');
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Erro desconhecido');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.12 }}
      style={style}
      className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3 w-64 pointer-events-auto"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pr-5">
        <TerminalIcon terminal={terminal} size={28} />
        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{terminal.nome}</p>
      </div>

      {terminal.local && (
        <p className="text-xs text-slate-500 mb-0.5 truncate">📍 {terminal.local}</p>
      )}
      {terminal.latencia_ms != null && (
        <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
          <Wifi className="h-3 w-3" /> {terminal.latencia_ms}ms
        </p>
      )}

      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold mb-3",
        statusClass
      )}>
        {terminal.status === 'online'
          ? <CheckCircle2 className="h-3 w-3" />
          : <AlertTriangle className="h-3 w-3" />}
        {statusLabel}
      </div>

      {/* Door commands */}
      {supportsLockCtrl && (
        <div className="border-t border-slate-100 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
            <LockOpen className="h-3 w-3" /> Estado da Porta
          </p>
          {DOOR_ACTIONS.map((action) => {
            const Icon = action.icon;
            const actionId = action.key + JSON.stringify(action.params);
            const isLoading = loadingAction === actionId;
            return (
              <button
                key={actionId}
                onClick={() => handleAction(action)}
                disabled={!!loadingAction}
                className={cn(
                  'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all text-xs',
                  COLOR_MAP[action.color],
                  loadingAction && loadingAction !== actionId ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                )}
              >
                {isLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  : <Icon className="h-3.5 w-3.5 shrink-0" />
                }
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">{action.label}</p>
                  <p className="text-[10px] opacity-70 leading-tight mt-0.5">{action.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}