import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { ArrowUpDown, Upload, Download, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export default function SyncBidirectional({ terminals, colaboradores }) {
  // ── Sincronização Bidirecional ─────────────────
  const [syncTerminalId, setSyncTerminalId] = useState('');
  const [syncLoading, setSyncLoading] = useState(null); // 'push' | 'pull'

  // ── Replicação Mestre→Escravo ─────────────────
  const [mestreId, setMestreId] = useState('');
  const [escravos, setEscravos] = useState(new Set());
  const [replicLoading, setReplicLoading] = useState(false);

  // Filtrar apenas terminais Timmy (websocket_cloud)
  const timmyTerminals = useMemo(
    () => terminals.filter(t => t.tipo_conexao === 'websocket_cloud'),
    [terminals]
  );

  const syncTerminal = timmyTerminals.find(t => t.id === syncTerminalId);
  const mestre = timmyTerminals.find(t => t.id === mestreId);

  // Terminais disponíveis para escravos (exclui o mestre)
  const escravosDisponiveis = useMemo(
    () => timmyTerminals.filter(t => t.id !== mestreId),
    [timmyTerminals, mestreId]
  );

  const toggleEscravo = (id) => {
    setEscravos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Sistema → Terminal (Push) ─────────────────
  const pushToTerminal = async () => {
    if (!syncTerminal) return;
    setSyncLoading('push');
    let success = 0, errors = 0;
    try {
      for (const col of colaboradores) {
        if (!col.enrollid) continue;
        try {
          await base44.functions.invoke('terminalControl', {
            terminal_id: syncTerminal.id,
            action: 'adduser',
            params: {
              enrollid: col.enrollid,
              name: col.nome || `Col. ${col.enrollid}`,
              password: col.password || '',
              card: col.card || '',
              privilege: col.privilege ?? 0,
            },
          });
          success++;
        } catch { errors++; }
      }
      toast.success(`${success} utilizadores enviados para "${syncTerminal.nome}"${errors > 0 ? ` · ${errors} falhas` : ''}`);
    } catch (e) {
      toast.error(`Erro: ${e?.response?.data?.error || e.message}`);
    } finally {
      setSyncLoading(null);
    }
  };

  // ── Terminal → Sistema (Pull) ─────────────────
  const pullFromTerminal = async () => {
    if (!syncTerminal) return;
    setSyncLoading('pull');
    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: syncTerminal.id,
        action: 'getuserlist',
      });
      const data = resp.data;
      if (data?.success && data.data?.users) {
        const users = data.data.users;
        let synced = 0;
        for (const u of users) {
          const enrollid = Number(u.EnrollNumber || u.enrollid || u.id);
          if (!enrollid) continue;
          const nome = u.Name || u.name || '';
          const exists = colaboradores.find(c => c.enrollid === enrollid);
          if (!exists) {
            try {
              await base44.entities.Colaborador.create({
                enrollid,
                nome: nome || `ID:${enrollid}`,
                password: String(u.Password || u.password || ''),
                card: String(u.CardNumber || u.card || ''),
                privilege: Number(u.Privilege || u.privilege || 0),
                ativo: true,
              });
              synced++;
            } catch { /* skip */ }
          }
        }
        toast.success(`${users.length} utilizadores no terminal · ${synced} novos importados`);
      } else {
        toast.error('Terminal não respondeu com lista de utilizadores');
      }
    } catch (e) {
      toast.error(`Erro: ${e?.response?.data?.error || e.message}`);
    } finally {
      setSyncLoading(null);
    }
  };

  // ── Replicar Mestre → Escravos ─────────────────
  const replicarMestreEscravos = async () => {
    if (!mestre || escravos.size === 0) return;
    setReplicLoading(true);
    try {
      // Obter lista de utilizadores do mestre
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: mestre.id,
        action: 'getuserlist',
      });
      const data = resp.data;
      if (!data?.success || !data.data?.users) {
        toast.error('Mestre não respondeu com lista de utilizadores');
        setReplicLoading(false);
        return;
      }

      const users = data.data.users;
      let total = 0, errors = 0;

      for (const slaveId of escravos) {
        const slave = timmyTerminals.find(t => t.id === slaveId);
        if (!slave) continue;
        for (const u of users) {
          const enrollid = Number(u.EnrollNumber || u.enrollid || u.id);
          if (!enrollid) continue;
          try {
            await base44.functions.invoke('terminalControl', {
              terminal_id: slave.id,
              action: 'adduser',
              params: {
                enrollid,
                name: u.Name || u.name || `ID:${enrollid}`,
                password: String(u.Password || u.password || ''),
                card: String(u.CardNumber || u.card || ''),
                privilege: Number(u.Privilege || u.privilege || 0),
              },
            });
            total++;
          } catch { errors++; }
        }
      }
      toast.success(`${total} utilizadores replicados para ${escravos.size} terminal(is)${errors > 0 ? ` · ${errors} falhas` : ''}`);
    } catch (e) {
      toast.error(`Erro: ${e?.response?.data?.error || e.message}`);
    } finally {
      setReplicLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ══════ Sincronização Bidirecional ══════ */}
      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-1.5 bg-teal-50 rounded-lg">
            <ArrowUpDown className="h-4 w-4 text-teal-600" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">Sincronização Bidirecional — Terminais Timmy</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Terminal Timmy</label>
            <Select value={syncTerminalId} onValueChange={setSyncTerminalId}>
              <SelectTrigger className="bg-white w-full">
                <SelectValue placeholder="— Escolher terminal —" />
              </SelectTrigger>
              <SelectContent>
                {timmyTerminals.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} {t.status === 'online' && '🟢'}
                  </SelectItem>
                ))}
                {timmyTerminals.length === 0 && (
                  <SelectItem value={null} disabled>Nenhum terminal Timmy disponível</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1 gap-1.5 text-xs"
              style={{ backgroundColor: '#55b597', borderColor: '#55b597' }}
              onClick={pushToTerminal}
              disabled={!syncTerminal || syncLoading}
            >
              {syncLoading === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Sistema → Terminal
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-1.5 text-xs text-slate-500"
              onClick={pullFromTerminal}
              disabled={!syncTerminal || syncLoading}
            >
              {syncLoading === 'pull' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Terminal → Sistema
            </Button>
          </div>
        </div>
      </div>

      {/* ══════ Replicação Terminal-a-Terminal ══════ */}
      <div className="border border-slate-200 rounded-xl bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">
          Replicação Terminal-a-Terminal (Mestre → Escravo)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Terminal Mestre</label>
            <Select value={mestreId} onValueChange={v => { setMestreId(v); setEscravos(new Set()); }}>
              <SelectTrigger className="bg-white w-full">
                <SelectValue placeholder="— Escolher mestre —" />
              </SelectTrigger>
              <SelectContent>
                {timmyTerminals.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome} {t.status === 'online' && '🟢'}
                  </SelectItem>
                ))}
                {timmyTerminals.length === 0 && (
                  <SelectItem value={null} disabled>Nenhum terminal Timmy</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Terminais Escravos</label>
            <div className="space-y-2 max-h-[160px] overflow-y-auto">
              {escravosDisponiveis.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  {mestreId ? 'Nenhum outro terminal disponível' : 'Escolha um mestre primeiro'}
                </p>
              ) : (
                escravosDisponiveis.map(t => (
                  <label key={t.id} className="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={escravos.has(t.id)}
                      onCheckedChange={() => toggleEscravo(t.id)}
                    />
                    <span className="text-sm text-slate-700">{t.nome}</span>
                    {t.status === 'online' && <span className="text-xs text-emerald-500 ml-auto">online</span>}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <Button
          className="w-full gap-1.5 text-xs mt-4"
          style={{ backgroundColor: '#b388eb', borderColor: '#b388eb' }}
          onClick={replicarMestreEscravos}
          disabled={!mestreId || escravos.size === 0 || replicLoading}
        >
          {replicLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          ↓↑ Replicar Mestre → Escravos ({escravos.size})
        </Button>
      </div>
    </div>
  );
}