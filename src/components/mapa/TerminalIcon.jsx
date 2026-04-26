import React from 'react';

// SVG icons inspired by real biometric terminal designs
// Colors based on status

const iconByFabricante = {
  // Fingerprint terminals
  zkteco: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Fingerprint lines */}
      <path d="M20 10 C14 10 10 14.5 10 20 C10 25.5 14 30 20 30" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M20 13 C15.5 13 13 16.5 13 20 C13 23.5 15.5 27 20 27" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M20 16 C17.5 16 16 18 16 20 C16 22 17.5 24 20 24" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <circle cx="20" cy="20" r="1.5" fill="white"/>
    </svg>
  ),
  anviz: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Hand/palm icon */}
      <path d="M14 26 L14 18 C14 17 15 16 16 16 C17 16 18 17 18 18 L18 14 C18 13 19 12 20 12 C21 12 22 13 22 14 L22 16 C22 15 23 14 24 14 C25 14 26 15 26 16 L26 26 C26 28 24 30 22 30 L18 30 C16 30 14 28 14 26Z" stroke="white" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
    </svg>
  ),
  // Face recognition
  hikvision: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Face scan icon */}
      <circle cx="20" cy="18" r="6" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="17" r="1" fill="white"/>
      <circle cx="22.5" cy="17" r="1" fill="white"/>
      <path d="M17 21 Q20 23 23 21" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* Scan corners */}
      <path d="M8 8 L8 12 M8 8 L12 8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M32 8 L32 12 M32 8 L28 8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 32 L8 28 M8 32 L12 32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M32 32 L32 28 M32 32 L28 32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  dahua: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Face + body */}
      <circle cx="20" cy="15" r="5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="18" cy="14" r="0.9" fill="white"/>
      <circle cx="22" cy="14" r="0.9" fill="white"/>
      <path d="M17.5 17 Q20 19 22.5 17" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      <path d="M12 30 C12 25 15 23 20 23 C25 23 28 25 28 30" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  timmy: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* WebSocket/wifi icon + face */}
      <circle cx="20" cy="16" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="18.5" cy="15" r="0.9" fill="white"/>
      <circle cx="21.5" cy="15" r="0.9" fill="white"/>
      <path d="M18 18 Q20 19.5 22 18" stroke="white" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
      {/* wifi arcs */}
      <path d="M13 27 Q20 22 27 27" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M16 30 Q20 27 24 30" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
    </svg>
  ),
  suprema: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Iris/eye scan */}
      <ellipse cx="20" cy="20" rx="10" ry="7" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="20" cy="20" r="4" stroke="white" strokeWidth="1.5" fill="none"/>
      <circle cx="20" cy="20" r="1.5" fill="white"/>
      <path d="M20 11 L20 9 M20 31 L20 29 M10 20 L8 20 M32 20 L30 20" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  nitgen: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Fingerprint + card */}
      <rect x="10" y="14" width="20" height="14" rx="2" stroke="white" strokeWidth="1.5" fill="none"/>
      <path d="M20 14 C17 14 15 16 15 19 C15 22 17 24 20 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <path d="M20 17 C18.5 17 18 18 18 19 C18 20 18.5 21 20 21" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <circle cx="20" cy="19" r="1" fill="white"/>
    </svg>
  ),
  outro: ({ color, size }) => (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={color} stroke="white" strokeWidth="2"/>
      {/* Generic card/access */}
      <rect x="10" y="12" width="20" height="16" rx="3" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="16" cy="20" r="3" stroke="white" strokeWidth="1.5" fill="none"/>
      <path d="M22 17 L28 17 M22 20 L28 20 M22 23 L26 23" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

// THbio same as timmy
iconByFabricante['thbio'] = iconByFabricante.timmy;

const STATUS_COLORS = {
  online: '#10b981',
  warning: '#f59e0b',
  offline: '#ef4444',
  unknown: '#94a3b8',
};

export function getTerminalIcon(terminal, size = 40) {
  const fab = (terminal.fabricante || 'outro').toLowerCase().replace(/[^a-z]/g, '');
  const color = STATUS_COLORS[terminal.status] || STATUS_COLORS.unknown;

  // Map fabricante aliases
  const fabKey = fab.includes('zkteco') ? 'zkteco'
    : fab.includes('anviz') ? 'anviz'
    : fab.includes('hikvision') ? 'hikvision'
    : fab.includes('dahua') ? 'dahua'
    : fab.includes('timmy') || fab.includes('thbio') || fab.includes('timbio') ? 'timmy'
    : fab.includes('suprema') ? 'suprema'
    : fab.includes('nitgen') ? 'nitgen'
    : 'outro';

  const IconComp = iconByFabricante[fabKey] || iconByFabricante.outro;
  return <IconComp color={color} size={size} />;
}

export default function TerminalIcon({ terminal, size = 40 }) {
  return getTerminalIcon(terminal, size);
}