import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TerminalIcon, { ICON_TYPES } from './TerminalIcon';

// Panel to configure icon type per terminal and global icon size
export default function MarkerConfigPanel({ terminals, iconOverrides, onIconChange, iconSize, onSizeChange, onClose }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="absolute right-2 top-12 z-40 bg-white rounded-xl shadow-2xl border border-slate-200 w-72 max-h-[420px] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-800">Configurar Marcadores</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Global size */}
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-600">Tamanho dos ícones</span>
          <span className="text-xs font-bold text-rose-600 tabular-nums">{iconSize}px</span>
        </div>
        <input
          type="range"
          min={24}
          max={64}
          step={4}
          value={iconSize}
          onChange={e => onSizeChange(Number(e.target.value))}
          className="w-full accent-rose-600 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
          <span>Pequeno</span>
          <span>Grande</span>
        </div>
      </div>

      {/* Per-terminal icon */}
      <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
        <p className="px-4 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ícone por terminal</p>
        {terminals.map(t => {
          const currentIcon = iconOverrides[t.id] || t.fabricante || 'outro';
          const isOpen = expanded === t.id;
          return (
            <div key={t.id}>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(isOpen ? null : t.id)}
              >
                <TerminalIcon terminal={{ ...t, fabricante: currentIcon }} size={28} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{t.nome}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{currentIcon}</p>
                </div>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
              </button>

              {isOpen && (
                <div className="px-4 pb-3 grid grid-cols-4 gap-2">
                  {ICON_TYPES.map(type => (
                    <button
                      key={type.key}
                      onClick={() => { onIconChange(t.id, type.key); setExpanded(null); }}
                      className={cn(
                        "flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center transition-all",
                        currentIcon === type.key
                          ? "border-rose-400 bg-rose-50"
                          : "border-slate-100 hover:border-slate-300 bg-white"
                      )}
                      title={type.label}
                    >
                      <TerminalIcon terminal={{ ...t, fabricante: type.key }} size={28} />
                      <span className="text-[9px] text-slate-500 leading-tight">{type.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {terminals.length === 0 && (
          <p className="px-4 py-4 text-xs text-slate-400 text-center">Nenhum terminal nesta planta</p>
        )}
      </div>
    </div>
  );
}