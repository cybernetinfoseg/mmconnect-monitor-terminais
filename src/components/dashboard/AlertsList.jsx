import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserTimezone } from '@/hooks/useUserTimezone';

export default function AlertsList({ alerts, maxItems = 5 }) {
  const { timezone: userTimezone } = useUserTimezone();
  const recentAlerts = [...alerts]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, maxItems);

  if (recentAlerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400">
        <CheckCircle className="h-12 w-12 mb-3" />
        <p className="text-sm font-medium">Nenhum incidente recente</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {recentAlerts.map((alert, index) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: index * 0.05 }}
            className={cn(
              "relative overflow-hidden rounded-xl border p-4 transition-all",
              alert.tipo === 'offline' && !alert.resolvido
                ? "bg-red-50/50 border-red-200"
                : alert.tipo === 'restored'
                  ? "bg-emerald-50/50 border-emerald-200"
                  : "bg-slate-50/50 border-slate-200"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "rounded-lg p-2",
                alert.tipo === 'offline' && !alert.resolvido
                  ? "bg-red-100 text-red-600"
                  : alert.tipo === 'restored'
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-slate-100 text-slate-600"
              )}>
                {alert.tipo === 'offline' && !alert.resolvido 
                  ? <AlertTriangle className="h-4 w-4" />
                  : <CheckCircle className="h-4 w-4" />
                }
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 truncate">
                    {alert.terminal_nome}
                  </p>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    alert.tipo === 'offline' && !alert.resolvido
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                  )}>
                    {alert.tipo === 'offline' ? 'Offline' : 'Restaurado'}
                  </span>
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {alert.local}
                  </span>

                </div>
                
                <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {alert.timestamp ? new Date(alert.timestamp).toLocaleString('pt-PT', { timeZone: userTimezone || 'UTC', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  {alert.duracao_minutos && (
                    <span className="ml-2">
                      • Duração: {alert.duracao_minutos}min
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}