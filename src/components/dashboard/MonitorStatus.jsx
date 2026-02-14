import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Clock, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import moment from 'moment';

export default function MonitorStatus({ terminal }) {
  const hasRecentCheck = terminal.ultimo_check && 
    moment().diff(moment(terminal.ultimo_check), 'minutes') < 10;

  const getStatusInfo = () => {
    if (!hasRecentCheck) {
      return {
        icon: Clock,
        color: 'text-slate-400',
        bg: 'bg-slate-100',
        text: 'Aguardando verificação'
      };
    }

    if (terminal.status === 'online') {
      return {
        icon: CheckCircle,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        text: 'Conectado'
      };
    }

    return {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      text: 'Sem conexão'
    };
  };

  const info = getStatusInfo();
  const Icon = info.icon;

  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg', info.bg)}>
      <Icon className={cn('h-4 w-4', info.color)} />
      <div className="flex-1">
        <p className={cn('text-xs font-medium', info.color)}>
          {info.text}
        </p>
        {terminal.ultimo_check && (
          <p className="text-xs text-slate-400">
            Verificado {moment(terminal.ultimo_check).fromNow()}
          </p>
        )}
      </div>
    </div>
  );
}