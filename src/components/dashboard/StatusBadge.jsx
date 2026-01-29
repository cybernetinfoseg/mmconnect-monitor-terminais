import React from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export default function StatusBadge({ status, pulse = true }) {
  const isOnline = status === 'online';
  
  return (
    <div className={cn(
      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider',
      isOnline 
        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
        : 'bg-red-500/10 text-red-600 border border-red-500/20'
    )}>
      <span className="relative flex h-2 w-2">
        {pulse && (
          <motion.span
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              isOnline ? 'bg-emerald-500' : 'bg-red-500'
            )}
          />
        )}
        <span className={cn(
          'relative inline-flex rounded-full h-2 w-2',
          isOnline ? 'bg-emerald-500' : 'bg-red-500'
        )} />
      </span>
      {isOnline ? 'Online' : 'Offline'}
    </div>
  );
}