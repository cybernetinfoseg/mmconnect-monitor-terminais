import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useUserTimezone } from '@/hooks/useUserTimezone';
import { Users, LogIn, LogOut, Clock, Search, RefreshCw, Building2, Moon, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PresencaCard from '@/components/presenca/PresencaCard';

export default function Presenca() {
  const [search, setSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const { timezone: userTimezone } = useUserTimezone();

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

  const { data: horarios = [] } = useQuery({
    queryKey: ['horarios-presenca'],
    queryFn: () => base44.entities.Horario.list('nome'),
    enabled: !!currentUser,
  });

  const horarioMap = useMemo(() => {
    const m = {};
    horarios.forEach(h => { m[h.id] = h; });
    return m;
  }, [horarios]);

  const myTerminalIds = useMemo(() => new Set(terminals.map(t => t.id)), [terminals]);

  const userMap = useMemo(() => {
    const m = {};
    terminalUsers.forEach(u => { m[u.enrollid] = u; });
    return m;
  }, [terminalUsers]);

  // Calcular presença com todas as marcações de hoje por colaborador
  const presencaStatus = useMemo(() => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });

    const marcoesHoje = marcacoes.filter(m => {
      if (!m.timestamp) return false;
      if (!isAdmin && !myTerminalIds.has(m.terminal_id)) return false;
      const diaTs = new Date(m.timestamp).toLocaleDateString('en-CA', { timeZone: userTimezone || 'UTC' });
      return diaTs === hoje;
    });

    // Agrupar todas as marcações de hoje por colaborador
    const marcacoesPorColaborador = {};
    marcoesHoje.forEach(m => {
      const id = m.enrollid;
      if (!marcacoesPorColaborador[id]) marcacoesPorColaborador[id] = [];
      marcacoesPorColaborador[id].push(m);
    });

    return Object.entries(marcacoesPorColaborador).map(([enrollidStr, mlist]) => {
      const enrollid = Number(enrollidStr);
      const userInfo = userMap[enrollid];
      // Ordenar por timestamp
      const sorted = [...mlist].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const ultima = sorted[sorted.length - 1];
      const primeira = sorted[0];
      const dentro = ultima.tipo === 'entrada';
      const nome = ultima.utilizador_nome || userInfo?.nome || `ID:${enrollid}`;

      return {
        enrollid,
        nome,
        departamento: userInfo?.departamento || '',
        cargo: userInfo?.cargo || '',
        horario_id: userInfo?.horario_id || null,
        dentro,
        ultimaMarcacao: ultima,
        primeiraMarcacao: primeira,
        marcacoesHoje: sorted,
        terminal_nome: ultima.terminal_nome,
        local: ultima.local,
      };
    }).sort((a, b) => {
      if (a.dentro && !b.dentro) return -1;
      if (!a.dentro && b.dentro) return 1;
      return a.nome.localeCompare(b.nome);
    });
  }, [marcacoes, userMap, myTerminalIds, isAdmin, userTimezone]);

  const dentroCount = presencaStatus.filter(p => p.dentro).length;
  const foraCount = presencaStatus.filter(p => !p.dentro).length;

  // Totais extras e noturno para KPIs
  const { totalExtra, totalNoturno } = useMemo(() => {
    let totalExtra = 0, totalNoturno = 0;
    // Calculamos aqui apenas para os KPIs globais (não re-calcula por tick)
    return { totalExtra, totalNoturno };
  }, [presencaStatus]);

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
                Hoje · Atualizado {dataUpdatedAt
                  ? new Date(dataUpdatedAt).toLocaleTimeString('pt-PT', { timeZone: userTimezone || 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : '—'} · auto-refresh 30s
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <Card className="bg-violet-50 border-violet-200">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-violet-400" />
              <div>
                <p className="text-2xl font-bold text-violet-700">
                  {presencaStatus.filter(p => p.horario_id).length}
                </p>
                <p className="text-xs text-violet-600 font-medium">Com horário</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Pesquisar colaborador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-white"
          />
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-violet-500" /> Horas extra (art. 268º CT)</span>
          <span className="flex items-center gap-1"><Moon className="h-3 w-3 text-indigo-500" /> Noturno 22h–07h (+25%, art. 266º CT)</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-500" /> Atraso além da tolerância</span>
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
                    <PresencaCard key={p.enrollid} pessoa={p} timezone={userTimezone} horarioMap={horarioMap} />
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
                    <PresencaCard key={p.enrollid} pessoa={p} timezone={userTimezone} horarioMap={horarioMap} />
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