import React, { useRef, useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

// Ícones SVG por tipo de terminal
const TYPE_ICONS = {
  ip_local:          '🖥️',
  ip_publico:        '🌐',
  dns:               '🔗',
  p2s:               '📡',
  heartbeat:         '💓',
  adms_push:         '📲',
  sdk_tcp:           '🔌',
  websocket_cloud:   '☁️',
  api:               '⚙️',
  default:           '📍',
};

const MARKER_SIZES = {
  small:  { circle: 22, font: 10, label: 8  },
  medium: { circle: 30, font: 13, label: 9  },
  large:  { circle: 40, font: 17, label: 10 },
};

const MAX_LABEL_CHARS = 14;

function truncate(str, max = MAX_LABEL_CHARS) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export default function FloorPlanCanvas({
  imageUrl,
  terminals = [],
  positions = {},
  editMode = false,
  onPositionChange,
  selectedTerminalId,
  onSelectTerminal,
  iconConfig = {},   // { [tipo_conexao]: { icon: '🖥️', size: 'medium' } }
}) {
  const containerRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef(null);

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

  // Reset zoom/pan when plan changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [imageUrl]);

  const clampPan = useCallback((px, py, z) => {
    const maxX = (imgSize.w * (z - 1)) / 2;
    const maxY = (imgSize.h * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  }, [imgSize]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setZoom(prev => {
      const next = Math.max(1, Math.min(5, prev + delta));
      setPan(p => clampPan(p.x, p.y, next));
      return next;
    });
  }, [clampPan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Convert client coords → % position on the zoomed/panned image
  const getRelativePos = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    // Invert zoom+pan transform
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
    setTooltip(null);
  }, [editMode]);

  // Pan (middle mouse or when no terminal is dragged in editMode)
  const handleContainerMouseDown = useCallback((e) => {
    if (dragging) return;
    if (e.button === 1 || (editMode && e.button === 0 && !e.target.closest('[data-terminal]'))) {
      // only pan with middle button in view mode, or right‑click drag
    }
    if (e.button === 1) {
      e.preventDefault();
      setPanning(true);
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    }
  }, [dragging, pan]);

  const handleMouseMove = useCallback((e) => {
    if (panning) {
      const nx = e.clientX - panStart.current.x;
      const ny = e.clientY - panStart.current.y;
      setPan(clampPan(nx, ny, zoom));
      return;
    }
    if (!dragging || !editMode) return;
    e.preventDefault();
    const { x, y } = getRelativePos(e);
    onPositionChange?.(dragging, x, y);
  }, [panning, dragging, editMode, getRelativePos, onPositionChange, clampPan, zoom]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(false);
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (editMode) return;
    setTooltip(null);
  }, [editMode]);

  const computeTooltipPos = (x, y) => {
    const TW = 200;
    const TH = 110;
    const cW = imgSize.w;
    const cH = imgSize.h;
    // Convert % → px within the visible container (not zoomed coords)
    const markerX = (x / 100) * cW * zoom + pan.x + cW / 2 - cW * zoom / 2;
    const markerY = (y / 100) * cH * zoom + pan.y + cH / 2 - cH * zoom / 2;
    let left = markerX + 16;
    let top = markerY - 55;
    if (left + TW > cW) left = markerX - TW - 16;
    if (left < 0) left = 4;
    if (top < 0) top = markerY + 16;
    if (top + TH > cH) top = cH - TH - 4;
    return { left, top };
  };

  const terminalsWithPos = terminals.filter(t => positions[t.id]);
  const terminalsWithoutPos = terminals.filter(t => !positions[t.id]);

  const getMarkerConfig = (terminal) => {
    const tipo = terminal.tipo_conexao || 'default';
    const custom = iconConfig[tipo] || {};
    const icon = custom.icon || TYPE_ICONS[tipo] || TYPE_ICONS.default;
    const sizeKey = custom.size || 'medium';
    const sizes = MARKER_SIZES[sizeKey] || MARKER_SIZES.medium;
    return { icon, sizes };
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden rounded-xl">
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-50 flex flex-col gap-1">
        <button
          onClick={() => setZoom(z => { const n = Math.min(5, z + 0.3); setPan(p => clampPan(p.x, p.y, n)); return n; })}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={() => setZoom(z => { const n = Math.max(1, z - 0.3); setPan(p => clampPan(p.x, p.y, n)); return n; })}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4 text-slate-600" />
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="w-8 h-8 bg-white/90 border border-slate-200 rounded-lg shadow flex items-center justify-center hover:bg-slate-50 transition-colors"
          title="Reset zoom"
        >
          <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
        </button>
        {zoom > 1 && (
          <span className="text-[10px] text-center font-semibold text-slate-500 bg-white/80 rounded px-1">
            {Math.round(zoom * 100)}%
          </span>
        )}
      </div>

      {/* Canvas container */}
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
        style={{ cursor: dragging ? 'grabbing' : panning ? 'grabbing' : 'default' }}
      >
        {/* Zoomed/panned layer */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Planta baixa"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
              Sem planta baixa
            </div>
          )}

          {/* Marcadores posicionados */}
          {terminalsWithPos.map(terminal => {
            const pos = positions[terminal.id];
            const isOnline = terminal.status === 'online';
            const isSelected = selectedTerminalId === terminal.id;
            const isWarning = terminal.status === 'warning';
            const { icon, sizes } = getMarkerConfig(terminal);

            return (
              <div
                key={terminal.id}
                data-terminal={terminal.id}
                className="absolute"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: isSelected ? 30 : 20,
                  cursor: editMode ? 'grab' : 'pointer',
                }}
                onMouseDown={(e) => handleMouseDown(e, terminal.id)}
                onTouchStart={(e) => handleMouseDown(e, terminal.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!editMode) {
                    if (selectedTerminalId === terminal.id) {
                      onSelectTerminal?.(null);
                      setTooltip(null);
                    } else {
                      onSelectTerminal?.(terminal);
                      setTooltip({ terminal, ...computeTooltipPos(pos.x, pos.y) });
                    }
                  }
                }}
              >
                {/* Anel de pulso offline */}
                {!isOnline && !isWarning && (
                  <span
                    className="absolute rounded-full animate-ping bg-red-400 opacity-50"
                    style={{
                      width: sizes.circle * 1.6,
                      height: sizes.circle * 1.6,
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                )}
                {/* Marcador */}
                <div
                  className={cn(
                    "rounded-full border-2 flex items-center justify-center shadow-lg transition-transform",
                    isOnline
                      ? "bg-emerald-500 border-emerald-300"
                      : isWarning
                      ? "bg-amber-500 border-amber-300"
                      : "bg-red-500 border-red-300",
                    isSelected && "ring-2 ring-white ring-offset-1",
                    editMode && "cursor-grab active:cursor-grabbing"
                  )}
                  style={{
                    width: sizes.circle,
                    height: sizes.circle,
                    transform: isSelected ? 'scale(1.25)' : 'scale(1)',
                  }}
                >
                  <span style={{ fontSize: sizes.font, lineHeight: 1 }}>{icon}</span>
                </div>
                {/* Label truncada */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5 whitespace-nowrap max-w-[80px]">
                  <span
                    className={cn(
                      "block text-center px-1 py-0.5 rounded shadow-sm font-semibold truncate",
                      isOnline ? "bg-emerald-600 text-white" :
                      isWarning ? "bg-amber-500 text-white" : "bg-red-600 text-white"
                    )}
                    style={{ fontSize: sizes.label, maxWidth: 80 }}
                    title={terminal.nome}
                  >
                    {truncate(terminal.nome)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tooltip — fora do layer zoom para ficar fixo no ecrã */}
        {tooltip && !editMode && (
          <div
            className="absolute z-40 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-48 pointer-events-none"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "w-2.5 h-2.5 rounded-full shrink-0",
                tooltip.terminal.status === 'online' ? "bg-emerald-500" :
                tooltip.terminal.status === 'warning' ? "bg-amber-500" : "bg-red-500"
              )} />
              <p className="font-semibold text-slate-900 text-sm truncate">{tooltip.terminal.nome}</p>
            </div>
            {tooltip.terminal.local && (
              <p className="text-xs text-slate-500 mb-0.5">📍 {tooltip.terminal.local}</p>
            )}
            {tooltip.terminal.cliente_nome && (
              <p className="text-xs text-slate-500 mb-0.5">🏢 {tooltip.terminal.cliente_nome}</p>
            )}
            <p className="text-xs text-slate-400 mb-0.5">
              {TYPE_ICONS[tooltip.terminal.tipo_conexao] || TYPE_ICONS.default} {tooltip.terminal.tipo_conexao}
            </p>
            <p className={cn(
              "text-xs font-semibold mt-1",
              tooltip.terminal.status === 'online' ? "text-emerald-600" :
              tooltip.terminal.status === 'warning' ? "text-amber-600" : "text-red-600"
            )}>
              {tooltip.terminal.status === 'online' ? '● Online' :
               tooltip.terminal.status === 'warning' ? '● Atenção' : '● Offline'}
              {tooltip.terminal.latencia_ms ? ` — ${tooltip.terminal.latencia_ms}ms` : ''}
            </p>
          </div>
        )}
      </div>

      {/* Terminais sem posição (editMode) */}
      {editMode && terminalsWithoutPos.length > 0 && (
        <div className="absolute bottom-2 left-2 right-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-lg p-2 z-50">
          <p className="text-xs font-semibold text-slate-600 mb-1.5">
            Terminais não posicionados — arraste para a planta:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {terminalsWithoutPos.map(t => (
              <UnpositionedMarker
                key={t.id}
                terminal={t}
                containerRef={containerRef}
                zoom={zoom}
                pan={pan}
                onDrop={(x, y) => onPositionChange?.(t.id, x, y)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnpositionedMarker({ terminal, containerRef, zoom, pan, onDrop }) {
  const isOnline = terminal.status === 'online';

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData('terminal_id', terminal.id)}
      onDragEnd={(e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cW = rect.width;
        const cH = rect.height;
        // Invert pan+zoom
        const cx = (e.clientX - rect.left - cW / 2 - pan.x) / zoom + cW / 2;
        const cy = (e.clientY - rect.top - cH / 2 - pan.y) / zoom + cH / 2;
        const x = Math.max(0, Math.min(100, (cx / cW) * 100));
        const y = Math.max(0, Math.min(100, (cy / cH) * 100));
        if (x > 0 && y > 0 && x < 100 && y < 100) onDrop(x, y);
      }}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-grab active:cursor-grabbing border text-white max-w-[120px]",
        isOnline ? "bg-emerald-500 border-emerald-300" : "bg-red-500 border-red-300"
      )}
      title={terminal.nome}
    >
      <span>{TYPE_ICONS[terminal.tipo_conexao] || TYPE_ICONS.default}</span>
      <span className="truncate">{terminal.nome}</span>
    </div>
  );
}

export { TYPE_ICONS, MARKER_SIZES };