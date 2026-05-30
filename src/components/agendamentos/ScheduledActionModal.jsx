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
import { cn } from '@/lib/utils';

// adduser e blockuser requerem parâmetros dinâmicos (ID/nome do utilizador)
// que o cron não pode fornecer — apenas disponíveis no painel de controlo manual.
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
  { value: 6, label: 'Sáb' },
];

const EMPTY = {
  nome: '', terminal_id: '', terminal_nome: '', acao: 'settime',
  frequencia: 'diaria', hora: '03:00', dias_semana: '[1,2,3,4,5]',
  dia_mes: 1, data_unica: '', ativo: true,
};

export default function ScheduledActionModal({ open, onClose, onSaved, editItem, currentUser }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [diasSelecionados, setDiasSelecionados] = useState([1, 2, 3, 4, 5]);
  const { timezone: userTimezone } = useUserTimezone();

  const isAdmin = currentUser?.role === 'admin';
  const [filterUser, setFilterUser] = useState('');

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users-sched-modal'],
    queryFn: () => base44.entities.User.list(),
    enabled: open && isAdmin,
  });

  const { data: allTerminals = [] } = useQuery({
    queryKey: ['terminals-sched'],
    queryFn: () => base44.entities.Terminal.filter({ ativo: true }),
    enabled: open,
  });

  const terminals = isAdmin && filterUser
    ? allTerminals.filter(t => t.usuario_email === filterUser || t.created_by === filterUser)
    : allTerminals;

  useEffect(() => {
    if (!open) return;
    if (editItem) {
      setForm({
        nome: editItem.nome || '',
        terminal_id: editItem.terminal_id || '',
        terminal_nome: editItem.terminal_nome || '',
        acao: editItem.acao || 'settime',
        frequencia: editItem.frequencia || 'diaria',
        hora: editItem.hora || '03:00',
        dias_semana: editItem.dias_semana || '[1,2,3,4,5]',
        dia_mes: editItem.dia_mes || 1,
        data_unica: editItem.data_unica ? editItem.data_unica.slice(0, 16) : '',
        ativo: editItem.ativo !== false,
      });
      try { setDiasSelecionados(JSON.parse(editItem.dias_semana || '[1,2,3,4,5]')); } catch { setDiasSelecionados([1,2,3,4,5]); }
    } else {
      setForm(EMPTY);
      setDiasSelecionados([1, 2, 3, 4, 5]);
    }
  }, [editItem, open]);

  const toggleDia = (d) => {
    const next = diasSelecionados.includes(d) ? diasSelecionados.filter(x => x !== d) : [...diasSelecionados, d].sort();
    setDiasSelecionados(next);
    setForm(f => ({ ...f, dias_semana: JSON.stringify(next) }));
  };

  const handleTerminal = (id) => {
    const t = terminals.find(t => t.id === id);
    setForm(f => ({ ...f, terminal_id: id, terminal_nome: t?.nome || '' }));
  };

  const calcProxima = () => {
    if (!form.hora) return null;
    const [h, m] = form.hora.split(':').map(Number);
    const tz = userTimezone || 'UTC';
    const now = new Date();
    const localParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const year  = parseInt(localParts.find(p => p.type === 'year').value, 10);
    const month = parseInt(localParts.find(p => p.type === 'month').value, 10) - 1;
    const day   = parseInt(localParts.find(p => p.type === 'day').value, 10);
    const localStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
    const tzDate = new Date(new Date(localStr).toLocaleString('en-US', { timeZone: tz }));
    let next = new Date(now.getTime() + (new Date(localStr) - tzDate));
    if (next <= now) next = new Date(next.getTime() + 86400000);
    return next.toISOString();
  };

