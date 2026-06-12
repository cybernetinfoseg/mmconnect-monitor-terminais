import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Download, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function RelatorioMovimentos() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroAutorizacao, setFiltroAutorizacao] = useState('todos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: movimentos = [], isLoading } = useQuery({
    queryKey: ['movimentos_acesso'],
    queryFn: () => base44.entities.MovimentoAcesso.list('-timestamp', 1000)
  });

  const filteredMovimentos = movimentos.filter(m => {
    const matchSearch = m.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       m.zona_nome?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchAuth = filtroAutorizacao === 'todos' ? true : 
                     (filtroAutorizacao === 'autorizado' ? m.autorizado : !m.autorizado);
    
    const dataMovimento = new Date(m.timestamp);
    const matchDate = (!dateFrom || dataMovimento >= new Date(dateFrom)) &&
                     (!dateTo || dataMovimento <= new Date(dateTo));
    
    return matchSearch && matchAuth && matchDate;
  });

  const totalAcessos = filteredMovimentos.length;
  const acessosDenegados = filteredMovimentos.filter(m => !m.autorizado).length;
  const taxaDenegacao = totalAcessos > 0 ? ((acessosDenegados / totalAcessos) * 100).toFixed(1) : 0;

  const exportarCSV = () => {
    const csv = [
      ['Data', 'Hora', 'Pessoa', 'Tipo', 'Zona', 'Terminal', 'Autorizado', 'Motivo'],
      ...filteredMovimentos.map(m => [
        format(new Date(m.timestamp), 'yyyy-MM-dd'),
        format(new Date(m.timestamp), 'HH:mm:ss'),
        m.nome,
        m.tipo_acesso,
        m.zona_nome || '-',
        m.terminal_nome || '-',
        m.autorizado ? 'Sim' : 'Não',
        m.motivo_negacao || '-'
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
          <p className="text-slate-600">Trilho completo de acessos por pessoa ou terminal</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{totalAcessos}</div>
              <p className="text-sm text-slate-600 mt-1">Total de Acessos</p>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{acessosDenegados}</div>
              <p className="text-sm text-slate-600 mt-1">Acessos Denegados</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600">{taxaDenegacao}%</div>
              <p className="text-sm text-slate-600 mt-1">Taxa de Denegação</p>
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
                <option value="todos">Todos os Acessos</option>
                <option value="autorizado">Autorizados</option>
                <option value="denegado">Denegados</option>
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
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Pessoa</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Tipo</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Zona</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Terminal</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovimentos.map((m, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        {format(new Date(m.timestamp), 'dd/MM/yyyy HH:mm:ss', { locale: pt })}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{m.nome}</td>
                      <td className="py-3 px-4">
                        <Badge className={m.tipo_acesso === 'entrada' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}>
                          {m.tipo_acesso === 'entrada' ? '↓ Entrada' : '↑ Saída'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{m.zona_nome || '-'}</td>
                      <td className="py-3 px-4 text-slate-600">{m.terminal_nome || '-'}</td>
                      <td className="py-3 px-4 text-center">
                        {m.autorizado ? (
                          <Badge className="bg-green-100 text-green-700">✓ Autorizado</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 flex items-center justify-center gap-1 w-fit mx-auto">
                            <AlertCircle className="h-3 w-3" /> Denegado
                          </Badge>
                        )}
                      </td>
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