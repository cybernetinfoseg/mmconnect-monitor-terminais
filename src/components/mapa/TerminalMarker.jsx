import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import TerminalIcon from './TerminalIcon';

export default function TerminalMarker({ terminal, position, isEditMode, onDragEnd, onClick, isSelected, iconOverride, iconSize = 40 }) {
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
      // Get the data-map-container rect to compute % for the callback
      const container = markerRef.current?.closest('[data-map-container]');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      // Pass % relative to the container div — MapCanvas will convert to image-relative %
      onDragEnd(
        terminal.id,
        Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
        Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100))
      );
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
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
        {terminal.status === 'offline' && (
          <span className="absolute rounded-full animate-ping bg-red-400 opacity-40 pointer-events-none"
            style={{ width: iconSize + 8, height: iconSize + 8, top: -4, left: -4 }} />
        )}
        <div className={cn(
          "rounded-xl overflow-hidden shadow-lg",
          isSelected && "ring-2 ring-offset-2 ring-blue-400"
        )}>
          <TerminalIcon terminal={terminal} size={iconSize} iconOverride={iconOverride} />
        </div>
        <span className="text-[9px] font-semibold text-slate-800 bg-white/90 px-1.5 py-0.5 rounded shadow-sm max-w-[70px] truncate text-center leading-tight whitespace-nowrap">
          {terminal.nome}
        </span>
      </motion.div>
    </div>
  );
}