import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Palette } from 'lucide-react';
import { TYPE_ICONS, MARKER_SIZES } from './FloorPlanCanvas';

const TIPO_LABELS = {
  ip_local:        'IP Local',
  ip_publico:      'IP Público',
  dns:             'DNS',
  p2s:             'P2S',
  heartbeat:       'Heartbeat',
  adms_push:       'ADMS/Push',
  sdk_tcp:         'SDK TCP',
  websocket_cloud: 'WebSocket Cloud',
  api:             'API',
};

const SIZE_OPTIONS = [
  { value: 'small',  label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large',  label: 'Grande' },
];

export default function IconConfigPanel({ iconConfig, onChange }) {
  const handleChange = (tipo, field, value) => {
    onChange({
      ...iconConfig,
      [tipo]: {
        ...(iconConfig[tipo] || {}),
        [field]: value,
      },
    });
  };

  return (
    <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs text-slate-500 font-semibold uppercase tracking-wider flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-violet-500" /> Ícones por Tipo
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {Object.entries(TIPO_LABELS).map(([tipo, label]) => {
          const cfg = iconConfig[tipo] || {};
          const currentIcon = cfg.icon || TYPE_ICONS[tipo] || TYPE_ICONS.default;
          const currentSize = cfg.size || 'medium';
          return (
            <div key={tipo} className="flex items-center gap-1.5">
              <span className="text-xs text-slate-600 w-20 shrink-0 truncate" title={label}>{label}</span>
              <Input
                value={currentIcon}
                onChange={e => handleChange(tipo, 'icon', e.target.value)}
                className="h-7 w-12 text-center text-base px-1 shrink-0"
                maxLength={4}
                title="Emoji / ícone"
              />
              <Select value={currentSize} onValueChange={v => handleChange(tipo, 'size', v)}>
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}