import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Search, Filter, User, Calendar, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import moment from 'moment';

const ACAO_LABELS = {
  terminal_criado: { label: 'Terminal Criado', color: 'bg-emerald-100 text-emerald-700' },
  terminal_editado: { label: 'Terminal Editado', color: 'bg-blue-100 text-blue-700' },
  terminal_excluido: { label: 'Terminal Excluído', color: 'bg-red-100 text-red-700' },
  terminal_verificado: { label: 'Terminal Verificado', color: 'bg-slate-100 text-slate-600' },
  api_key_gerada: { label: 'API Key Gerada', color: 'bg-amber-100 text-amber-700' },
  usuario_convidado: { label: 'Usuário Convidado', color: 'bg-purple-100 text-purple-700' },
  permissao_atualizada: { label: 'Permissão Atualizada', color: 'bg-indigo-100 text-indigo-700' },
};

export default function Auditoria() {
  const [search, setSearch] = useState('');
  const [acaoFilter, setAcaoFilter] = useState('all');
  const [usuarioFilter, setUsuarioFilter] = useState('all');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => base44.entities.AuditLog.list('-timestamp', 500),
    refetchInterval: 15000,
  });

  const usuarios = useMemo(() =>
    [...new Set(logs.map(l => l.usuario_email).filter(Boolean))].sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (acaoFilter !== 'all' && log.acao !== acaoFilter) return false;
      if (usuarioFilter !== 'all' && log.usuario_email !== usuarioFilter) return false;
      if (dataInicio && log.timestamp < dataInicio) return false;
      if (dataFim && log.timestamp > dataFim + 'T23:59:59') return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !log.usuario_email?.toLowerCase().includes(q) &&
          !log.descricao?.toLowerCase().includes(q) &&
          !log.entidade?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, acaoFilter, usuarioFilter, dataInicio, dataFim, search]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 rounded-xl">
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Auditoria</h1>
              <p className="text-sm text-slate-500">Registro de ações dos usuários no sistema</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Filters */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por usuário, descrição..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Select value={acaoFilter} onValueChange={setAcaoFilter}>
                <SelectTrigger className="w-[200px]">
                  <Filter className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Tipo de ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  {Object.entries(ACAO_LABELS).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={usuarioFilter} onValueChange={setUsuarioFilter}>
                <SelectTrigger className="w-[200px]">
                  <User className="h-4 w-4 mr-2 text-slate-400" />
                  <SelectValue placeholder="Usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {usuarios.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                <Input
                  type="date"
                  value={dataInicio}
                  onChange={e => setDataInicio(e.target.value)}
                  className="w-[140px]"
                  placeholder="De"
                />
                <span className="text-slate-400 text-sm">–</span>
                <Input
                  type="date"
                  value={dataFim}
                  onChange={e => setDataFim(e.target.value)}
                  className="w-[140px]"
                  placeholder="Até"
                />
              </div>

              {(search || acaoFilter !== 'all' || usuarioFilter !== 'all' || dataInicio || dataFim) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setSearch(''); setAcaoFilter('all'); setUsuarioFilter('all');
                  setDataInicio(''); setDataFim('');
                }} className="text-slate-500">
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{filtered.length}</span> registros encontrados
          {filtered.length !== logs.length && <span>de {logs.length} total</span>}
        </div>

        {/* Logs Table */}
        <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Data/Hora</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Usuário</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Ação</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Descrição</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Entidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Carregando...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                        <ClipboardList className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>Nenhum registro encontrado</p>
                      </td>
                    </tr>
                  ) : filtered.map(log => {
                    const acaoInfo = ACAO_LABELS[log.acao] || { label: log.acao, color: 'bg-slate-100 text-slate-600' };
                    return (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                          {moment(log.timestamp).format('DD/MM/YY HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">
                          {log.usuario_email}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("text-xs whitespace-nowrap", acaoInfo.color)}>
                            {acaoInfo.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600 hidden md:table-cell max-w-xs truncate">
                          {log.descricao || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                          {log.entidade && (
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                              {log.entidade}{log.entidade_id ? ` #${log.entidade_id.slice(-6)}` : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}