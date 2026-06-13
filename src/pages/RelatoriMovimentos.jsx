import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Download } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

// O timestamp vem do terminal já em hora local — mostrar diretamente sem conversão de timezone
const formatLocal = (ts) => {
  if (!ts) return '-';
  // Remover sufixo Z ou offset para evitar que o browser converta para local
  const raw = ts.replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  const d = new Date(raw);
  if (isNaN(d.getTime())) return ts;
  return format(d, 'dd/MM/yyyy HH:mm:ss');
};

export default function RelatorioMovimentos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroAutorizacao, setFiltroAutorizacao] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: movimentos = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['movimentos_acesso'],
    queryFn: () => base44.entities.Marcacao.list('-timestamp', 1000),
    refetchInterval: 30000,
  });

  const filteredMovimentos = movimentos.filter(m => {
    const matchSearch = !searchTerm ||
      m.utilizador_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.terminal_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.local?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(m.enrollid)?.includes(searchTerm);
    const matchAuth = filtroAutorizacao === 'todos' ? true :
      (filtroAutorizacao === 'autorizado' ? m.tipo === 'entrada' : m.tipo === 'saida');

    const dataMovimento = new Date(m.timestamp);
    const matchDate = (!dateFrom || dataMovimento >= new Date(dateFrom)) &&
                     (!dateTo || dataMovimento <= new Date(dateTo + 'T23:59:59'));

    return matchSearch && matchAuth && matchDate;
  });

  const totalAcessos = filteredMovimentos.length;
  const entradas = filteredMovimentos.filter(m => m.tipo === 'entrada').length;
  const saidas = filteredMovimentos.filter(m => m.tipo === 'saida').length;

  const exportarCSV = () => {
    const csv = [
      ['Data', 'Hora', 'Enrollid', 'Nome', 'Tipo', 'Modo', 'Terminal', 'Local'],
      ...filteredMovimentos.map(m => [
        formatLocal(m.timestamp).split(' ')[0],
        formatLocal(m.timestamp).split(' ')[1],
        m.enrollid,
        m.utilizador_nome || '-',
        m.tipo,
        m.modo || '-',
        m.terminal_nome || '-',
        m.local || '-',
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `movimentos_acesso_${new Date().toISOString().split('T')[0]}.csv`);
    element.click();
  };

  if (isLoading) return <div className="p-6 text-center">A carregar movimentos...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Relatório de Movimentos</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-slate-600">Trilho completo de acessos por pessoa ou terminal</p>
            {dataUpdatedAt && <p className="text-xs text-slate-400">· Atualizado {format(new Date(dataUpdatedAt), 'HH:mm:ss', { locale: pt })} · auto-refresh 30s</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{totalAcessos}</div>
              <p className="text-sm text-slate-600 mt-1">Total de Marcações</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{entradas}</div>
              <p className="text-sm text-slate-600 mt-1">Entradas</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600">{saidas}</div>
              <p className="text-sm text-slate-600 mt-1">Saídas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por pessoa ou zona..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={filtroAutorizacao}
                onChange={(e) => setFiltroAutorizacao(e.target.value)}
                className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm"
              >
                <option value="todos">Todas as Marcações</option>
                <option value="autorizado">Entradas</option>
                <option value="denegado">Saídas</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export */}
        <div className="mb-6 flex justify-end">
          <Button onClick={exportarCSV} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Data/Hora</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Enrollid</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Nome</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Tipo</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Modo</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Terminal</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Local</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovimentos.map((m, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {formatLocal(m.timestamp)}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-xs">{m.enrollid}</td>
                      <td className="py-3 px-4 text-slate-700">{m.utilizador_nome || <span className="text-slate-400 italic">—</span>}</td>
                      <td className="py-3 px-4">
                        <Badge className={m.tipo === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                          {m.tipo === 'entrada' ? '↓ Entrada' : '↑ Saída'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{m.modo || '-'}</td>
                      <td className="py-3 px-4 text-slate-600">{m.terminal_nome || '-'}</td>
                      <td className="py-3 px-4 text-slate-500 text-xs">{m.local || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMovimentos.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  Nenhum movimento encontrado
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}