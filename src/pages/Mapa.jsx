import React, { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resolvePermissions } from '@/components/auth/usePermissions.jsx';
import {
  MapPin, Upload, ZoomIn, ZoomOut, Maximize2, Minimize2,
  AlertTriangle, Move, Save, RefreshCw, Plus, Trash2, X, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import TerminalIcon from '@/components/mapa/TerminalIcon';
import MapTooltip from '@/components/mapa/MapTooltip';

const GRID_SIZE = 40;

// ─── Marker component ───────────────────────────────────────────────────────
function TerminalMarker({ terminal, position, isEditMode, onDragEnd, onClick, isSelected }) {
  const [isDragging, setIsDragging] = useState(false);
  const markerRef = useRef(null);

  const handlePointerDown = (e) => {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const onMove = (me) => {
      setIsDragging(true);
      const clientX = me.touches ? me.touches[0].clientX : me.clientX;
      const clientY = me.touches ? me.touches[0].clientY : me.clientY;
      const container = markerRef.current?.closest('[data-map-container]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      onDragEnd(
        terminal.id,
        Math.max(1, Math.min(99, ((clientX - rect.left) / rect.width) * 100)),
        Math.max(1, Math.min(99, ((clientY - rect.top) / rect.height) * 100))
      );
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      // slight delay to prevent click after drag
      setTimeout(() => setIsDragging(false), 50);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  return (
    <div
      ref={markerRef}
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isSelected ? 30 : 10,
        pointerEvents: 'auto',
      }}
    >
      <motion.div
        whileHover={{ scale: 1.12 }}
        className={cn(
          "relative flex flex-col items-center gap-0.5 select-none",
          isEditMode ? "cursor-move" : "cursor-pointer"
        )}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={(e) => {
          if (!isDragging && !isEditMode) {
            e.stopPropagation();
            onClick(terminal);
          }
        }}
      >
        {/* Offline pulse ring */}
        {terminal.status === 'offline' && (
          <span className="absolute rounded-full animate-ping bg-red-400 opacity-40 pointer-events-none"
            style={{ width: 48, height: 48, top: -4, left: -4 }} />
        )}
        {/* Icon with ring if selected */}
        <div className={cn(
          "rounded-xl overflow-hidden shadow-lg",
          isSelected && "ring-2 ring-offset-2 ring-blue-400"
        )}>
          <TerminalIcon terminal={terminal} size={40} />
        </div>
        {/* Name label */}
        <span className="text-[9px] font-semibold text-slate-800 bg-white/90 px-1.5 py-0.5 rounded shadow-sm max-w-[70px] truncate text-center leading-tight whitespace-nowrap">
          {terminal.nome}
        </span>
      </motion.div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Mapa() {
  const [currentUser, setCurrentUser] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [positions, setPositions] = useState({});
  const [filterUser, setFilterUser] = useState(''); // admin-only filter
  const [selectedPlantaId, setSelectedPlantaId] = useState(null);
  const [showNewPlantaForm, setShowNewPlantaForm] = useState(false);
  const [newPlantaNome, setNewPlantaNome] = useState('');
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(u => {
      setCurrentUser(u);
      setFilterUser(u?.email || '');
    }).catch(() => {});
  }, []);

  const perms = resolvePermissions(currentUser);
  const isAdmin = perms.isAdmin;

  // Fetch all users (admin only)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-mapa'],
    queryFn: () => base44.entities.User.list(),
    enabled: !!currentUser && isAdmin,
  });

  // Fetch terminals based on user context
  const viewingEmail = isAdmin ? (filterUser || currentUser?.email) : currentUser?.email;

  const { data: terminals = [], isLoading: loadingTerminals } = useQuery({
    queryKey: ['terminals-mapa', viewingEmail, isAdmin],
    queryFn: async () => {
      if (isAdmin && !filterUser) return await base44.entities.Terminal.list('-created_date');
      const email = viewingEmail;
      return await base44.entities.Terminal.filter(
        { $or: [{ created_by: email }, { usuario_email: email }] },
        '-created_date'
      );
    },
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  // Fetch plantas
  const { data: plantas = [], isLoading: loadingPlantas } = useQuery({
    queryKey: ['plantas-mapa', viewingEmail, isAdmin],
    queryFn: async () => {
      if (isAdmin && !filterUser) return await base44.entities.MapaPlanta.list('-created_date');
      return await base44.entities.MapaPlanta.filter({ owner_email: viewingEmail }, '-created_date');
    },
    enabled: !!currentUser,
  });

  // Select first planta when list loads
  useEffect(() => {
    if (plantas.length && !selectedPlantaId) {
      setSelectedPlantaId(plantas[0].id);
    }
    if (!plantas.length) setSelectedPlantaId(null);
  }, [plantas]);

  const selectedPlanta = plantas.find(p => p.id === selectedPlantaId) || null;

  // Load positions from selected planta
  useEffect(() => {
    if (selectedPlanta?.posicoes) {
      try { setPositions(JSON.parse(selectedPlanta.posicoes)); } catch { setPositions({}); }
    } else {
      setPositions({});
    }
  }, [selectedPlanta?.id]);

  // Auto-place terminals without positions
  useEffect(() => {
    if (!terminals.length) return;
    setPositions(prev => {
      const updated = { ...prev };
      let changed = false;
      terminals.forEach((t, i) => {
        if (!updated[t.id]) {
          const col = i % 5;
          const row = Math.floor(i / 5);
          updated[t.id] = { x: 12 + col * 16, y: 18 + row * 18 };
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [terminals, selectedPlanta?.id]);

  // Mutations
  const createPlantaMutation = useMutation({
    mutationFn: (data) => base44.entities.MapaPlanta.create(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries(['plantas-mapa']);
      setSelectedPlantaId(result.id);
      setShowNewPlantaForm(false);
      setNewPlantaNome('');
      toast.success('Planta criada!');
    },
  });

  const updatePlantaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MapaPlanta.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['plantas-mapa']),
  });

  const deletePlantaMutation = useMutation({
    mutationFn: (id) => base44.entities.MapaPlanta.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['plantas-mapa']);
      setSelectedPlantaId(null);
      toast.success('Planta removida');
    },
  });

  const handleSavePositions = () => {
    if (!selectedPlantaId) {
      toast.error('Selecione ou crie uma planta primeiro');
      return;
    }
    updatePlantaMutation.mutate({
      id: selectedPlantaId,
      data: { posicoes: JSON.stringify(positions) },
    });
    toast.success('Posições guardadas!');
    setIsEditMode(false);
  };

  const handleDragEnd = useCallback((terminalId, x, y) => {
    setPositions(prev => ({ ...prev, [terminalId]: { x, y } }));
  }, []);

  const handleImportPlanta = (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPlantaId) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      updatePlantaMutation.mutate({ id: selectedPlantaId, data: { planta_url: dataUrl } });
      toast.success('Planta importada!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCreatePlanta = () => {
    if (!newPlantaNome.trim()) return;
    createPlantaMutation.mutate({
      owner_email: isAdmin ? (filterUser || currentUser?.email) : currentUser?.email,
      nome: newPlantaNome.trim(),
      posicoes: '{}',
    });
  };

  const handleDeletePlanta = () => {
    if (!selectedPlantaId) return;
    if (!window.confirm(`Eliminar a planta "${selectedPlanta?.nome}"?`)) return;
    deletePlantaMutation.mutate(selectedPlantaId);
  };

  // Filtered terminals = only those belonging to the viewed user
  const visibleTerminals = terminals;
  const offlineTerminals = visibleTerminals.filter(t => t.status === 'offline');
  const onlineCount = visibleTerminals.filter(t => t.status === 'online').length;

  const mapHeight = isFullscreen ? 'calc(100vh - 200px)' : 480;

  return (
    <div className={cn(
      "min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full overflow-x-hidden",
      isFullscreen && "fixed inset-0 z-50 bg-white overflow-auto"
    )}>
      <div className="w-full px-3 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ── Header ────────────────────────────────── */}
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
            {/* Admin: filter by user */}
            {isAdmin && (
              <select
                value={filterUser}
                onChange={e => { setFilterUser(e.target.value); setSelectedPlantaId(null); setSelectedTerminal(null); }}
                className="h-8 rounded-lg border border-input bg-white px-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos os utilizadores</option>
                {allUsers.map(u => (
                  <option key={u.email} value={u.email}>{u.full_name ? `${u.full_name} (${u.email})` : u.email}</option>
                ))}
              </select>
            )}

            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              {onlineCount} online
            </Badge>
            {offlineTerminals.length > 0 && (
              <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                {offlineTerminals.length} offline
              </Badge>
            )}

            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries(['terminals-mapa'])}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Plantas selector ──────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 shrink-0">PLANTA:</span>

          <div className="flex items-center gap-1.5 flex-wrap">
            {plantas.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPlantaId(p.id); setSelectedTerminal(null); }}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  selectedPlantaId === p.id
                    ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-rose-300"
                )}
              >
                {p.nome}
                {isAdmin && p.owner_email !== currentUser?.email && (
                  <span className="ml-1 opacity-60">({p.owner_email?.split('@')[0]})</span>
                )}
              </button>
            ))}

            {/* New planta */}
            {!showNewPlantaForm ? (
              <button
                onClick={() => setShowNewPlantaForm(true)}
                className="px-3 py-1 rounded-full text-xs font-medium border border-dashed border-slate-300 text-slate-400 hover:border-rose-400 hover:text-rose-500 transition-all flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Nova planta
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newPlantaNome}
                  onChange={e => setNewPlantaNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreatePlanta(); if (e.key === 'Escape') { setShowNewPlantaForm(false); setNewPlantaNome(''); }}}
                  placeholder="Nome da planta..."
                  className="h-7 rounded-lg border border-rose-300 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400 w-36"
                />
                <Button size="sm" className="h-7 text-xs bg-rose-600 hover:bg-rose-700 px-2" onClick={handleCreatePlanta} disabled={createPlantaMutation.isPending}>
                  Criar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setShowNewPlantaForm(false); setNewPlantaNome(''); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Delete planta */}
          {selectedPlantaId && (isAdmin || selectedPlanta?.owner_email === currentUser?.email) && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 ml-auto" onClick={handleDeletePlanta}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* ── Map Card ──────────────────────────────── */}
        <Card className="bg-white border-slate-200 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/60 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {isEditMode ? (
                <>
                  <Button size="sm" onClick={handleSavePositions} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs gap-1" disabled={updatePlantaMutation.isPending}>
                    <Save className="h-3.5 w-3.5" /> Guardar posições
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsEditMode(false)} className="h-7 text-xs">
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  {selectedPlantaId && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)} className="h-7 text-xs gap-1">
                        <Move className="h-3.5 w-3.5" /> Editar posições
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-7 text-xs gap-1">
                        <Upload className="h-3.5 w-3.5" /> Importar planta
                      </Button>
                      {selectedPlanta?.planta_url && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-400 hover:text-red-500"
                          onClick={() => updatePlantaMutation.mutate({ id: selectedPlantaId, data: { planta_url: null } })}>
                          <Trash2 className="h-3 w-3 mr-1" /> Remover imagem
                        </Button>
                      )}
                    </>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImportPlanta} />
                </>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.max(50, z - 10))}><ZoomOut className="h-3.5 w-3.5" /></Button>
              <span className="text-xs text-slate-500 w-10 text-center font-mono">{zoom}%</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom(z => Math.min(200, z + 10))}><ZoomIn className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsFullscreen(f => !f)}>
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Canvas */}
          <div className="relative overflow-auto bg-slate-100" style={{ height: mapHeight }}>
            <div style={{ width: `${zoom}%`, minWidth: '100%', height: '100%', minHeight: 420, position: 'relative' }}>
              <div
                data-map-container
                className="relative w-full h-full"
                style={{
                  backgroundImage: selectedPlanta?.planta_url
                    ? `url(${selectedPlanta.planta_url})`
                    : `linear-gradient(to right,#dde3ed 1px,transparent 1px),linear-gradient(to bottom,#dde3ed 1px,transparent 1px)`,
                  backgroundSize: selectedPlanta?.planta_url ? 'cover' : `${GRID_SIZE}px ${GRID_SIZE}px`,
                  backgroundPosition: 'top left',
                  backgroundColor: '#f8fafc',
                  minHeight: 420,
                }}
                onClick={() => setSelectedTerminal(null)}
              >
                {/* Planta name label */}
                {selectedPlanta && (
                  <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-white/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold text-rose-600 shadow-sm pointer-events-none">
                    <MapPin className="h-3 w-3" />
                    PLANTA — {selectedPlanta.nome.toUpperCase()}
                  </div>
                )}

                {/* Edit mode banner */}
                {isEditMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 bg-blue-600 text-white text-xs px-4 py-1 rounded-full shadow-lg pointer-events-none">
                    Modo de edição — arraste os terminais
                  </div>
                )}

                {/* No planta selected */}
                {!selectedPlantaId && !loadingPlantas && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <MapPin className="h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">Crie ou selecione uma planta para começar</p>
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => setShowNewPlantaForm(true)}>
                      <Plus className="h-4 w-4 mr-1" /> Nova planta
                    </Button>
                  </div>
                )}

                {/* Markers */}
                {selectedPlantaId && visibleTerminals.map(terminal => {
                  const pos = positions[terminal.id] || { x: 50, y: 50 };
                  const isSelected = selectedTerminal?.id === terminal.id;
                  return (
                    <TerminalMarker
                      key={terminal.id}
                      terminal={terminal}
                      position={pos}
                      isEditMode={isEditMode}
                      onDragEnd={handleDragEnd}
                      onClick={setSelectedTerminal}
                      isSelected={isSelected}
                    />
                  );
                })}

                {/* Smart tooltip — rendered at map level, not inside marker */}
                <AnimatePresence>
                  {selectedTerminal && !isEditMode && (() => {
                    const pos = positions[selectedTerminal.id] || { x: 50, y: 50 };
                    return (
                      <MapTooltip
                        key={selectedTerminal.id}
                        terminal={selectedTerminal}
                        posX={pos.x}
                        posY={pos.y}
                        onClose={() => setSelectedTerminal(null)}
                      />
                    );
                  })()}
                </AnimatePresence>

                {loadingTerminals && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/50">
                    <div className="w-7 h-7 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* ── Legend ────────────────────────────────── */}
        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Legenda:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500 shrink-0" /> Online
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-500 shrink-0 animate-pulse" /> Offline
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500 shrink-0" /> Aviso
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-400 shrink-0" /> Desconhecido
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">Ícones: ZKTeco (digitais), Hikvision/Dahua (facial), Timmy/THbio (cloud), Anviz (mão), Suprema (íris)</span>
        </div>

        {/* ── Offline list ──────────────────────────── */}
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
                  initial={{ opacity: 0, x: -8 }}
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
                    <p className="text-xs text-slate-400 truncate">
                      {[terminal.local, terminal.cliente_nome].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <TerminalIcon terminal={terminal} size={28} />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}