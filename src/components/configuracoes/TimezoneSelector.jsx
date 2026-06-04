import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Globe, Save, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { getBrowserTimezone } from '@/hooks/useUserTimezone';

// Lista de timezones comuns agrupadas por região
const TIMEZONES = [
  // Europa
  { value: 'Europe/London',        label: '🇬🇧 Londres (GMT/BST)',           offset: 'UTC+0/+1' },
  { value: 'Europe/Lisbon',        label: '🇵🇹 Lisboa (WET/WEST)',           offset: 'UTC+0/+1' },
  { value: 'Europe/Madrid',        label: '🇪🇸 Madrid (CET/CEST)',           offset: 'UTC+1/+2' },
  { value: 'Europe/Paris',         label: '🇫🇷 Paris (CET/CEST)',            offset: 'UTC+1/+2' },
  { value: 'Europe/Berlin',        label: '🇩🇪 Berlim (CET/CEST)',           offset: 'UTC+1/+2' },
  { value: 'Europe/Rome',          label: '🇮🇹 Roma (CET/CEST)',             offset: 'UTC+1/+2' },
  { value: 'Europe/Amsterdam',     label: '🇳🇱 Amesterdão (CET/CEST)',       offset: 'UTC+1/+2' },
  { value: 'Europe/Brussels',      label: '🇧🇪 Bruxelas (CET/CEST)',         offset: 'UTC+1/+2' },
  { value: 'Europe/Warsaw',        label: '🇵🇱 Varsóvia (CET/CEST)',         offset: 'UTC+1/+2' },
  { value: 'Europe/Stockholm',     label: '🇸🇪 Estocolmo (CET/CEST)',        offset: 'UTC+1/+2' },
  { value: 'Europe/Athens',        label: '🇬🇷 Atenas (EET/EEST)',           offset: 'UTC+2/+3' },
  { value: 'Europe/Bucharest',     label: '🇷🇴 Bucareste (EET/EEST)',        offset: 'UTC+2/+3' },
  { value: 'Europe/Helsinki',      label: '🇫🇮 Helsínquia (EET/EEST)',       offset: 'UTC+2/+3' },
  { value: 'Europe/Moscow',        label: '🇷🇺 Moscovo (MSK)',               offset: 'UTC+3' },
  // Américas
  { value: 'America/Sao_Paulo',    label: '🇧🇷 São Paulo (BRT/BRST)',        offset: 'UTC-3/-2' },
  { value: 'America/Fortaleza',    label: '🇧🇷 Fortaleza (BRT)',             offset: 'UTC-3' },
  { value: 'America/Manaus',       label: '🇧🇷 Manaus (AMT)',                offset: 'UTC-4' },
  { value: 'America/Belem',        label: '🇧🇷 Belém (BRT)',                 offset: 'UTC-3' },
  { value: 'America/New_York',     label: '🇺🇸 Nova Iorque (EST/EDT)',        offset: 'UTC-5/-4' },
  { value: 'America/Chicago',      label: '🇺🇸 Chicago (CST/CDT)',           offset: 'UTC-6/-5' },
  { value: 'America/Denver',       label: '🇺🇸 Denver (MST/MDT)',            offset: 'UTC-7/-6' },
  { value: 'America/Los_Angeles',  label: '🇺🇸 Los Angeles (PST/PDT)',       offset: 'UTC-8/-7' },
  { value: 'America/Anchorage',    label: '🇺🇸 Anchorage (AKST/AKDT)',       offset: 'UTC-9/-8' },
  { value: 'America/Toronto',      label: '🇨🇦 Toronto (EST/EDT)',            offset: 'UTC-5/-4' },
  { value: 'America/Vancouver',    label: '🇨🇦 Vancouver (PST/PDT)',          offset: 'UTC-8/-7' },
  { value: 'America/Mexico_City',  label: '🇲🇽 Cidade do México (CST/CDT)',  offset: 'UTC-6/-5' },
  { value: 'America/Bogota',       label: '🇨🇴 Bogotá (COT)',                offset: 'UTC-5' },
  { value: 'America/Lima',         label: '🇵🇪 Lima (PET)',                  offset: 'UTC-5' },
  { value: 'America/Santiago',     label: '🇨🇱 Santiago (CLT/CLST)',         offset: 'UTC-4/-3' },
  { value: 'America/Buenos_Aires', label: '🇦🇷 Buenos Aires (ART)',          offset: 'UTC-3' },
  { value: 'America/Caracas',      label: '🇻🇪 Caracas (VET)',               offset: 'UTC-4' },
  // África
  { value: 'Africa/Luanda',        label: '🇦🇴 Luanda (WAT)',                offset: 'UTC+1' },
  { value: 'Africa/Maputo',        label: '🇲🇿 Maputo (CAT)',                offset: 'UTC+2' },
  { value: 'Africa/Johannesburg',  label: '🇿🇦 Joanesburgo (SAST)',          offset: 'UTC+2' },
  { value: 'Africa/Nairobi',       label: '🇰🇪 Nairóbi (EAT)',              offset: 'UTC+3' },
  { value: 'Africa/Lagos',         label: '🇳🇬 Lagos (WAT)',                 offset: 'UTC+1' },
  { value: 'Africa/Cairo',         label: '🇪🇬 Cairo (EET)',                 offset: 'UTC+2' },
  { value: 'Africa/Casablanca',    label: '🇲🇦 Casablanca (WET/WEST)',       offset: 'UTC+0/+1' },
  // Ásia
  { value: 'Asia/Dubai',           label: '🇦🇪 Dubai (GST)',                 offset: 'UTC+4' },
  { value: 'Asia/Riyadh',          label: '🇸🇦 Riade (AST)',                 offset: 'UTC+3' },
  { value: 'Asia/Kolkata',         label: '🇮🇳 Índia (IST)',                 offset: 'UTC+5:30' },
  { value: 'Asia/Dhaka',           label: '🇧🇩 Dhaka (BST)',                 offset: 'UTC+6' },
  { value: 'Asia/Bangkok',         label: '🇹🇭 Bangkok (ICT)',               offset: 'UTC+7' },
  { value: 'Asia/Singapore',       label: '🇸🇬 Singapura (SGT)',             offset: 'UTC+8' },
  { value: 'Asia/Shanghai',        label: '🇨🇳 Xangai (CST)',                offset: 'UTC+8' },
  { value: 'Asia/Hong_Kong',       label: '🇭🇰 Hong Kong (HKT)',             offset: 'UTC+8' },
  { value: 'Asia/Tokyo',           label: '🇯🇵 Tóquio (JST)',                offset: 'UTC+9' },
  { value: 'Asia/Seoul',           label: '🇰🇷 Seul (KST)',                  offset: 'UTC+9' },
  { value: 'Asia/Taipei',          label: '🇹🇼 Taipé (CST)',                 offset: 'UTC+8' },
  { value: 'Asia/Kuala_Lumpur',    label: '🇲🇾 Kuala Lumpur (MYT)',          offset: 'UTC+8' },
  { value: 'Asia/Jakarta',         label: '🇮🇩 Jacarta (WIB)',               offset: 'UTC+7' },
  { value: 'Asia/Manila',          label: '🇵🇭 Manila (PHT)',                offset: 'UTC+8' },
  { value: 'Asia/Karachi',         label: '🇵🇰 Carachi (PKT)',               offset: 'UTC+5' },
  { value: 'Asia/Tehran',          label: '🇮🇷 Teerão (IRST/IRDT)',          offset: 'UTC+3:30/+4:30' },
  { value: 'Asia/Istanbul',        label: '🇹🇷 Istambul (TRT)',              offset: 'UTC+3' },
  // Oceânia
  { value: 'Australia/Sydney',     label: '🇦🇺 Sydney (AEST/AEDT)',          offset: 'UTC+10/+11' },
  { value: 'Australia/Melbourne',  label: '🇦🇺 Melbourne (AEST/AEDT)',       offset: 'UTC+10/+11' },
  { value: 'Australia/Perth',      label: '🇦🇺 Perth (AWST)',                offset: 'UTC+8' },
  { value: 'Pacific/Auckland',     label: '🇳🇿 Auckland (NZST/NZDT)',        offset: 'UTC+12/+13' },
  // UTC
  { value: 'UTC',                  label: '🌐 UTC (Coordinated Universal Time)', offset: 'UTC+0' },
];

