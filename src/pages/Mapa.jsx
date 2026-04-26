import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolvePermissions } from '@/components/auth/usePermissions.jsx';
import { 
  MapPin, Plus, Upload, ZoomIn, ZoomOut, Maximize2, Minimize2,
  AlertTriangle, CheckCircle2, X, Move, Save, RefreshCw, Layers
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

// Entity to store terminal positions on map
// Uses a simple config entity: { terminal_id, x_percent, y_percent, planta_id }
// We'll store positions in terminal's observacoes or a separate entity
// We'll use localStorage for positions per simplicity (can be upgraded to entity)

const GRID_SIZE = 40;

function TerminalMarker({ terminal, position, isEditMode, onDragEnd, onClick, isSelected }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);
  const markerRef = useRef(null);

  const statusColor = terminal.status === 'online'
    ? 'bg-emerald-500 border-emerald-600 shadow-emerald-200'
    : terminal.status === 'warning'
    ? 'bg-amber-500 border-amber-600 shadow-amber-200'
    : 'bg-red-500 border-red-600 shadow-red-200';

  const statusRing = terminal.status === 'online'
    ? 'ring-emerald-300'
    : terminal.status === 'warning'
    ? 'ring-amber-300'
    : 'ring-red-300';

  const initials = terminal.nome
    ? terminal.nome.replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase()
    : '??';

  const handleMouseDown = (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };

    const onMouseMove = (me) => {
      const container = markerRef.current?.closest('[data-map-container]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newX = ((me.clientX - rect.left) / rect.width) * 100;
      const newY = ((me.clientY - rect.top) / rect.height) * 100;
      onDragEnd(terminal.id, Math.max(1, Math.min(99, newX)), Math.max(1, Math.min(99, newY)));
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Touch support
  const handleTouchStart = (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    const touch = e.touches[0];
    setIsDragging(true);

    const onTouchMove = (te) => {
      const t = te.touches[0];
      const container = markerRef.current?.closest('[data-map-container]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newX = ((t.clientX - rect.left) / rect.width) * 100;
      const newY = ((t.clientY - rect.top) / rect.height) * 100;
      onDragEnd(terminal.id, Math.max(1, Math.min(99, newX)), Math.max(1, Math.min(99, newY)));
    };

    const onTouchEnd = () => {
      setIsDragging(false);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  };

  return (
    <div
      ref={markerRef}
      className="absolute"
      style={{ left: `${position.x}%`, top: `${position.y}%`, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 20 : 10 }}
    >
      <motion.div
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative flex flex-col items-center gap-0.5 select-none",
          isEditMode ? "cursor-move" : "cursor-pointer"
        )}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={(e) => { if (!isDragging) { e.stopPropagation(); onClick(terminal); } }}
      >
        {/* Pulse ring for offline */}
        {terminal.status !== 'online' && (
          <span className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-40",
            terminal.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
          )} style={{ width: 44, height: 44, top: -2, left: -2 }} />
        )}
        <div className={cn(
          "w-10 h-10 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold shadow-lg",
          statusColor,
          isSelected && `ring-2 ${statusRing} ring-offset-1`
        )}>
          {initials}
        </div>
        <span className="text-[9px] font-medium text-slate-700 bg-white/90 px-1 rounded shadow-sm max-w-[64px] truncate text-center leading-tight">
          {terminal.nome}
        </span>
      </motion.div>
    </div>
  );
}

