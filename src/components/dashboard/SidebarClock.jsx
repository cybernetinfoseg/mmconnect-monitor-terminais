import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

export default function SidebarClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{time}</p>
        <p className="text-[10px] text-slate-400 capitalize">{date}</p>
      </div>
    </div>
  );
}