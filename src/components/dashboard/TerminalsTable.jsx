import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, MapPin, Clock, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';

export default function TerminalsTable({ terminals, maxRows = 12, compact = false }) {
  const { timezone: userTimezone } = useUserTimezone();
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const sortedTerminals = [...terminals].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortCol === 'nome') return (a.nome || '').localeCompare(b.nome || '') * dir;
    if (sortCol === 'local') return (a.local || '').localeCompare(b.local || '') * dir;
    if (sortCol === 'status') {
      // online < offline quando asc
      if (a.status === b.status) return 0;
      return (a.status === 'online' ? -1 : 1) * dir;
    }
    // default: offline primeiro
    if (a.status !== b.status) return a.status === 'offline' ? -1 : 1;
    return (b.segundos_sem_ping || 0) - (a.segundos_sem_ping || 0);
  });

  const totalPages = maxRows ? Math.ceil(sortedTerminals.length / maxRows) : 1;
  const currentPage = Math.min(page, totalPages || 1);
  const displayTerminals = maxRows
    ? sortedTerminals.slice((currentPage - 1) * maxRows, currentPage * maxRows)
    : sortedTerminals;

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ChevronsUpDown className="h-3 w-3 text-slate-400" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-slate-700" />
      : <ChevronDown className="h-3 w-3 text-slate-700" />;
  };

  const formatTimeSince = (seconds) => {
    if (!seconds || seconds < 0) return '—';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white/80 backdrop-blur-sm">
      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-slate-100">
        <AnimatePresence mode="popLayout">
          {displayTerminals.map((terminal, index) => (
            <motion.div
              key={terminal.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.02 }}
              className={cn(
                "px-4 py-3 transition-colors",
                terminal.status === 'offline' && "bg-red-50/40"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900 text-sm truncate">{terminal.nome}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={terminal.status} />
                  <span className={cn(
                    "font-mono text-xs font-semibold",
                    terminal.status === 'offline' ? 'text-red-600' : 'text-slate-400'
                  )}>
                    {formatTimeSince(terminal.segundos_sem_ping)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                {terminal.local && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{terminal.local}</span>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th
                onClick={() => handleSort('nome')}
                className={cn("text-left font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none", compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-xs")}
              >
                <div className="flex items-center gap-1.5"><Monitor className="h-4 w-4" />Terminal<SortIcon col="nome" /></div>
              </th>
              <th
                onClick={() => handleSort('local')}
                className={cn("text-left font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none", compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-xs")}
              >
                <div className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />Local<SortIcon col="local" /></div>
              </th>
              <th
                onClick={() => handleSort('status')}
                className={cn("text-center font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 select-none", compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-xs")}
              >
                <div className="flex items-center gap-1.5 justify-center">Status<SortIcon col="status" /></div>
              </th>
              <th className={cn("text-left font-semibold text-slate-600 uppercase tracking-wider", compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-xs")}>
                <div className="flex items-center gap-2"><Clock className="h-4 w-4" />Último Ping</div>
              </th>
              <th className={cn("text-right font-semibold text-slate-600 uppercase tracking-wider", compact ? "px-4 py-3 text-xs" : "px-6 py-4 text-xs")}>
                <div className="flex items-center gap-2 justify-end"><AlertTriangle className="h-4 w-4" />Sem Ping</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout">
              {displayTerminals.map((terminal, index) => (
                <motion.tr
                  key={terminal.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn("border-b border-slate-50 transition-colors", terminal.status === 'offline' && "bg-red-50/30", "hover:bg-slate-50/50")}
                >
                  <td className={cn("font-medium text-slate-900", compact ? "px-4 py-3 text-sm" : "px-6 py-4")}>{terminal.nome}</td>
                  <td className={cn("text-slate-600", compact ? "px-4 py-3 text-sm" : "px-6 py-4")}>{terminal.local}</td>

                  <td className={cn("text-center", compact ? "px-4 py-3" : "px-6 py-4")}><StatusBadge status={terminal.status} /></td>
                  <td className={cn("text-slate-500", compact ? "px-4 py-3 text-sm" : "px-6 py-4")}>
                    {terminal.ultimo_ping ? new Date(terminal.ultimo_ping).toLocaleString('pt-PT', { timeZone: userTimezone || 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className={cn("text-right font-mono", compact ? "px-4 py-3 text-sm" : "px-6 py-4", terminal.status === 'offline' ? 'text-red-600 font-semibold' : 'text-slate-500')}>
                    {formatTimeSince(terminal.segundos_sem_ping)}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="px-4 py-3 flex items-center justify-between bg-slate-50/50 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            {(currentPage - 1) * maxRows + 1}–{Math.min(currentPage * maxRows, sortedTerminals.length)} de {sortedTerminals.length} terminais
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <span className="text-xs text-slate-600 px-1">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}