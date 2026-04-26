import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, X, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import TerminalIcon from './TerminalIcon';

// Smart tooltip that stays inside the map
// posX/posY are percentages (0-100) of the marker inside the map
export default function MapTooltip({ terminal, posX, posY, onClose }) {
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.12 }}
      style={style}
      className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3 w-48 pointer-events-auto"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-center gap-2 mb-2 pr-5">
        <TerminalIcon terminal={terminal} size={28} />
        <p className="font-semibold text-slate-900 text-sm leading-tight truncate">{terminal.nome}</p>
      </div>

      {terminal.local && (
        <p className="text-xs text-slate-500 mb-0.5 truncate">📍 {terminal.local}</p>
      )}
      {terminal.cliente_nome && (
        <p className="text-xs text-slate-400 mb-0.5 truncate">🏢 {terminal.cliente_nome}</p>
      )}
      {terminal.modelo && (
        <p className="text-xs text-slate-400 mb-0.5 truncate">🖥 {terminal.modelo}</p>
      )}
      {terminal.latencia_ms != null && (
        <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
          <Wifi className="h-3 w-3" /> {terminal.latencia_ms}ms
        </p>
      )}

      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold",
        statusClass
      )}>
        {terminal.status === 'online'
          ? <CheckCircle2 className="h-3 w-3" />
          : <AlertTriangle className="h-3 w-3" />}
        {statusLabel}
      </div>
    </motion.div>
  );
}