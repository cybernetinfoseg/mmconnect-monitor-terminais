import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { motion } from 'framer-motion';

export default function StatusPieChart({ online, offline, compact = false }) {
  const data = [
    { name: 'Online', value: online, color: '#10b981' },
    { name: 'Offline', value: offline, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const total = online + offline;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percentage = ((item.value / total) * 100).toFixed(1);
      return (
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{item.name}</p>
          <p className="text-2xl font-bold" style={{ color: item.payload.color }}>
            {item.value}
          </p>
          <p className="text-xs text-slate-500">{percentage}% do total</p>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        className="text-sm font-bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative h-full"
    >
      <ResponsiveContainer width="100%" height={compact ? 200 : 280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomLabel}
            innerRadius={compact ? 40 : 60}
            outerRadius={compact ? 80 : 100}
            paddingAngle={2}
            dataKey="value"
            animationBegin={0}
            animationDuration={800}
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.color}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry) => (
              <span className="text-sm font-medium text-slate-700">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      
      {/* Center total */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: compact ? '36px' : '36px' }}>
        <div className="text-center">
          <p className="text-3xl font-bold text-slate-900">{total}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total</p>
        </div>
      </div>
    </motion.div>
  );
}