function TerminalTooltip({ terminal, onClose }) {
  if (!terminal) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute z-30 bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[180px] max-w-[220px]"
      style={{ bottom: '110%', left: '50%', transform: 'translateX(-50%)' }}
    >
      <button onClick={onClose} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">
        <X className="h-3 w-3" />
      </button>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          "w-2 h-2 rounded-full shrink-0",
          terminal.status === 'online' ? 'bg-emerald-500' : terminal.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
        )} />
        <p className="font-semibold text-slate-900 text-sm truncate">{terminal.nome}</p>
      </div>
      {terminal.local && <p className="text-xs text-slate-500 mb-1">{terminal.local}</p>}
      {terminal.cliente_nome && <p className="text-xs text-slate-400 mb-2">{terminal.cliente_nome}</p>}
      {terminal.latencia_ms && (
        <p className="text-xs text-slate-500 mb-2">Latência: {terminal.latencia_ms}ms</p>
      )}
      <div className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
        terminal.status === 'online'
          ? 'bg-emerald-100 text-emerald-700'
          : terminal.status === 'warning'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-red-100 text-red-700'
      )}>
        {terminal.status === 'online' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        {terminal.status?.toUpperCase() || 'DESCONHECIDO'}
      </div>
    </motion.div>
  );
}

