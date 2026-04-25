import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import MarkerEditPopup from './MarkerEditPopup';

// Ícones biométricos por tipo de conexão (SVG inline como string — renderizado com dangerouslySetInnerHTML)
// Usamos SVG paths simples dentro de um viewBox 0 0 24 24
export const TYPE_ICON_SVGS = {
  ip_local: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    <circle cx="9" cy="10" r="2.5"/><path d="M14 8h3M14 12h3"/>
  </svg>`,
  ip_publico: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M12 2a14 14 0 0 1 0 20M12 2a14 14 0 0 0 0 20M2 12h20"/>
    <circle cx="12" cy="9" r="2"/>
  </svg>`,
  dns: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="20" height="4" rx="1"/><rect x="2" y="14" width="20" height="4" rx="1"/>
    <circle cx="7" cy="8" r="1" fill="currentColor"/><circle cx="7" cy="16" r="1" fill="currentColor"/>
    <path d="M10 8h7M10 16h7"/>
  </svg>`,
  p2s: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
    <circle cx="12" cy="20" r="1.5" fill="currentColor"/>
  </svg>`,
  heartbeat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12h4l2-6 3 12 2-6h4M17 8a5 5 0 0 0-5-5 5 5 0 0 0-5 5"/>
  </svg>`,
  adms_push: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/>
    <circle cx="12" cy="8" r="2.5"/><path d="M8 14c0-2 1.8-3 4-3s4 1 4 3"/>
    <line x1="9" y1="18" x2="15" y2="18"/>
  </svg>`,
  sdk_tcp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M9 9l2 2-2 2M13 15h3"/>
  </svg>`,
  websocket_cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 10a6 6 0 0 0-12 0 4 4 0 0 0 0 8h12a4 4 0 0 0 0-8z"/>
    <path d="M12 13v4M10 15l2 2 2-2"/>
  </svg>`,
  api: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 8h10M7 12h4m-4 4h7"/>
    <rect x="3" y="4" width="18" height="16" rx="2"/>
  </svg>`,
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2"/>
    <circle cx="12" cy="9" r="3"/><path d="M7 16c0-2.5 2-4 5-4s5 1.5 5 4"/>
    <line x1="9" y1="21" x2="15" y2="21"/>
  </svg>`,
};

// Ícones agrupados por fabricante — estes são os ícones editáveis no popup
export const FABRICANTE_ICON_SVGS = {
  zkteco: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <circle cx="12" cy="8" r="2.5"/>
    <path d="M7 14c0-2.8 2-4.5 5-4.5s5 1.7 5 4.5"/>
    <path d="M8 19h8"/>
  </svg>`,
  timmy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <rect x="7" y="6" width="10" height="7" rx="1"/>
    <circle cx="12" cy="9.5" r="2"/>
    <path d="M8 18h8M10 16h4"/>
  </svg>`,
  suprema: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <path d="M8 9l4-3 4 3M8 15l4 3 4-3"/>
    <line x1="12" y1="6" x2="12" y2="18"/>
  </svg>`,
  anviz: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <path d="M9 17l3-10 3 10M10.5 13h3"/>
  </svg>`,
  hikvision: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <circle cx="12" cy="9" r="3"/>
    <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/>
  </svg>`,
  dahua: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <ellipse cx="12" cy="9" rx="4" ry="3"/>
    <path d="M8 17c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5"/>
    <line x1="8" y1="20" x2="16" y2="20"/>
  </svg>`,
  nitgen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <path d="M9 7h6M9 11h6M9 15h4"/>
    <circle cx="16" cy="15" r="1.5" fill="currentColor"/>
  </svg>`,
  outro: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="2" width="18" height="20" rx="2"/>
    <circle cx="12" cy="10" r="3"/>
    <path d="M7 18c0-2.5 2-4 5-4s5 1.5 5 4"/>
  </svg>`,
};

export const MARKER_SIZES = {
  small:  { circle: 24, font: 12, label: 8  },
  medium: { circle: 32, font: 16, label: 9  },
  large:  { circle: 44, font: 22, label: 10 },
};

const MAX_LABEL_CHARS = 14;

