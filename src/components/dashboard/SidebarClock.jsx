import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { useUserTimezone } from '@/hooks/useUserTimezone';

export default function SidebarClock() {
  const [now, setNow] = useState(new Date());
  const { timezone } = useUserTimezone();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  let time = '--:--:--';
  let date = '';
  let tzLabel = '';
  try {
    time = now.toLocaleTimeString('pt-PT', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    date = now.toLocaleDateString('pt-PT', { timeZone: timezone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    // Mostrar abreviação da timezone (ex: BST, WET, BRT)
    tzLabel = now.toLocaleTimeString('en-GB', { timeZone: timezone, timeZoneName: 'short' }).split(' ').pop();
  } catch {
    time = now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    date = now.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
          {time}
          {tzLabel && <span className="ml-1 text-[10px] text-slate-400 font-normal">{tzLabel}</span>}
        </p>
        <p className="text-[10px] text-slate-400 capitalize">{date}</p>
      </div>
    </div>
  );
}