const handleSave = async () => {
  try {
    setSaving(true);
    
    // Constrói o payload padrão do agendamento
    const payload = { ...form };

    // Correção de fuso horário para a ação programada de relógio
    if (form.acao === 'settime') {
      const horaSincronizadaAgendamento = new Date().toLocaleString("sv-SE", {
        timeZone: userTimezone || "Europe/Lisbon"
      }).replace("T", " ");
      
      // Injeta os metadados para o executor do cron repassar ao WebSocket
      payload.parametros_adicionais = JSON.stringify({
        datetime: horaSincronizadaAgendamento
      });
    }

    if (sched) {
      await base44.entities.ScheduledAction.update(sched.id, payload);
      toast.success("Agendamento atualizado com fuso horário sincronizado!");
    } else {
      await base44.entities.ScheduledAction.create(payload);
      toast.success("Agendamento criado com sucesso!");
    }
    
    onSaved();
    onClose();
  } catch (error) {
    toast.error("Erro ao guardar o agendamento.");
    console.error(error);
  } finally {
    setSaving(false);
  }
};

  const valid = form.terminal_id && form.nome && form.acao && form.hora &&
    (form.frequencia !== 'unica' || form.data_unica);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? 'Editar Agendamento' : 'Novo Agendamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nome */}
          <div className="space-y-1">
            <Label>Nome do Agendamento *</Label>
            <Input placeholder="Ex: Reinício noturno BIO-001" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>

          {/* Filtro por utilizador (admin only) */}
          {isAdmin && (
            <div className="space-y-1">
              <Label>Filtrar por utilizador</Label>
              <select
                value={filterUser}
                onChange={e => { setFilterUser(e.target.value); setForm(f => ({ ...f, terminal_id: '', terminal_nome: '' })); }}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Todos os utilizadores</option>
                {allUsers.map(u => (
                  <option key={u.email} value={u.email}>{u.full_name ? `${u.full_name} (${u.email})` : u.email}</option>
                ))}
              </select>
            </div>
          )}

          {/* Terminal */}
          <div className="space-y-1">
            <Label>Terminal *</Label>
            <Select value={form.terminal_id} onValueChange={handleTerminal}>
              <SelectTrigger><SelectValue placeholder="Selecionar terminal..." /></SelectTrigger>
              <SelectContent>
                {terminals.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome} {t.local ? `(${t.local})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ação */}
          <div className="space-y-1">
            <Label>Ação Remota *</Label>
            <Select value={form.acao} onValueChange={v => setForm(f => ({ ...f, acao: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACOES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Frequência + Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Frequência *</Label>
              <Select value={form.frequencia} onValueChange={v => setForm(f => ({ ...f, frequencia: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="diaria">Diária</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="unica">Única vez</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.frequencia !== 'unica' && (
              <div className="space-y-1">
                <Label>Hora ({userTimezone || 'UTC'}) *</Label>
                <Input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
              </div>
            )}
          </div>

          {/* Dias da semana */}
          {form.frequencia === 'semanal' && (
            <div className="space-y-2">
              <Label>Dias da Semana</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DIAS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDia(d.value)}
                    className={cn(
                      'w-10 h-10 rounded-lg text-xs font-semibold border transition-colors',
                      diasSelecionados.includes(d.value)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dia do mês */}
          {form.frequencia === 'mensal' && (
            <div className="space-y-1">
              <Label>Dia do Mês (1-31)</Label>
              <Input type="number" min={1} max={31} value={form.dia_mes} onChange={e => setForm(f => ({ ...f, dia_mes: e.target.value }))} />
            </div>
          )}

          {/* Data única */}
          {form.frequencia === 'unica' && (
            <div className="space-y-1">
              <Label>Data e Hora ({userTimezone || 'UTC'}) *</Label>
              <Input type="datetime-local" value={form.data_unica} onChange={e => setForm(f => ({ ...f, data_unica: e.target.value }))} />
            </div>
          )}

          {/* Ativo */}
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
            <Label className="cursor-pointer">Agendamento ativo</Label>
          </div>

          {/* Aviso reboot */}
          {form.acao === 'reboot' && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ O reinício causará indisponibilidade do terminal durante ~60 segundos. Considere agendar fora do horário de pico.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !valid}>
            {saving ? 'A guardar...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}