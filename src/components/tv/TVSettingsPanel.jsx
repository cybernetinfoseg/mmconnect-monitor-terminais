import React from 'react';
import { Settings, X, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DISPLAY_OPTIONS = [
  { key: 'showLocal', label: 'Mostrar Local' },
  { key: 'showConexao', label: 'Mostrar Tipo/Endereço de Conexão' },
  { key: 'showEmail', label: 'Mostrar Email do Utilizador' },
  { key: 'showLastPing', label: 'Mostrar Último Ping' },
  { key: 'showLatencia', label: 'Mostrar Latência' },
  { key: 'showKPIs', label: 'Mostrar KPIs (Total/Online/Offline)' },
  { key: 'showAlertBanner', label: 'Mostrar Banner de Alertas' },
];

const GRID_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  { value: '2', label: '2 colunas' },
  { value: '3', label: '3 colunas' },
  { value: '4', label: '4 colunas' },
  { value: '5', label: '5 colunas' },
  { value: '6', label: '6 colunas' },
];

export default function TVSettingsPanel({ settings, onChange, onClose }) {
  const set = (key, val) => onChange({ ...settings, [key]: val });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-80 h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-400" />
            <h2 className="text-white font-bold">Configurar Visualização</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Grid columns */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Colunas do Grid</p>
            <Select value={settings.gridCols || 'auto'} onValueChange={v => set('gridCols', v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {GRID_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value} className="text-white hover:bg-slate-700">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Card size */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tamanho dos Cards</p>
            <Select value={settings.cardSize || 'md'} onValueChange={v => set('cardSize', v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="sm" className="text-white hover:bg-slate-700">Pequeno</SelectItem>
                <SelectItem value="md" className="text-white hover:bg-slate-700">Médio</SelectItem>
                <SelectItem value="lg" className="text-white hover:bg-slate-700">Grande</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show only offline */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filtro Rápido</p>
            <div className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
              <Label className="text-slate-300 cursor-pointer">Apenas terminais offline</Label>
              <Switch
                checked={settings.onlyOffline || false}
                onCheckedChange={v => set('onlyOffline', v)}
              />
            </div>
          </div>

          {/* Display options */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dados Exibidos</p>
            <div className="space-y-2">
              {DISPLAY_OPTIONS.map(opt => (
                <div key={opt.key} className="flex items-center justify-between bg-slate-800 rounded-xl px-4 py-3">
                  <Label className="text-slate-300 cursor-pointer flex items-center gap-2">
                    {settings[opt.key] !== false ? (
                      <Eye className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    {opt.label}
                  </Label>
                  <Switch
                    checked={settings[opt.key] !== false}
                    onCheckedChange={v => set(opt.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">Configurações salvas automaticamente</p>
        </div>
      </div>
    </div>
  );
}