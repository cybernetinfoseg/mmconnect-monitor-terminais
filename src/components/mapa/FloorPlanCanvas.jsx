import React, { useRef, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Trash2, Move, Save, Loader2, Fingerprint, Scan, Shield, Cpu, MonitorSmartphone, Wifi, DoorOpen, UserCheck, Camera, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_COLORS = {
  online:  { dot: '#10b981', ring: '#6ee7b7' },
  offline: { dot: '#ef4444', ring: '#fca5a5' },
  warning: { dot: '#f59e0b', ring: '#fcd34d' },
  default: { dot: '#94a3b8', ring: '#cbd5e1' },
};

function getColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.default;
}

const TERMINAL_ICONS = [
  { id: 'initials',     label: 'Iniciais',    Icon: null },
  { id: 'fingerprint',  label: 'Biométrico',  Icon: Fingerprint },
  { id: 'scan',         label: 'Scan',        Icon: Scan },
  { id: 'shield',       label: 'Segurança',   Icon: Shield },
  { id: 'cpu',          label: 'CPU',         Icon: Cpu },
  { id: 'monitor',      label: 'Monitor',     Icon: MonitorSmartphone },
  { id: 'wifi',         label: 'Wireless',    Icon: Wifi },
  { id: 'door',         label: 'Porta',       Icon: DoorOpen },
  { id: 'user',         label: 'Utilizador',  Icon: UserCheck },
  { id: 'camera',       label: 'Câmara',      Icon: Camera },
];

function getIconEntry(iconId) {
  return TERMINAL_ICONS.find(i => i.id === iconId) || TERMINAL_ICONS[0];
}

