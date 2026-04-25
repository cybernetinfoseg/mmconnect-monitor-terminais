import React, { useState } from 'react';
import { FABRICANTE_ICON_SVGS, TYPE_ICON_SVGS, MARKER_SIZES } from './FloorPlanCanvas';
import { cn } from '@/lib/utils';
import { X, Check } from 'lucide-react';

const ICON_OPTIONS = [
  { key: 'zkteco',          label: 'ZKTeco' },
  { key: 'timmy',           label: 'Timmy/THbio' },
  { key: 'suprema',         label: 'Suprema' },
  { key: 'anviz',           label: 'Anviz' },
  { key: 'hikvision',       label: 'Hikvision' },
  { key: 'dahua',           label: 'Dahua' },
  { key: 'nitgen',          label: 'Nitgen' },
  { key: 'outro',           label: 'Outro' },
  { key: 'ip_local',        label: 'IP Local', svgMap: 'tipo' },
  { key: 'ip_publico',      label: 'IP Público', svgMap: 'tipo' },
  { key: 'p2s',             label: 'P2S/WiFi', svgMap: 'tipo' },
  { key: 'websocket_cloud', label: 'Cloud', svgMap: 'tipo' },
  { key: 'heartbeat',       label: 'Heartbeat', svgMap: 'tipo' },
];

const SIZE_OPTIONS = [
  { value: 'small',  label: 'P' },
  { value: 'medium', label: 'M' },
  { value: 'large',  label: 'G' },
];

function getSvg(key, svgMap) {
  if (svgMap === 'tipo') return TYPE_ICON_SVGS[key] || TYPE_ICON_SVGS.default;
  return FABRICANTE_ICON_SVGS[key] || TYPE_ICON_SVGS.default;
}

export default function MarkerEditPopup({ terminal, anchorX, anchorY, containerSize, currentConfig, onSave, onClose }) {
  const [selectedIcon, setSelectedIcon] = useState(currentConfig.iconKey || terminal.fabricante || 'outro');
  const [selectedSize, setSelectedSize] = useState(currentConfig.size || 'medium');

  // Compute popup position to stay inside canvas
  const PW = 240; const PH = 220;
  let left = anchorX + 20;
  let top = anchorY - 20;
  if (left + PW > containerSize.w) left = anchorX - PW - 10;
  if (left < 4) left = 4;
  if (top + PH > containerSize.h) top = containerSize.h - PH - 4;
  if (top < 4) top = 4;

  return (
    <div
      className="absolute z-[60] bg-white border border-violet-200 rounded-xl shadow-2xl p-3"
      style={{ left, top, width: PW }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-700 truncate max-w-[160px]" title={terminal.nome}>
          {terminal.nome}
        </p>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-100 text-slate-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Icon grid */}
      <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">Ícone</p>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {ICON_OPTIONS.map(opt => {
          const svg = getSvg(opt.key, opt.svgMap);
          const isActive = selectedIcon === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSelectedIcon(opt.key)}
              title={opt.label}
              className={cn(
                "flex flex-col items-center gap-0.5 p-1.5 rounded-lg border transition-all",
                isActive
                  ? "border-violet-500 bg-violet-50"
                  : "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
              )}
            >
              <span
                className={isActive ? "text-violet-700" : "text-slate-600"}
                style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              <span className="text-[8px] text-slate-500 leading-none truncate w-full text-center">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Size */}
      <p className="text-[10px] text-slate-400 font-semibold uppercase mb-1.5">Tamanho</p>
      <div className="flex gap-1.5 mb-3">
        {SIZE_OPTIONS.map(s => (
          <button
            key={s.value}
            onClick={() => setSelectedSize(s.value)}
            className={cn(
              "flex-1 py-1 text-xs font-semibold rounded-lg border transition-all",
              selectedSize === s.value
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-slate-200 hover:border-violet-300 text-slate-600"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => onSave({ iconKey: selectedIcon, size: selectedSize })}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        <Check className="w-3.5 h-3.5" /> Aplicar
      </button>
    </div>
  );
}