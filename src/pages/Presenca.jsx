import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format, subHours, isToday, parseISO } from 'date-fns';
import { Users, LogIn, LogOut, Clock, Search, RefreshCw, Building2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Presenca() {
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: marcacoes = [], isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['presenca-marcacoes'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 2000),
    enabled: !!currentUser,
    refetchInterval: 30000,
  });

  const { data: terminalUsers = [] } = useQuery({
    queryKey: ['presenca-users', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.TerminalUser.list('nome', 500);
      return base44.entities.TerminalUser.filter({ owner_email: currentUser?.email }, 'nome', 500);
    },
    enabled: !!currentUser,
  });

  const { data: terminals = [] } = useQuery({
    queryKey: ['presenca-terminals', currentUser?.email, isAdmin],
    queryFn: async () => {
      if (isAdmin) return base44.entities.Terminal.list('nome');
      const [a, b] = await Promise.all([
        base44.entities.Terminal.filter({ usuario_email: currentUser?.email }, 'nome'),
        base44.entities.Terminal.filter({ created_by: currentUser?.email }, 'nome'),
      ]);
      const seen = new Set();
      return [...a, ...b].filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
    },
    enabled: !!currentUser,
  });

  const myTerminalIds = useMemo(() => new Set(terminals.map(t => t.id)), [terminals]);
  const userMap = useMemo(() => {
    const m = {};
    terminalUsers.forEach(u => { m[u.enrollid] = u; });
    return m;
  }, [terminalUsers]);

  // Para cada colaborador, encontrar a última marcação de hoje
  const presencaStatus = useMemo(() => {
    const hoje = new Date().toISOString().substring(0, 10);
    const marcoesHoje = marcacoes.filter(m => {
      if (!m.timestamp) return false;
      if (!isAdmin && !myTerminalIds.has(m.terminal_id)) return false;
      return m.timestamp.substring(0, 10) === hoje;
    });

    // Agrupar por enrollid → última marcação
    const ultimaPorColaborador = {};
    marcoesHoje.forEach(m => {
      const id = m.enrollid;
      if (!ultimaPorColaborador[id] || new Date(m.timestamp) > new Date(ultimaPorColaborador[id].timestamp)) {
        ultimaPorColaborador[id] = m;
      }
    });

    // Primeira marcação do dia por colaborador
    const primeiraPorColaborador = {};
    marcoesHoje.forEach(m => {
      const id = m.enrollid;
      if (!primeiraPorColaborador[id] || new Date(m.timestamp) < new Date(primeiraPorColaborador[id].timestamp)) {
        primeiraPorColaborador[id] = m;
      }
    });

    return Object.entries(ultimaPorColaborador).map(([enrollidStr, ultima]) => {
      const enrollid = Number(enrollidStr);
      const userInfo = userMap[enrollid];
      const nome = ultima.utilizador_nome || userInfo?.nome || `ID:${enrollid}`;
      const dentro = ultima.tipo === 'entrada';
      const primeira = primeiraPorColaborador[enrollid];
      return {
        enrollid,
        nome,
        departamento: userInfo?.departamento || '',
        cargo: userInfo?.cargo || '',
        dentro,
        ultimaMarcacao: ultima,
        primeiraMarcacao: primeira,
        terminal_nome: ultima.terminal_nome,
        local: ultima.local,
      };
    }).sort((a, b) => {
      // Dentro primeiro, depois por nome
      if (a.dentro && !b.dentro) return -1;
      if (!a.dentro && b.dentro) return 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [marcacoes, userMap, myTerminalIds, isAdmin]);

  const dentroCount = presencaStatus.filter(p => p.dentro).length;
  const foraCount = presencaStatus.filter(p => !p.dentro).length;

  const filtered = useMemo(() => {
    if (!search.trim()) return presencaStatus;
    const q = search.toLowerCase();
    return presencaStatus.filter(p =>
      p.nome.toLowerCase().includes(q) ||
      p.departamento?.toLowerCase().includes(q) ||
      String(p.enrollid).includes(q)
    );
  }, [presencaStatus, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 rounded-xl shrink-0">
              <Building2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">Presença em Tempo Real</h1>
              <p className="text-xs text-slate-500">
                Hoje · Atualizado {dataUpdatedAt ? format(new Date(dataUpdatedAt), 'HH:mm:ss') : '—'} · auto-refresh 30s
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-emerald-50 border-emerald-200">
            <CardContent className="p-4 flex items-center gap-3">
              <LogIn className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold text-emerald-700">{dentroCount}</p>
                <p className="text-xs text-emerald-600 font-medium">Dentro</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-rose-50 border-rose-200">
            <CardContent className="p-4 flex items-center gap-3">
              <LogOut className="h-8 w-8 text-rose-400" />
              <div>
                <p className="text-2xl font-bold text-rose-600">{foraCount}</p>
                <p className="text-xs text-rose-500 font-medium">Saíram</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-50 border-slate-200">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-slate-400" />
              <div>
                <p className="text-2xl font-bold text-slate-700">{presencaStatus.length}</p>
                <p className="text-xs text-slate-500 font-medium">Total hoje</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Pesquisar colaborador..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-white" />
        </div>

        {/* Grid de presença */}
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sem marcações hoje</p>
            <p className="text-sm mt-1">As marcações aparecerão aqui em tempo real</p>
          </div>
        ) : (
          <>
            {/* Dentro */}
            {filtered.filter(p => p.dentro).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h2 className="text-sm font-semibold text-emerald-700">No local de trabalho ({filtered.filter(p => p.dentro).length})</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.filter(p => p.dentro).map(p => (
                    <PresencaCard key={p.enrollid} pessoa={p} />
                  ))}
                </div>
              </div>
            )}

            {/* Fora */}
            {filtered.filter(p => !p.dentro).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <h2 className="text-sm font-semibold text-rose-600">Saíram ({filtered.filter(p => !p.dentro).length})</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.filter(p => !p.dentro).map(p => (
                    <PresencaCard key={p.enrollid} pessoa={p} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PresencaCard({ pessoa }) {
  const dentro = pessoa.dentro;
  return (
    <Card className={cn(
      'border transition-all',
      dentro ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white opacity-75'
    )}>
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <div className={cn(
            'w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold',
            dentro ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-200 text-slate-500'
          )}>
            {pessoa.nome[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-slate-800 truncate">{pessoa.nome}</p>
              <span className={cn('w-2 h-2 rounded-full shrink-0', dentro ? 'bg-emerald-500' : 'bg-slate-300')} />
            </div>
            {(pessoa.departamento || pessoa.cargo) && (
              <p className="text-[11px] text-slate-500 truncate">{[pessoa.departamento, pessoa.cargo].filter(Boolean).join(' · ')}</p>
            )}
            <div className="mt-1.5 space-y-0.5">
              {pessoa.primeiraMarcacao && (
                <div className="flex items-center gap-1 text-[11px]">
                  <LogIn className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                  <span className="text-slate-600">{format(new Date(pessoa.primeiraMarcacao.timestamp), 'HH:mm')}</span>
                  {pessoa.primeiraMarcacao.terminal_nome && (
                    <span className="text-slate-400 truncate">· {pessoa.primeiraMarcacao.terminal_nome}</span>
                  )}
                </div>
              )}
              {!dentro && pessoa.ultimaMarcacao && (
                <div className="flex items-center gap-1 text-[11px]">
                  <LogOut className="h-2.5 w-2.5 text-rose-400 shrink-0" />
                  <span className="text-slate-600">{format(new Date(pessoa.ultimaMarcacao.timestamp), 'HH:mm')}</span>
                  {pessoa.ultimaMarcacao.terminal_nome && (
                    <span className="text-slate-400 truncate">· {pessoa.ultimaMarcacao.terminal_nome}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-100">
          <Badge className={cn('text-[10px]', dentro ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
            {dentro ? '✓ Presente' : '← Saiu'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}