export default function Mapa() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [plantaImg, setPlantaImg] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [positions, setPositions] = useState({}); // { [terminalId]: { x, y } }
  const [filterCliente, setFilterCliente] = useState('all');
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const perms = resolvePermissions(currentUser);
  const isAdmin = perms.isAdmin;

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['terminals-mapa', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return await base44.entities.Terminal.list('-created_date');
      return await base44.entities.Terminal.filter({ created_by: currentUser?.email }, '-created_date');
    },
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  // Load saved state from localStorage
  useEffect(() => {
    try {
      const savedPositions = localStorage.getItem('noc_mapa_positions');
      const savedPlanta = localStorage.getItem('noc_mapa_planta');
      if (savedPositions) setPositions(JSON.parse(savedPositions));
      if (savedPlanta) setPlantaImg(savedPlanta);
    } catch {}
  }, []);

  // Auto-place terminals that have no position yet
  useEffect(() => {
    if (!terminals.length) return;
    setPositions(prev => {
      const updated = { ...prev };
      let changed = false;
      terminals.forEach((t, i) => {
        if (!updated[t.id]) {
          const col = i % 5;
          const row = Math.floor(i / 5);
          updated[t.id] = { x: 15 + col * 18, y: 20 + row * 20 };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [terminals]);

  const savePositions = () => {
    localStorage.setItem('noc_mapa_positions', JSON.stringify(positions));
    toast.success('Posições guardadas!');
    setIsEditMode(false);
  };

  const handleDragEnd = useCallback((terminalId, x, y) => {
    setPositions(prev => ({ ...prev, [terminalId]: { x, y } }));
  }, []);

  const handleImportPlanta = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPlantaImg(dataUrl);
      localStorage.setItem('noc_mapa_planta', dataUrl);
      toast.success('Planta importada!');
    };
    reader.readAsDataURL(file);
  };

  const clientes = [...new Set(terminals.map(t => t.cliente_nome).filter(Boolean))].sort();

  const filteredTerminals = filterCliente === 'all'
    ? terminals
    : terminals.filter(t => t.cliente_nome === filterCliente);

  const offlineTerminals = filteredTerminals.filter(t => t.status === 'offline');
  const onlineCount = filteredTerminals.filter(t => t.status === 'online').length;
  const offlineCount = offlineTerminals.length;

  return (
    <div className={cn(
      "min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full overflow-x-hidden",
      isFullscreen && "fixed inset-0 z-50 bg-slate-900"
    )}>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 rounded-xl shrink-0">
              <MapPin className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mapa de Terminais</h1>
              <p className="text-xs text-slate-500">Planta baixa interativa com localização dos terminais</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Cliente filter */}
            {clientes.length > 0 && (
              <select
                value={filterCliente}
                onChange={e => setFilterCliente(e.target.value)}
                className="h-8 rounded-lg border border-input bg-white px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Todos os clientes</option>
                {clientes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {/* Status badges */}
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              {onlineCount} online
            </Badge>
            {offlineCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {offlineCount} offline
              </Badge>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => queryClient.invalidateQueries(['terminals-mapa'])}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Map Card */}
        <Card className={cn(
          "bg-white border-slate-200 overflow-hidden",
          isFullscreen && "flex-1"
        )}>
          {/* Map Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  <Button size="sm" onClick={savePositions} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs gap-1">
                    <Save className="h-3.5 w-3.5" /> Guardar posições
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditMode(false)} className="h-7 text-xs">
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)} className="h-7 text-xs gap-1">
                    <Move className="h-3.5 w-3.5" /> Editar posições
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-7 text-xs gap-1"
                  >
                    <Upload className="h-3.5 w-3.5" /> Importar planta
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImportPlanta}
                  />
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(50, z - 10))}>
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-slate-500 w-10 text-center">{zoom}%</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(200, z + 10))}>
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setIsFullscreen(f => !f)}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Map Canvas */}
          <div
            className="relative overflow-auto"
            style={{ height: isFullscreen ? 'calc(100vh - 220px)' : 480 }}
          >
            <div
              style={{ width: `${zoom}%`, minWidth: '100%', height: '100%', position: 'relative', minHeight: 420 }}
            >
              {/* Grid background or plant image */}
              <div
                data-map-container
                ref={containerRef}
                className="relative w-full h-full"
                style={{
                  backgroundImage: plantaImg
                    ? `url(${plantaImg})`
                    : `
                      linear-gradient(to right, #e2e8f0 1px, transparent 1px),
                      linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
                    `,
                  backgroundSize: plantaImg ? 'cover' : `${GRID_SIZE}px ${GRID_SIZE}px`,
                  backgroundPosition: 'center',
                  backgroundColor: '#f8fafc',
                  minHeight: 420,
                }}
                onClick={() => setSelectedTerminal(null)}
              >
                {/* Planta label */}
                {filterCliente !== 'all' && (
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-rose-600">
                    <MapPin className="h-3 w-3" />
                    PLANTA — {filterCliente.toUpperCase()}
                  </div>
                )}

                {/* Edit mode overlay */}
                {isEditMode && (
                  <div className="absolute inset-0 z-5 border-2 border-dashed border-blue-300 rounded pointer-events-none">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full shadow">
                      Modo de edição — arraste os terminais
                    </div>
                  </div>
                )}

                {/* Terminal Markers */}
                {filteredTerminals.map(terminal => {
                  const pos = positions[terminal.id] || { x: 50, y: 50 };
                  const isSelected = selectedTerminal?.id === terminal.id;
                  return (
                    <div key={terminal.id} className="absolute" style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)', zIndex: isSelected ? 20 : 10 }}>
                      <div className="relative">
                        <TerminalMarker
                          terminal={terminal}
                          position={pos}
                          isEditMode={isEditMode}
                          onDragEnd={handleDragEnd}
                          onClick={setSelectedTerminal}
                          isSelected={isSelected}
                        />
                        <AnimatePresence>
                          {isSelected && !isEditMode && (
                            <TerminalTooltip
                              terminal={terminal}
                              onClose={() => setSelectedTerminal(null)}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}

                {/* Empty state */}
                {filteredTerminals.length === 0 && !isLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                    <MapPin className="h-12 w-12 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum terminal encontrado</p>
                  </div>
                )}

                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-7 h-7 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          <span className="font-medium text-slate-600">Legenda:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            Online
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0 animate-pulse" />
            Offline
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
            Aviso
          </div>
        </div>

        {/* Offline Terminals List */}
        {offlineTerminals.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
              <AlertTriangle className="h-4 w-4" />
              Terminais Offline ({offlineTerminals.length})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {offlineTerminals.map(terminal => (
                <motion.div
                  key={terminal.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                    selectedTerminal?.id === terminal.id
                      ? "bg-red-50 border-red-300 shadow-sm"
                      : "bg-white border-red-100 hover:border-red-300 hover:bg-red-50/50"
                  )}
                  onClick={() => setSelectedTerminal(t => t?.id === terminal.id ? null : terminal)}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{terminal.nome}</p>
                    <p className="text-xs text-slate-400 truncate">{terminal.local || terminal.cliente_nome || '—'}</p>
                  </div>
                  {terminal.ultimo_ping && (
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(terminal.ultimo_ping).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}