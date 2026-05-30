// ScheduledActionModal.jsx — NOC Monitor: Agendamento de Comandos com Fuso Horário
// ✅ VERSÃO ATUALIZADA: Aplica e exibe as ações baseando-se no useUserTimezone
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ACOES = [
  { value: 'settime',    label: 'Acertar Relógio' },
  { value: 'getlogs',    label: 'Recolher Marcações' },
  { value: 'reboot',     label: 'Reiniciar Terminal' },
  { value: 'opendoor',   label: 'Abrir Porta' },
  { value: 'getdevinfo', label: 'Info do Dispositivo' },
  { value: 'lockctrl',   label: 'Forçar Porta Aberta' },
];

const DIAS = [
  { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' }
];

export default function ScheduledActionModal({ schedule, onClose, onSaved }) {
  const { timezone: userTimezone } = useUserTimezone();
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    terminal_id: '',
    acao: 'settime',
    frequencia: 'diaria', // diaria, semanal, mensal, unica
    hora: '00:00',
    dias_semana: [],
    dia_mes: '1',
    data_unica: '',
    ativo: true
  });

  // Carrega os terminais para o Select
  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-select'],
    queryFn: () => base44.entities.Terminal.list(),
  });

  // Se estiver a editar um agendamento existente, popula o formulário
  useEffect(() => {
    if (schedule) {
      setForm({
        id: schedule.id,
        terminal_id: schedule.terminal_id || '',
        acao: schedule.acao || 'settime',
        frequencia: schedule.frequencia || 'diaria',
        hora: schedule.hora || '00:00',
        dias_semana: schedule.dias_semana || [],
        dia_mes: schedule.dia_mes?.toString() || '1',
        data_unica: schedule.data_unica ? schedule.data_unica.substring(0, 16) : '',
        ativo: schedule.ativo !== false
      });
    } else if (terminals.length > 0) {
      setForm(f => ({ ...f, terminal_id: terminals[0].id }));
    }
  }, [schedule, terminals]);

  const toggleDiaSemana = (val) => {
    setForm(f => {
      const exists = f.dias_semana.includes(val);
      return {
        ...f,
        dias_semana: exists ? f.dias_semana.filter(d => d !== val) : [...f.dias_semana, val]
      };
    });
  };

  const handleSave = async () => {
    if (!form.terminal_id) {
      toast.error('Por favor, selecione um terminal.');
      return;
    }

    if (form.frequencia === 'unica' && !form.data_unica) {
      toast.error('Por favor, selecione a data e hora para a execução única.');
      return;
    }

    setSaving(true);
    const toastId = toast.loading('A guardar agendamento...');

    try {
      // Monta o payload incluindo explicitamente a timezone do utilizador que criou/editou o agendamento
      const payload = {
        ...form,
        dia_mes: form.frequencia === 'mensal' ? parseInt(form.dia_mes, 10) : null,
        dias_semana: form.frequencia === 'semanal' ? form.dias_semana : [],
        data_unica: form.frequencia === 'unica' ? form.data_unica : null,
        // Injeta a timezone para que o Worker do CRON saiba em qual fuso horário basear o disparo do gatilho
        timezone: userTimezone || 'Europe/Lisbon'
      };

      let resultado;
      if (form.id) {
        resultado = await base44.entities.ScheduledAction.update(form.id, payload);
      } else {
        resultado = await base44.entities.ScheduledAction.create(payload);
      }

      toast.success('Agendamento guardado com sucesso!', { id: toastId });
      if (onSaved) onSaved(resultado);
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao guardar o agendamento no sistema.', { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-800">
            {form.id ? 'Editar Agendamento Automatizado' : 'Criar Nova Ação Agendada'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Alvo do Terminal */}
          <div className="space-y-1">
            <Label>Terminal Alvo *</Label>
            <Select value={form.terminal_id} onValueChange={v => setForm(f => ({ ...f, terminal_id: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um dispositivo..." />
              </SelectTrigger>
              <SelectContent>
                {terminals.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.nome} <span className="text-slate-400 font-mono">({t.sn})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Ação */}
          <div className="space-y-1">
            <Label>Ação a Executar *</Label>
            <Select value={form.acao} onValueChange={v => setForm(f => ({ ...f, acao: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACOES.map(a => (
                  <SelectItem key={a.value} value={a.value} className="text-xs">{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequência do Cron */}
          <div className="space-y-1">
            <Label>Frequência de Execução *</Label>
            <Select value={form.frequencia} onValueChange={v => setForm(f => ({ ...f, frequencia: v }))}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="diaria" className="text-xs">Repetir Diariamente</SelectItem>
                <SelectItem value="semanal" className="text-xs">Repetir Semanalmente</SelectItem>
                <SelectItem value="mensal" className="text-xs">Repetir Mensalmente</SelectItem>
                <SelectItem value="unica" className="text-xs">Uma única vez (Data fixa)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Inputs Dinâmicos dependendo da frequência */}
          {form.frequencia !== 'unica' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Hora do Disparo ({userTimezone || 'UTC'}) *</Label>
                <Input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} className="h-9 text-xs" />
              </div>
            </div>
          )}

          {/* Dias da semana */}
          {form.frequencia === 'semanal' && (
            <div className="space-y-1.5">
              <Label>Dias da Semana *</Label>
              <div className="flex gap-1 flex-wrap">
                {DIAS.map(d => {
                  const active = form.dias_semana.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDiaSemana(d.value)}
                      className={cn(
                        "h-8 px-2.5 rounded-md border text-xs font-medium transition-all",
                        active 
                          ? "bg-blue-600 border-blue-600 text-white" 
                          : "bg-white text-slate-600 hover:bg-slate-50 border-slate-200"
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dia do Mês */}
          {form.frequencia === 'mensal' && (
            <div className="space-y-1">
              <Label>Dia do Mês (1-31) *</Label>
              <Input type="number" min={1} max={31} value={form.dia_mes} onChange={e => setForm(f => ({ ...f, dia_mes: e.target.value }))} className="h-9 text-xs" />
            </div>
          )}

          {/* Data única com timezone visual */}
          {form.frequencia === 'unica' && (
            <div className="space-y-1">
              <Label>Data e Hora Local ({userTimezone || 'UTC'}) *</Label>
              <Input type="datetime-local" value={form.data_unica} onChange={e => setForm(f => ({ ...f, data_unica: e.target.value }))} className="h-9 text-xs" />
            </div>
          )}

          {/* Alternador Ativo */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
            <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
            <Label className="cursor-pointer font-medium text-slate-700">Agendamento ativo (Em execução)</Label>
          </div>

          {/* Contexto Informativo de Timezone */}
          <div className="text-[11px] text-slate-500 bg-slate-50 p-3 border border-slate-200/80 rounded-lg space-y-1">
            <p>🌍 **Regra de Fuso Horário Ativa:**</p>
            <p>Este agendamento será processado tendo em conta o fuso horário **{userTimezone}**. O motor do servidor converterá automaticamente o gatilho para o horário correto do servidor Python.</p>
          </div>

          {/* Alerta de Perigo para a ação de Reboot */}
          {form.acao === 'reboot' && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ **Aviso:** O comando de reinício causará indisponibilidade imediata do terminal durante cerca de 60 segundos. Certifique-se de agendar para um período de baixo fluxo de colaboradores.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="h-9 text-xs">Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? 'A guardar...' : 'Guardar Configuração'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}