// Tooltip com posicionamento inteligente dentro do contentor
function MarkerTooltip({ terminal, markerRef, containerRef }) {
  const tooltipRef = useRef(null);
  const [style, setStyle] = useState({ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' });
  const c = getColor(terminal.status);

  useEffect(() => {
    if (!tooltipRef.current || !containerRef?.current || !markerRef?.current) return;
    const tip  = tooltipRef.current.getBoundingClientRect();
    const cont = containerRef.current.getBoundingClientRect();
    const mark = markerRef.current.getBoundingClientRect();

    // Vertical: preferir acima; se sair pelo topo → abaixo
    const spaceAbove = mark.top - cont.top;
    const showBelow  = spaceAbove < tip.height + 12;

    // Horizontal: centrado no marcador, mas clampado dentro do contentor
    const markerCenterX = mark.left - cont.left + mark.width / 2;
    let left = markerCenterX - tip.width / 2;
    left = Math.max(4, Math.min(left, cont.width - tip.width - 4));

    setStyle(showBelow
      ? { top: mark.bottom - cont.top + 8, left }
      : { bottom: cont.bottom - mark.top + 8, left }
    );
  }, []);

  return (
    <div
      ref={tooltipRef}
      className="absolute z-[500] pointer-events-none"
      style={{ ...style, minWidth: 160, position: 'absolute' }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-3 text-xs">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
          <span className="font-bold text-slate-800 truncate">{terminal.nome}</span>
        </div>
        {terminal.local && <p className="text-slate-500 truncate">{terminal.local}</p>}
        {terminal.latencia_ms && <p className="text-slate-400">Latência: {terminal.latencia_ms}ms</p>}
        <div className="mt-1.5 text-center font-semibold rounded px-1 py-0.5"
          style={{ backgroundColor: c.dot + '22', color: c.dot }}>
          {terminal.status?.toUpperCase() || '—'}
        </div>
      </div>
    </div>
  );
}

// Picker de ícone
function IconPicker({ terminalId, currentIcon, onSelect, onClose }) {
  return (
    <div
      className="absolute z-[300] bg-white border border-slate-200 rounded-xl shadow-2xl p-2"
      style={{ bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', width: 220 }}
      onMouseDown={e => e.stopPropagation()}
    >
      <p className="text-[10px] text-slate-400 font-medium uppercase mb-2 px-1">Escolher ícone</p>
      <div className="grid grid-cols-5 gap-1">
        {TERMINAL_ICONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            title={label}
            onClick={() => { onSelect(terminalId, id); onClose(); }}
            className={`flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-lg transition-colors text-[9px] font-medium
              ${currentIcon === id ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            {Icon ? <Icon className="h-4 w-4" /> : <span className="text-[11px] font-bold">AB</span>}
            <span className="leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const ZOOM_STEP = 0.2;
const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 3;

export default function FloorPlanCanvas({ local, terminals, canEdit, savedPlan, onSave, selectedId, onSelect }) {
  const [imageUrl, setImageUrl]     = useState(savedPlan?.imageUrl || null);
  const [positions, setPositions]   = useState(savedPlan?.positions || {});
  const [dragging, setDragging]     = useState(null);
  const [editMode, setEditMode]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [hover, setHover]           = useState(null);
  const [iconPicker, setIconPicker] = useState(null);
  const [zoom, setZoom]             = useState(1);

  const containerRef  = useRef(null); // outer scroll container
  const canvasRef     = useRef(null); // inner zoomable canvas
  const markerRefs    = useRef({});   // per-terminal marker refs

  useEffect(() => {
    if (savedPlan) {
      setImageUrl(savedPlan.imageUrl || null);
      setPositions(savedPlan.positions || {});
    }
  }, [savedPlan?.imageUrl]);

  // Close icon picker on outside click
  useEffect(() => {
    if (!iconPicker) return;
    const handler = () => setIconPicker(null);
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [iconPicker]);

  function defaultPos(idx, total) {
    const cols = Math.max(4, Math.ceil(Math.sqrt(total)));
    return { x: 10 + (idx % cols) * 14, y: 15 + Math.floor(idx / cols) * 20 };
  }

  function getPos(terminal, idx) {
    return positions[terminal.id] || defaultPos(idx, terminals.length);
  }

  function getTerminalIcon(terminal) {
    return positions[terminal.id]?.icon || 'initials';
  }

  function setTerminalIcon(terminalId, iconId) {
    setPositions(p => ({ ...p, [terminalId]: { ...(p[terminalId] || {}), icon: iconId } }));
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagem deve ter menos de 5MB'); return; }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
      toast.success('Planta carregada!');
    } catch {
      toast.error('Erro ao carregar a planta');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function removePlan() { setImageUrl(null); setPositions({}); }

  // Mouse drag (positions in % of canvas)
  function onMouseDown(e, terminalId) {
    if (!editMode || iconPicker === terminalId) return;
    e.preventDefault(); e.stopPropagation();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width)  * 100;
    const cy = ((e.clientY - rect.top)  / rect.height) * 100;
    const pos = positions[terminalId] || defaultPos(terminals.findIndex(t => t.id === terminalId), terminals.length);
    setDragging({ id: terminalId, offsetX: cx - pos.x, offsetY: cy - pos.y, moved: false });
  }

  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(97, Math.max(2, ((e.clientX - rect.left) / rect.width)  * 100 - dragging.offsetX));
    const y = Math.min(95, Math.max(2, ((e.clientY - rect.top)  / rect.height) * 100 - dragging.offsetY));
    setPositions(p => ({ ...p, [dragging.id]: { ...(p[dragging.id] || {}), x, y } }));
    setDragging(d => d ? { ...d, moved: true } : d);
  }, [dragging]);

  const onMouseUp = useCallback(() => {
    if (dragging && !dragging.moved) {
      setIconPicker(id => id === dragging.id ? null : dragging.id);
    }
    setDragging(null);
  }, [dragging]);

  useEffect(() => {
    if (editMode) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [editMode, onMouseMove, onMouseUp]);

  function onTouchStart(e, terminalId) {
    if (!editMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = canvasRef.current.getBoundingClientRect();
    const cx = ((touch.clientX - rect.left) / rect.width)  * 100;
    const cy = ((touch.clientY - rect.top)  / rect.height) * 100;
    const pos = positions[terminalId] || defaultPos(terminals.findIndex(t => t.id === terminalId), terminals.length);
    setDragging({ id: terminalId, offsetX: cx - pos.x, offsetY: cy - pos.y, moved: false });
  }

  function onTouchMove(e) {
    if (!dragging) return;
    const touch = e.touches[0];
    const rect  = canvasRef.current.getBoundingClientRect();
    const x = Math.min(97, Math.max(2, ((touch.clientX - rect.left) / rect.width)  * 100 - dragging.offsetX));
    const y = Math.min(95, Math.max(2, ((touch.clientY - rect.top)  / rect.height) * 100 - dragging.offsetY));
    setPositions(p => ({ ...p, [dragging.id]: { ...(p[dragging.id] || {}), x, y } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ imageUrl, positions });
      toast.success('Planta guardada!');
      setEditMode(false); setIconPicker(null);
    } catch {
      toast.error('Erro ao guardar');
    } finally { setSaving(false); }
  }

  function changeZoom(delta) {
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 10) / 10)));
  }

  const hasImage   = !!imageUrl;
  const fileRef    = useRef(null);
  const canvasH    = hasImage ? 360 : Math.max(140, Math.ceil(terminals.length / 6) * 100 + 40);

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={editMode ? 'default' : 'outline'} size="sm"
            onClick={() => { setEditMode(v => !v); setIconPicker(null); }}
            className={editMode ? 'bg-blue-600 hover:bg-blue-700' : ''}
          >
            <Move className="h-3.5 w-3.5 mr-1" />
            {editMode ? 'A editar...' : 'Editar posições'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {hasImage ? 'Substituir planta' : 'Importar planta'}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          {hasImage && (
            <Button variant="outline" size="sm" onClick={removePlan} className="text-red-600 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover planta
            </Button>
          )}
          {editMode && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="ml-auto bg-emerald-600 hover:bg-emerald-700">
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Guardar
            </Button>
          )}
        </div>
      )}

      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        {zoom !== 1 && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)} title="Repor zoom">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Outer scroll container */}
      <div
        ref={containerRef}
        className="w-full rounded-xl overflow-auto border border-slate-200"
        style={{ maxHeight: 560 }}
      >
        {/* Inner zoomable canvas */}
        <div
          ref={canvasRef}
          className="relative select-none"
          style={{
            width:  `${100 * zoom}%`,
            minHeight: canvasH * zoom,
            background: hasImage
              ? 'transparent'
              : 'repeating-linear-gradient(0deg,transparent,transparent 39px,#e2e8f0 39px,#e2e8f0 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#e2e8f0 39px,#e2e8f0 40px)',
            backgroundColor: '#f8fafc',
            cursor: editMode ? 'crosshair' : 'default',
            transformOrigin: 'top left',
          }}
          onTouchMove={onTouchMove}
          onTouchEnd={() => setDragging(null)}
        >
          {hasImage && (
            <img
              src={imageUrl}
              alt="Planta baixa"
              className="w-full object-contain"
              style={{ minHeight: canvasH * zoom, maxHeight: 600 * zoom, display: 'block' }}
              draggable={false}
            />
          )}

          {!hasImage && (
            <span className="absolute top-2 left-3 text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              Planta — {local}
            </span>
          )}

          {/* Terminal markers */}
          {terminals.map((terminal, idx) => {
            const pos            = getPos(terminal, idx);
            const c              = getColor(terminal.status);
            const isDraggingThis = dragging?.id === terminal.id;
            const isHovered      = hover === terminal.id;
            const iconId         = getTerminalIcon(terminal);
            const iconEntry      = getIconEntry(iconId);
            const IconComponent  = iconEntry.Icon;
            const showPicker     = editMode && iconPicker === terminal.id;

            return (
              <div
                key={terminal.id}
                ref={el => markerRefs.current[terminal.id] = el}
                className="absolute"
                style={{
                  left:        `${pos.x}%`,
                  top:         `${pos.y}%`,
                  transform:   'translate(-50%, -50%)',
                  zIndex:      isDraggingThis ? 200 : showPicker ? 150 : isHovered ? 50 : 10,
                  cursor:      editMode ? 'grab' : 'pointer',
                  touchAction: editMode ? 'none' : 'auto',
                }}
                onMouseDown={(e) => onMouseDown(e, terminal.id)}
                onTouchStart={(e) => onTouchStart(e, terminal.id)}
                onMouseEnter={() => !editMode && setHover(terminal.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => !editMode && onSelect(terminal)}
              >
                {/* Tooltip — hover only, smart positioning */}
                <AnimatePresence>
                  {isHovered && !editMode && (
                    <motion.div key="tip" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                      <SmartTooltip terminal={terminal} markerEl={markerRefs.current[terminal.id]} containerEl={containerRef.current} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Icon picker */}
                <AnimatePresence>
                  {showPicker && (
                    <motion.div key="picker" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}>
                      <IconPicker terminalId={terminal.id} currentIcon={iconId} onSelect={setTerminalIcon} onClose={() => setIconPicker(null)} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Ping for offline */}
                {terminal.status === 'offline' && (
                  <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ backgroundColor: c.ring }} />
                )}

                {/* Marker dot */}
                <div
                  className="relative flex items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform duration-150"
                  style={{
                    width:           32,
                    height:          32,
                    backgroundColor: c.dot,
                    boxShadow:       `0 0 0 3px ${c.ring}`,
                    transform:       isDraggingThis ? 'scale(1.3)' : 'scale(1)',
                  }}
                >
                  {IconComponent
                    ? <IconComponent className="text-white h-4 w-4" />
                    : <span className="text-white text-[10px] font-bold leading-none select-none">{terminal.nome?.slice(0, 2).toUpperCase()}</span>
                  }
                </div>

                {/* Label */}
                <div className="mt-1 text-center" style={{ width: 60, marginLeft: -14 }}>
                  <span className="text-[9px] font-semibold text-slate-700 bg-white/80 px-1 rounded leading-tight block truncate">
                    {terminal.nome}
                  </span>
                </div>
              </div>
            );
          })}

          {editMode && (
            <div className="absolute bottom-2 right-2 bg-blue-600/90 text-white text-[10px] px-2 py-1 rounded-lg">
              Arraste para mover · Clique para mudar ícone
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tooltip com posicionamento relativo ao contentor de scroll (outer)
function SmartTooltip({ terminal, markerEl, containerEl }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: null, left: null, bottom: null });
  const c = getColor(terminal.status);

  useEffect(() => {
    if (!ref.current || !containerEl || !markerEl) return;
    const tip  = ref.current.getBoundingClientRect();
    const cont = containerEl.getBoundingClientRect();
    const mark = markerEl.getBoundingClientRect();

    // Horizontal clamp within outer container
    let left = mark.left - cont.left + mark.width / 2 - tip.width / 2 + containerEl.scrollLeft;
    left = Math.max(4, Math.min(left, cont.width - tip.width - 4));

    // Vertical: above marker if space, else below
    const spaceAbove = mark.top - cont.top;
    const top = spaceAbove >= tip.height + 12
      ? mark.top - cont.top - tip.height - 8 + containerEl.scrollTop
      : mark.bottom - cont.top + 8 + containerEl.scrollTop;

    setPos({ top, left });
  }, [containerEl, markerEl]);

  return (
    <div
      ref={ref}
      className="pointer-events-none z-[500] bg-white rounded-xl shadow-2xl border border-slate-200 p-3 text-xs"
      style={{
        position: 'absolute',
        top:      pos.top ?? 0,
        left:     pos.left ?? 0,
        minWidth: 160,
        visibility: pos.top === null ? 'hidden' : 'visible',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
        <span className="font-bold text-slate-800 truncate">{terminal.nome}</span>
      </div>
      {terminal.local && <p className="text-slate-500 truncate">{terminal.local}</p>}
      {terminal.latencia_ms && <p className="text-slate-400">Latência: {terminal.latencia_ms}ms</p>}
      <div className="mt-1.5 text-center font-semibold rounded px-1 py-0.5"
        style={{ backgroundColor: c.dot + '22', color: c.dot }}>
        {terminal.status?.toUpperCase() || '—'}
      </div>
    </div>
  );
}