import React from 'react';
import { Wifi, WifiOff, Monitor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export default function TerminalStatusWidget({ total, online, offline }) {
  const pct = total > 0 ? Math.round((online / total) * 100) : 0;
  const color = pct >= 80 ? 'emerald' : pct >= 50 ? 'amber' : 'red';

  const colorMap = {
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    amber:   { bar: 'bg-amber-500',   text: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-100' },
    red:     { bar: 'bg-red-500',     text: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-100' },
  };
  const c = colorMap[color];

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50 h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wider flex items-center gap-2">
          <Monitor className="h-4 w-4 text-blue-500" />
          Status dos Terminais
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Big % */}
        <div className={cn("rounded-xl p-4 text-center border", c.bg, c.border)}>
          <p className={cn("text-4xl font-bold", c.text)}>{pct}%</p>
          <p className="text-sm text-slate-500 mt-1">disponibilidade</p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>{online} online</span>
            <span>{offline} offline</span>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", c.bar)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-slate-700">{total}</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-600">{online}</p>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-0.5">
              <Wifi className="h-3 w-3" /> Online
            </p>
          </div>
          <div>
            <p className="text-xl font-bold text-red-500">{offline}</p>
            <p className="text-xs text-slate-400 flex items-center justify-center gap-0.5">
              <WifiOff className="h-3 w-3" /> Offline
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}