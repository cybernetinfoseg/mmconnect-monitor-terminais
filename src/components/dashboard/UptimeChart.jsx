import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';

export default function UptimeChart({ data, compact = false }) {
  const sortedData = [...data].sort((a, b) => a.uptime - b.uptime).slice(0, 10);

  const getBarColor = (uptime) => {
    if (uptime >= 99) return '#10b981';
    if (uptime >= 95) return '#22c55e';
    if (uptime >= 90) return '#eab308';
    if (uptime >= 80) return '#f97316';
    return '#ef4444';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{item.nome}</p>
          <p className="text-2xl font-bold" style={{ color: getBarColor(item.uptime) }}>
            {item.uptime.toFixed(2)}%
          </p>
          <p className="text-xs text-slate-500">Uptime no período</p>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-full"
    >
      <ResponsiveContainer width="100%" height={compact ? 200 : 300}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
        >
          <XAxis 
            type="number" 
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            className="text-xs"
          />
          <YAxis 
            type="category" 
            dataKey="nome" 
            width={70}
            tick={{ fontSize: 11 }}
            className="text-slate-600"
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar 
            dataKey="uptime" 
            radius={[0, 4, 4, 0]}
            animationDuration={800}
          >
            {sortedData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.uptime)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}