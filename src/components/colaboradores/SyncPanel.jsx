import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RefreshCw, Upload, Download, CheckCircle2, XCircle,
  Loader2, AlertTriangle, ArrowDownUp
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getTimmyCapabilities, resolvePrimaryBackupnum } from '@/lib/timmyModels';

/**
 * SyncPanel — Sincronização bidirecional entre Sistema (BD) e Terminais Timmy.
 * 
 * Sistema → Terminal: envia todos os colaboradores do sistema para o terminal selecionado.
 * Terminal → Sistema: importa a lista de utilizadores do terminal (getuserlist) e
 *   cria/atualiza registos no sistema.
 */
export default function SyncPanel({ terminals, allUsers, currentUser, onRefresh }) {
  const [syncTerminalId, setSyncTerminalId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncDir, setSyncDir] = useState(null); // 'push' | 'pull'
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResults, setSyncResults] = useState(null);

  const timmyTerminals = terminals.filter(t => t.tipo_conexao === 'websocket_cloud' && t.fabricante === 'timmy');

  const selectedTerminal = terminals.find(t => t.id === syncTerminalId);

  // Sistema → Terminal (push)
  const handlePush = async () => {
    if (!syncTerminalId) { toast.error('Selecione um terminal'); return; }
    const usersToSend = allUsers.filter(u => u.ativo !== false);
    if (!usersToSend.length) { toast.error('Sem colaboradores ativos para enviar'); return; }

    const terminalObj = terminals.find(t => t.id === syncTerminalId);
    const cap = getTimmyCapabilities(terminalObj?.modelo);

    setSyncing(true); setSyncDir('push');
    setSyncProgress({ done: 0, total: usersToSend.length, label: `A enviar para ${cap.name}` });
    setSyncResults(null);

    let ok = 0, fail = 0;
    const details = [];
    for (const user of usersToSend) {
    try {
      const bioTypes = (() => { try { return JSON.parse(user.bio_types || '[]'); } catch { return []; } })();
      // Filtrar bioTypes apenas pelos suportados pelo modelo do terminal
      const supportedTypes = bioTypes.filter(bt => cap.supportedBackupnums.includes(bt));
      const { backupnum, record } = resolvePrimaryBackupnum(supportedTypes.length ? supportedTypes : bioTypes, user);

      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: syncTerminalId, action: 'adduser',
        params: { enrollid: user.enrollid, name: user.nome, password: user.password || '', card: user.card || '', privilege: user.privilege || 0 }
      });
        const success = resp.data?.success;
        success ? ok++ : fail++;
        details.push({ nome: user.nome, enrollid: user.enrollid, success, message: resp.data?.message || resp.data?.error });
      } catch (e) {
        fail++;
        details.push({ nome: user.nome, enrollid: user.enrollid, success: false, message: e.message });
      }
      setSyncProgress(prev => ({ ...prev, done: prev.done + 1 }));
    }

    setSyncing(false); setSyncProgress(null);
    setSyncResults({ direction: 'push', ok, fail, details, terminal: selectedTerminal?.nome });
    fail === 0 ? toast.success(`${ok} colaboradores enviados para "${selectedTerminal?.nome}"`) : toast.error(`${ok} OK / ${fail} erros`);
  };

  // Terminal → Sistema (pull)
  const handlePull = async () => {
    if (!syncTerminalId) { toast.error('Selecione um terminal'); return; }
    setSyncing(true); setSyncDir('pull');
    setSyncProgress({ done: 0, total: 1, label: 'A ler lista do terminal' });
    setSyncResults(null);

    try {
      const resp = await base44.functions.invoke('terminalControl', {
        terminal_id: syncTerminalId, action: 'getuserlist', params: { count: 500 }
      });
      const terminalUsers = resp.data?.data?.users || [];
      if (!terminalUsers.length) {
        toast.info('Nenhum utilizador encontrado no terminal');
        setSyncing(false); setSyncProgress(null);
        return;
      }

      setSyncProgress({ done: 0, total: terminalUsers.length, label: 'A sincronizar com sistema' });
      let created = 0, updated = 0, skipped = 0;
      const details = [];

      for (const tu of terminalUsers) {
        const enrollid = tu.enrollid || tu.EnrollNumber || tu.id;
        const name = tu.name || tu.Name || `ID:${enrollid}`;
        const existing = allUsers.find(u => u.enrollid === Number(enrollid));

        try {
          if (existing) {
            // Atualizar se o nome mudou ou se não tem o terminal nos associados
            const termIds = (() => { try { return JSON.parse(existing.terminais_ids || '[]'); } catch { return []; } })();
            if (!termIds.includes(syncTerminalId)) {
              await base44.entities.TerminalUser.update(existing.id, {
                terminais_ids: JSON.stringify([...termIds, syncTerminalId])
              });
              updated++;
              details.push({ nome: name, enrollid, action: 'atualizado', success: true });
            } else {
              skipped++;
              details.push({ nome: name, enrollid, action: 'já existe', success: true });
            }
          } else {
            await base44.entities.TerminalUser.create({
              enrollid: Number(enrollid), nome: name,
              email: '', departamento: '', cargo: '',
              card: tu.card || tu.CardNumber || '',
              privilege: tu.privilege || tu.Privilege || 0,
              ativo: true,
              owner_email: currentUser?.email,
              terminais_ids: JSON.stringify([syncTerminalId]),
              bio_types: '[]',
            });
            created++;
            details.push({ nome: name, enrollid, action: 'criado', success: true });
          }
        } catch (e) {
          details.push({ nome: name, enrollid, action: 'erro', success: false, message: e.message });
        }
        setSyncProgress(prev => ({ ...prev, done: prev.done + 1 }));
      }

      setSyncing(false); setSyncProgress(null);
      setSyncResults({ direction: 'pull', created, updated, skipped, details, terminal: selectedTerminal?.nome });
      onRefresh();
      toast.success(`Pull: ${created} criados, ${updated} atualizados, ${skipped} já existiam`);
    } catch (e) {
      setSyncing(false); setSyncProgress(null);
      toast.error('Erro ao ler terminal: ' + e.message);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ArrowDownUp className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-semibold text-slate-700">Sincronização Bidirecional — Terminais Timmy</span>
      </div>

      {timmyTerminals.length === 0 ? (
        <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">Nenhum terminal Timmy (WebSocket Cloud) configurado. A sincronização bidirecional requer terminais Timmy Face ID.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex-1">
              <label className="text-xs text-slate-500 mb-1 block">Terminal Timmy</label>
              <Select value={syncTerminalId || 'none'} onValueChange={v => setSyncTerminalId(v === 'none' ? '' : v)} disabled={syncing}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Escolher terminal..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Escolher terminal —</SelectItem>
                  {timmyTerminals.map(t => {
                    const cap = getTimmyCapabilities(t.modelo);
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', t.status === 'online' ? 'bg-emerald-500' : 'bg-slate-300')} />
                          <span>{t.nome}</span>
                          <span className="text-slate-400 text-xs">{cap.icon} {cap.name}</span>
                          {t.local && <span className="text-slate-300 text-xs">— {t.local}</span>}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 shrink-0 sm:mt-5">
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 gap-1.5 text-xs" disabled={!syncTerminalId || syncing} onClick={handlePush}>
                {syncing && syncDir === 'push' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Sistema → Terminal
              </Button>
              <Button size="sm" variant="outline" className="border-teal-300 text-teal-700 hover:bg-teal-50 gap-1.5 text-xs" disabled={!syncTerminalId || syncing} onClick={handlePull}>
                {syncing && syncDir === 'pull' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Terminal → Sistema
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          {syncProgress && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{syncProgress.label}... {syncProgress.done}/{syncProgress.total}</span>
                <span>{Math.round(syncProgress.done / syncProgress.total * 100)}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-teal-500 transition-all" style={{ width: `${syncProgress.done / syncProgress.total * 100}%` }} />
              </div>
            </div>
          )}

          {/* Results */}
          {syncResults && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-600">
                    {syncResults.direction === 'push'
                      ? `Envio → "${syncResults.terminal}"`
                      : `Importação ← "${syncResults.terminal}"`
                    }
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {syncResults.direction === 'push' ? (
                    <>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">{syncResults.ok} OK</Badge>
                      {syncResults.fail > 0 && <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">{syncResults.fail} erro(s)</Badge>}
                    </>
                  ) : (
                    <>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">{syncResults.created} novos</Badge>
                      <Badge className="bg-teal-100 text-teal-700 border-teal-200 text-xs">{syncResults.updated} atualizados</Badge>
                      <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">{syncResults.skipped} iguais</Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                {syncResults.details.slice(0, 50).map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                    {d.success
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    }
                    <span className="text-xs text-slate-700 flex-1 truncate">{d.nome}</span>
                    <span className="text-xs text-slate-400 font-mono">#{d.enrollid}</span>
                    {d.action && <Badge variant="outline" className="text-xs py-0">{d.action}</Badge>}
                    {d.message && <span className="text-xs text-red-400 truncate max-w-[120px]" title={d.message}>{d.message}</span>}
                  </div>
                ))}
                {syncResults.details.length > 50 && (
                  <div className="px-3 py-2 text-center text-xs text-slate-400">
                    ... e mais {syncResults.details.length - 50} registos
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}