import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, RefreshCw, Save } from 'lucide-react';

const LANGUAGE_OPTIONS = [
  { value: 0, label: 'English' },
  { value: 1, label: 'Simplified Chinese' },
  { value: 2, label: 'Taiwan Chinese' },
  { value: 3, label: 'Japanese' },
  { value: 9, label: 'Spanish' },
  { value: 10, label: 'French' },
  { value: 11, label: 'Portuguese' },
  { value: 12, label: 'German' },
  { value: 13, label: 'Russian' },
  { value: 15, label: 'Italian' },
  { value: 17, label: 'Arabic' },
];

const VERIFYMODE_OPTIONS = [
  { value: 0, label: 'Cartão OU Impressão OU Senha' },
  { value: 1, label: 'Cartão + Impressão' },
  { value: 2, label: 'Senha + Impressão' },
  { value: 3, label: 'Cartão + Impressão + Senha' },
  { value: 4, label: 'Cartão + Senha' },
];

export default function TerminalParamForm({ terminal, onClose }) {
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [form, setForm] = useState({
    language: '',
    volume: '',
    screensaver: '',
    verifymode: '',
    sleep: '',
    userfpnum: '',
    loghint: '',
    reverifytime: '',
  });
  const [message, setMessage] = useState(null);

  const readParams = async () => {
    setReading(true);
    setMessage(null);
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminal.id,
        action: 'getparam',
        params: {},
      });
      if (resp.data?.success && resp.data.data) {
        const d = resp.data.data;
        setForm({
          language: d.language ?? '',
          volume: d.volume ?? '',
          screensaver: d.screensaver ?? '',
          verifymode: d.verifymode ?? '',
          sleep: d.sleep ?? '',
          userfpnum: d.userfpnum ?? '',
          loghint: d.loghint ?? '',
          reverifytime: d.reverifytime ?? '',
        });
        setMessage({ type: 'success', text: 'Parâmetros carregados do terminal.' });
      } else {
        setMessage({ type: 'error', text: resp.data?.error || 'Falha ao ler parâmetros.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: terminal.id,
        action: 'setparam',
        params: form,
      });
      if (resp.data?.success) {
        setMessage({ type: 'success', text: 'Configurações aplicadas com sucesso!' });
      } else {
        setMessage({ type: 'error', text: resp.data?.error || 'Falha ao aplicar configurações.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Configurar Parâmetros do Terminal</p>
        <Button size="sm" variant="outline" onClick={readParams} disabled={reading}>
          {reading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="ml-1">Ler do Terminal</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Idioma */}
        <div className="space-y-1">
          <Label className="text-xs">Idioma</Label>
          <Select value={String(form.language)} onValueChange={v => set('language', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Volume */}
        <div className="space-y-1">
          <Label className="text-xs">Volume (0-10)</Label>
          <Input
            type="number" min={0} max={10}
            className="h-8 text-xs"
            value={form.volume}
            onChange={e => set('volume', e.target.value)}
            placeholder="0-10"
          />
        </div>

        {/* Modo de verificação */}
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Modo de Verificação</Label>
          <Select value={String(form.verifymode)} onValueChange={v => set('verifymode', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              {VERIFYMODE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Screensaver */}
        <div className="space-y-1">
          <Label className="text-xs">Screensaver (seg, 0=deslig.)</Label>
          <Input
            type="number" min={0} max={255}
            className="h-8 text-xs"
            value={form.screensaver}
            onChange={e => set('screensaver', e.target.value)}
            placeholder="0-255"
          />
        </div>

        {/* Re-verify time */}
        <div className="space-y-1">
          <Label className="text-xs">Re-verificação (min, 0=deslig.)</Label>
          <Input
            type="number" min={0} max={255}
            className="h-8 text-xs"
            value={form.reverifytime}
            onChange={e => set('reverifytime', e.target.value)}
            placeholder="0-255"
          />
        </div>

        {/* Impressões por utilizador */}
        <div className="space-y-1">
          <Label className="text-xs">Impressões / Utilizador (1-10)</Label>
          <Input
            type="number" min={1} max={10}
            className="h-8 text-xs"
            value={form.userfpnum}
            onChange={e => set('userfpnum', e.target.value)}
            placeholder="1-10"
          />
        </div>

        {/* Log hint */}
        <div className="space-y-1">
          <Label className="text-xs">Aviso Logs Cheios (0=deslig.)</Label>
          <Input
            type="number" min={0}
            className="h-8 text-xs"
            value={form.loghint}
            onChange={e => set('loghint', e.target.value)}
            placeholder="ex: 1000"
          />
        </div>

        {/* Sleep */}
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Modo Sleep do Sensor</Label>
          <Select value={String(form.sleep)} onValueChange={v => set('sleep', v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Desligado (sensor adormece)</SelectItem>
              <SelectItem value="1">Sempre ativo (sensor sempre ligado)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {message && (
        <p className={`text-xs rounded p-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={onClose}>Fechar</Button>
        <Button size="sm" onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Aplicar
        </Button>
      </div>
    </div>
  );
}