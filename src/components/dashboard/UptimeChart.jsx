import React from 'react';
import { motion } from 'framer-motion';

export default function UptimeChart({ data, compact = false }) {
  const sortedData = [...data]
    .sort((a, b) => a.uptime - b.uptime)
    .slice(0, 10);

  const getColor = (uptime) => {
    if (uptime >= 99) return { bar: '#10b981', bg: '#d1fae5', text: '#065f46' };
    if (uptime >= 95) return { bar: '#22c55e', bg: '#dcfce7', text: '#166534' };
    if (uptime >= 80) return { bar: '#f97316', bg: '#ffedd5', text: '#9a3412' };
    return { bar: '#ef4444', bg: '#fee2e2', text: '#991b1b' };
  };

  if (sortedData.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
        Sem dados para o período selecionado
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sortedData.map((item, i) => {
        const c = getColor(item.uptime);
        const pct = Math.max(0, Math.min(100, item.uptime));
        // Truncate long names
        const name = item.nome?.length > 28 ? item.nome.slice(0, 26) + '…' : (item.nome || '—');

        return (
          <motion.div
            key={item.nome}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="flex items-center gap-2 group"
          >
            {/* Name */}
            <span
              className="text-xs text-slate-600 shrink-0 text-right"
              style={{ width: 140, minWidth: 140 }}
              title={item.nome}
            >
              {name}
            </span>

            {/* Bar track */}
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: c.bar }}
              />
            </div>

            {/* Badge */}
            <span
              className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 w-14 text-center"
              style={{ backgroundColor: c.bg, color: c.text }}
            >
              {pct.toFixed(1)}%
            </span>
          </motion.div>
        );
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100 mt-3">
        {[
          { label: '≥ 99%', color: '#10b981' },
          { label: '95–99%', color: '#22c55e' },
          { label: '80–95%', color: '#f97316' },
          { label: '< 80%', color: '#ef4444' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}