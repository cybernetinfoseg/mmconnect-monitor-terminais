import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import TerminalMarker from './TerminalMarker';
import MapTooltip from './MapTooltip';

/**
 * Compute the rendered area of an <img> with a given object-fit inside a container.
 * Returns { left, top, width, height } in pixels relative to the container.
 */
function getImageRenderedRect(img, containerRect, fit) {
  if (!img) return null;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;
  const cw = containerRect.width;
  const ch = containerRect.height;

  if (fit === 'fill' || fit === 'none') {
    // fill: stretches to container; none: not scaled
    if (fit === 'none') {
      const w = Math.min(nw, cw);
      const h = Math.min(nh, ch);
      return { left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h };
    }
    return { left: 0, top: 0, width: cw, height: ch };
  }

  const imgRatio = nw / nh;
  const conRatio = cw / ch;
  let rw, rh;
  if (fit === 'contain') {
    if (imgRatio > conRatio) { rw = cw; rh = cw / imgRatio; }
    else { rh = ch; rw = ch * imgRatio; }
  } else { // cover
    if (imgRatio > conRatio) { rh = ch; rw = ch * imgRatio; }
    else { rw = cw; rh = cw / imgRatio; }
  }
  return {
    left: (cw - rw) / 2,
    top: (ch - rh) / 2,
    width: rw,
    height: rh,
  };
}

export default function MapCanvas({
  zoom, mapHeight, selectedPlanta, selectedPlantaId, loadingPlantas, loadingTerminals,
  imageFit, isEditMode, visibleTerminals, positions, selectedTerminal, setSelectedTerminal,
  iconOverrides, iconSize, handleDragEnd, setShowNewPlantaForm, GRID_SIZE,
}) {
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const [imgReady, setImgReady] = useState(false);

  // Reset imgReady when image source changes
  useEffect(() => { setImgReady(false); }, [selectedPlanta?.planta_url]);

  // Convert stored % position (relative to image area) → CSS % relative to container
  const toContainerPct = useCallback((pos) => {
    if (!selectedPlanta?.planta_url || !imgReady) return pos;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return pos;
    const containerRect = container.getBoundingClientRect();
    const ir = getImageRenderedRect(img, containerRect, imageFit);
    if (!ir) return pos;
    return {
      x: (ir.left + (pos.x / 100) * ir.width) / containerRect.width * 100,
      y: (ir.top + (pos.y / 100) * ir.height) / containerRect.height * 100,
    };
  }, [selectedPlanta?.planta_url, imageFit, imgReady]);

  // Convert a pointer event position (relative to container) → image-relative %
  const fromContainerToImagePct = useCallback((clientX, clientY) => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container) return { x: 50, y: 50 };
    const containerRect = container.getBoundingClientRect();
    if (!selectedPlanta?.planta_url || !imgReady || !img) {
      return {
        x: Math.max(1, Math.min(99, ((clientX - containerRect.left) / containerRect.width) * 100)),
        y: Math.max(1, Math.min(99, ((clientY - containerRect.top) / containerRect.height) * 100)),
      };
    }
    const ir = getImageRenderedRect(img, containerRect, imageFit);
    if (!ir) return { x: 50, y: 50 };
    return {
      x: Math.max(0, Math.min(100, ((clientX - containerRect.left - ir.left) / ir.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - containerRect.top - ir.top) / ir.height) * 100)),
    };
  }, [selectedPlanta?.planta_url, imageFit, imgReady]);

  // Wrap handleDragEnd to convert coordinates
  const handleDragEndConverted = useCallback((terminalId, containerX, containerY) => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    // containerX/containerY are already % of container coming from TerminalMarker
    const clientX = containerRect.left + (containerX / 100) * containerRect.width;
    const clientY = containerRect.top + (containerY / 100) * containerRect.height;
    const imgPct = fromContainerToImagePct(clientX, clientY);
    handleDragEnd(terminalId, imgPct.x, imgPct.y);
  }, [fromContainerToImagePct, handleDragEnd]);

  const hasImage = !!selectedPlanta?.planta_url;

  return (
    <div className="relative overflow-auto bg-slate-100" style={{ height: mapHeight }}>
      <div style={{
        width: zoom <= 100 ? '100%' : `${zoom}%`,
        minWidth: '100%',
        height: zoom <= 100 ? '100%' : `${zoom}%`,
        minHeight: 420,
        position: 'relative',
      }}>
        {/* Container that all markers are positioned relative to */}
        <div
          ref={containerRef}
          data-map-container
          className="relative w-full h-full"
          style={{
            backgroundImage: !hasImage
              ? `linear-gradient(to right,#dde3ed 1px,transparent 1px),linear-gradient(to bottom,#dde3ed 1px,transparent 1px)`
              : undefined,
            backgroundSize: !hasImage ? `${GRID_SIZE}px ${GRID_SIZE}px` : undefined,
            backgroundColor: '#f8fafc',
            minHeight: 420,
          }}
          onClick={() => setSelectedTerminal(null)}
        >
          {/* Background image via <img> so we can measure rendered rect */}
          {hasImage && (
            <img
              ref={imgRef}
              src={selectedPlanta.planta_url}
              alt="planta"
              onLoad={() => setImgReady(true)}
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              style={{ objectFit: imageFit === 'none' ? 'none' : imageFit, objectPosition: 'center' }}
            />
          )}

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
          {selectedPlantaId && (!hasImage || imgReady) && visibleTerminals.map(terminal => {
            const storedPos = positions[terminal.id] || { x: 50, y: 50 };
            const displayPos = toContainerPct(storedPos);
            const isSelected = selectedTerminal?.id === terminal.id;
            return (
              <TerminalMarker
                key={terminal.id}
                terminal={terminal}
                position={displayPos}
                isEditMode={isEditMode}
                onDragEnd={handleDragEndConverted}
                onClick={setSelectedTerminal}
                isSelected={isSelected}
                iconOverride={iconOverrides[terminal.id]}
                iconSize={iconSize}
              />
            );
          })}

          {/* Smart tooltip */}
          <AnimatePresence>
            {selectedTerminal && !isEditMode && (() => {
              const storedPos = positions[selectedTerminal.id] || { x: 50, y: 50 };
              const displayPos = toContainerPct(storedPos);
              return (
                <MapTooltip
                  key={selectedTerminal.id}
                  terminal={selectedTerminal}
                  posX={displayPos.x}
                  posY={displayPos.y}
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
  );
}