export { TIMEZONES };

export default function TimezoneSelector({ user, onSaved }) {
  const [timezone, setTimezone] = useState(user?.timezone || getBrowserTimezone());
  const [saving, setSaving] = useState(false);

  // Preview da hora atual na timezone selecionada
  const [preview, setPreview] = useState('');
  useEffect(() => {
    const update = () => {
      try {
        const now = new Date();
        const time = now.toLocaleTimeString('pt-PT', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const date = now.toLocaleDateString('pt-PT', { timeZone: timezone, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
        setPreview(`${time} — ${date}`);
      } catch {
        setPreview('Timezone inválida');
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe({ timezone });
      toast.success('Timezone atualizada! A página irá recarregar.');
      onSaved?.(timezone);
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast.error('Erro ao guardar timezone');
    } finally {
      setSaving(false);
    }
  };

  const browserTz = getBrowserTimezone();

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <Globe className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Timezone do sistema do seu dispositivo: <code className="bg-blue-100 px-1 rounded text-xs">{browserTz}</code></p>
          <p className="text-xs mt-0.5 text-blue-600">O DST (horário de verão) é ajustado <strong>automaticamente</strong> pela timezone selecionada.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" /> Timezone preferida
        </Label>
        <Select value={timezone} onValueChange={setTimezone}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TIMEZONES.map(tz => (
              <SelectItem key={tz.value} value={tz.value}>
                <span>{tz.label}</span>
                <span className="ml-2 text-xs text-slate-400">{tz.offset}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
        <Clock className="h-4 w-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-xs text-slate-500 font-medium">Hora atual nesta timezone:</p>
          <p className="text-sm font-mono font-semibold text-slate-800">{preview}</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving || timezone === user?.timezone} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
        <Save className="h-4 w-4" />
        {saving ? 'A guardar...' : 'Guardar Timezone'}
      </Button>
    </div>
  );
}