function truncate(str, max = MAX_LABEL_CHARS) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function MarkerIcon({ svgString, size, color = 'white' }) {
  return (
    <span
      style={{ width: size, height: size, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
}

export default function FloorPlanCanvas({
  imageUrl,
  terminals = [],
  positions = {},
  editMode = false,
  onPositionChange,
  selectedTerminalId,
  onSelectTerminal,
  iconConfig = {},
  onIconConfigChange,
}) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [editingMarker, setEditingMarker] = useState(null); // { terminal, anchorX, anchorY }

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef(null);
  const isPanning = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setImgSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    setImgSize({ w: el.clientWidth, h: el.clientHeight });
    return () => observer.disconnect();
  }, [imageUrl]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setEditingMarker(null);
  }, [imageUrl]);

  const clampPan = useCallback((px, py, z) => {
    const maxX = (imgSize.w * (z - 1)) / 2;
    const maxY = (imgSize.h * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  }, [imgSize]);

  const getRelativePos = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const cx = (clientX - rect.left - rect.width / 2 - pan.x) / zoom + rect.width / 2;
    const cy = (clientY - rect.top - rect.height / 2 - pan.y) / zoom + rect.height / 2;
    const x = Math.max(0, Math.min(100, (cx / rect.width) * 100));
    const y = Math.max(0, Math.min(100, (cy / rect.height) * 100));
    return { x, y };
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e, terminalId) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(terminalId);
    setEditingMarker(null);
  }, [editMode]);

  const handleContainerMouseDown = useCallback((e) => {
    if (dragging) return;
    // Pan with left click on empty canvas area in zoom > 1, or middle button
    if ((e.button === 0 && zoom > 1 && !e.target.closest('[data-terminal]')) || e.button === 1) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [dragging, pan, zoom]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning.current) {
      const nx = e.clientX - panStart.current.x;
      const ny = e.clientY - panStart.current.y;
      setPan(clampPan(nx, ny, zoom));
      return;
    }
    if (!dragging || !editMode) return;
    e.preventDefault();
    const { x, y } = getRelativePos(e);
    onPositionChange?.(dragging, x, y);
  }, [dragging, editMode, getRelativePos, onPositionChange, clampPan, zoom]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    isPanning.current = false;
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (editMode) return;
    setTooltip(null);
  }, [editMode]);

  // Compute tooltip position in screen space
  const computeTooltipPos = (x, y) => {
    const TW = 200; const TH = 120;
    const cW = imgSize.w; const cH = imgSize.h;
    const markerX = (x / 100) * cW * zoom + pan.x + cW / 2 - cW * zoom / 2;
    const markerY = (y / 100) * cH * zoom + pan.y + cH / 2 - cH * zoom / 2;
    let left = markerX + 18;
    let top = markerY - 55;
    if (left + TW > cW) left = markerX - TW - 18;
    if (left < 0) left = 4;
    if (top < 0) top = markerY + 18;
    if (top + TH > cH) top = cH - TH - 4;
    return { left, top };
  };

  const terminalsWithPos = terminals.filter(t => positions[t.id]);
  const terminalsWithoutPos = terminals.filter(t => !positions[t.id]);

  const getMarkerConfig = (terminal) => {
    const fabricante = terminal.fabricante || 'outro';
    const tipo = terminal.tipo_conexao || 'default';
    // Prefer per-terminal override, then per-fabricante, then per-tipo
    const custom = iconConfig[terminal.id] || iconConfig[fabricante] || iconConfig[tipo] || {};
    const svgKey = custom.iconKey || fabricante;
    const svgString = FABRICANTE_ICON_SVGS[svgKey] || FABRICANTE_ICON_SVGS[fabricante] || TYPE_ICON_SVGS[tipo] || TYPE_ICON_SVGS.default;
    const sizeKey = custom.size || 'medium';
    const sizes = MARKER_SIZES[sizeKey] || MARKER_SIZES.medium;
    return { svgString, sizes, sizeKey, svgKey };
  };

  const handleMarkerClick = (e, terminal, pos) => {
    e.stopPropagation();
    if (editMode) {
      // In edit mode: click opens icon editor popup
      const rect = containerRef.current.getBoundingClientRect();
      const markerScreenX = (pos.x / 100) * imgSize.w * zoom + pan.x + imgSize.w / 2 - imgSize.w * zoom / 2;
      const markerScreenY = (pos.y / 100) * imgSize.h * zoom + pan.y + imgSize.h / 2 - imgSize.h * zoom / 2;
      setEditingMarker({ terminal, anchorX: markerScreenX, anchorY: markerScreenY });
    } else {
      if (selectedTerminalId === terminal.id) {
        onSelectTerminal?.(null);
        setTooltip(null);
      } else {
        onSelectTerminal?.(terminal);
        setTooltip({ terminal, ...computeTooltipPos(pos.x, pos.y) });
      }
    }
  };

  const handleIconConfigSave = (terminalId, newCfg) => {
    if (!onIconConfigChange) return;
    onIconConfigChange({ ...iconConfig, [terminalId]: newCfg });
    setEditingMarker(null);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden rounded-xl">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-50 flex flex-col gap-1">
        <button
          onClick={() => setZoom(z => { const n = Math.min(5, +(z + 0.4).toFixed(1)); setPan(p => clampPan(p.x, p.y, n)); return n; })}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={() => setZoom(z => { const n = Math.max(1, +(z - 0.4).toFixed(1)); setPan(p => clampPan(p.x, p.y, n)); return n; })}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Reset"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
        </button>
        {zoom > 1 && (
          <span className="text-[10px] text-center font-semibold text-slate-500 bg-white/80 rounded px-1">
            {Math.round(zoom * 100)}%
          </span>
        )}
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full h-full bg-slate-100 overflow-hidden rounded-xl"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseDown={handleContainerMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onClick={handleCanvasClick}
        style={{ cursor: dragging ? 'grabbing' : isPanning.current ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
      >
        {/* Zoom/pan layer */}
        <div
          style={{
            position: 'absolute', inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          {imageUrl ? (
            <img src={imageUrl} alt="Planta baixa" className="w-full h-full object-contain pointer-events-none" draggable={false} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">Sem planta baixa</div>
          )}

          {terminalsWithPos.map(terminal => {
            const pos = positions[terminal.id];
            const isOnline = terminal.status === 'online';
            const isSelected = selectedTerminalId === terminal.id;
            const isWarning = terminal.status === 'warning';
            const isEditingThis = editingMarker?.terminal?.id === terminal.id;
            const { svgString, sizes } = getMarkerConfig(terminal);

            return (
              <div
                key={terminal.id}
                data-terminal={terminal.id}
                className="absolute"
                style={{
                  left: `${pos.x}%`, top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isSelected || isEditingThis ? 30 : 20,
                  cursor: editMode ? 'pointer' : 'pointer',
                }}
                onMouseDown={(e) => { if (editMode && !e.shiftKey) handleMouseDown(e, terminal.id); }}
                onTouchStart={(e) => handleMouseDown(e, terminal.id)}
                onClick={(e) => handleMarkerClick(e, terminal, pos)}
              >
                {!isOnline && !isWarning && (
                  <span className="absolute rounded-full animate-ping bg-red-400 opacity-40"
                    style={{ width: sizes.circle * 1.7, height: sizes.circle * 1.7, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
                  />
                )}
                <div
                  className={cn(
                    "rounded-full border-2 flex items-center justify-center shadow-lg transition-all",
                    isOnline ? "bg-emerald-500 border-emerald-300" :
                    isWarning ? "bg-amber-500 border-amber-300" :
                    "bg-red-500 border-red-300",
                    (isSelected || isEditingThis) && "ring-2 ring-white ring-offset-1 scale-125",
                    editMode && "ring-2 ring-violet-400 ring-offset-1"
                  )}
                  style={{ width: sizes.circle, height: sizes.circle }}
                >
                  <MarkerIcon svgString={svgString} size={sizes.font} color="white" />
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5">
                  <span
                    className={cn(
                      "block text-center px-1 py-0.5 rounded shadow-sm font-semibold truncate",
                      isOnline ? "bg-emerald-600 text-white" :
                      isWarning ? "bg-amber-500 text-white" : "bg-red-600 text-white"
                    )}
                    style={{ fontSize: sizes.label, maxWidth: 82 }}
                    title={terminal.nome}
                  >
                    {truncate(terminal.nome)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tooltip */}
        {tooltip && !editMode && (
          <div
            className="absolute z-40 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-52 pointer-events-none"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0",
                tooltip.terminal.status === 'online' ? "bg-emerald-500" :
                tooltip.terminal.status === 'warning' ? "bg-amber-500" : "bg-red-500"
              )} />
              <p className="font-semibold text-slate-900 text-sm truncate">{tooltip.terminal.nome}</p>
            </div>
            {tooltip.terminal.modelo && <p className="text-xs text-slate-500 mb-0.5">🖥 {tooltip.terminal.modelo}</p>}
            {tooltip.terminal.fabricante && <p className="text-xs text-slate-500 mb-0.5">🏭 {tooltip.terminal.fabricante}</p>}
            {tooltip.terminal.local && <p className="text-xs text-slate-500 mb-0.5">📍 {tooltip.terminal.local}</p>}
            {tooltip.terminal.cliente_nome && <p className="text-xs text-slate-500 mb-0.5">🏢 {tooltip.terminal.cliente_nome}</p>}
            <p className={cn("text-xs font-semibold mt-1",
              tooltip.terminal.status === 'online' ? "text-emerald-600" :
              tooltip.terminal.status === 'warning' ? "text-amber-600" : "text-red-600"
            )}>
              {tooltip.terminal.status === 'online' ? '● Online' :
               tooltip.terminal.status === 'warning' ? '● Atenção' : '● Offline'}
              {tooltip.terminal.latencia_ms ? ` — ${tooltip.terminal.latencia_ms}ms` : ''}
            </p>
          </div>
        )}

        {/* Marker edit popup */}
        {editMode && editingMarker && (
          <MarkerEditPopup
            terminal={editingMarker.terminal}
            anchorX={editingMarker.anchorX}
            anchorY={editingMarker.anchorY}
            containerSize={imgSize}
            currentConfig={iconConfig[editingMarker.terminal.id] || iconConfig[editingMarker.terminal.fabricante] || {}}
            onSave={(cfg) => handleIconConfigSave(editingMarker.terminal.id, cfg)}
            onClose={() => setEditingMarker(null)}
          />
        )}
      </div>

      {/* Terminais sem posição */}
      {editMode && terminalsWithoutPos.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg p-2 z-50">
          <p className="text-xs font-semibold text-slate-600 mb-1.5">Terminais não posicionados — arraste para a planta:</p>
          <div className="flex flex-wrap gap-1.5">
            {terminalsWithoutPos.map(t => {
              const { svgString } = getMarkerConfig(t);
              return (
                <UnpositionedMarker key={t.id} terminal={t} svgString={svgString} containerRef={containerRef} zoom={zoom} pan={pan}
                  onDrop={(x, y) => onPositionChange?.(t.id, x, y)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UnpositionedMarker({ terminal, svgString, containerRef, zoom, pan, onDrop }) {
  const isOnline = terminal.status === 'online';
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('terminal_id', terminal.id)}
      onDragEnd={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cW = rect.width; const cH = rect.height;
        const cx = (e.clientX - rect.left - cW / 2 - pan.x) / zoom + cW / 2;
        const cy = (e.clientY - rect.top - cH / 2 - pan.y) / zoom + cH / 2;
        const x = Math.max(0, Math.min(100, (cx / cW) * 100));
        const y = Math.max(0, Math.min(100, (cy / cH) * 100));
        if (x > 0 && y > 0 && x < 100 && y < 100) onDrop(x, y);
      }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium cursor-grab active:cursor-grabbing border text-white max-w-[130px]",
        isOnline ? "bg-emerald-500 border-emerald-300" : "bg-red-500 border-red-300"
      )}
      title={terminal.nome}
    >
      <MarkerIcon svgString={svgString} size={12} color="white" />
      <span className="truncate">{terminal.nome}</span>
    </div>
  );
}