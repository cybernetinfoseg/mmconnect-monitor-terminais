import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Download, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function RelatorioAbsentismo() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [mesSelecionado, setMesSelecionado] = useState(new Date().getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  const { data: ausencias = [] } = useQuery({
    queryKey: ['ausencias_relatorio'],
    queryFn: () => base44.entities.AusenciaFalta.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_abs'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const filteredData = useMemo(() => {
    const colabMap = {};
    colaboradores.forEach(c => colabMap[c.id] = c);

    const ausenciasAno = ausencias.filter(a => {
      const dataIni = new Date(a.data_inicio);
      if (dataIni.getFullYear() !== anoSelecionado) return false;
      if (filtroTipo !== 'todos' && a.tipo !== filtroTipo) return false;
      return true;
    });

    // Agregar por colaborador
    const porColaborador = {};
    ausenciasAno.forEach(a => {
      if (!porColaborador[a.enrollid]) {
        const colab = colaboradores.find(c => Number(c.enrollid) === Number(a.enrollid));
        porColaborador[a.enrollid] = {
          enrollid: a.enrollid,
          nome: a.utilizador_nome || colab?.nome || 'Desconhecido',
          departamento: colab?.departamento || '-',
          dias_total: 0,
          tipos: {}
        };
      }
      const inicio = new Date(a.data_inicio);
      const fim = new Date(a.data_fim);
      const dias = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
      porColaborador[a.enrollid].dias_total += dias;
      porColaborador[a.enrollid].tipos[a.tipo] = (porColaborador[a.enrollid].tipos[a.tipo] || 0) + dias;
    });

    const resultado = Object.values(porColaborador)
      .filter(c => c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || c.departamento.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.dias_total - a.dias_total);

    // Agregação por tipo
    const porTipo = {};
    ausenciasAno.forEach(a => {
      if (!porTipo[a.tipo]) porTipo[a.tipo] = 0;
      const inicio = new Date(a.data_inicio);
      const fim = new Date(a.data_fim);
      const dias = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
      porTipo[a.tipo] += dias;
    });

    const porDepartamento = {};
    resultado.forEach(c => {
      if (!porDepartamento[c.departamento]) porDepartamento[c.departamento] = 0;
      porDepartamento[c.departamento] += c.dias_total;
    });

    return {
      colaboradores: resultado,
      porTipo: Object.entries(porTipo).map(([tipo, dias]) => ({ tipo, dias })),
      porDepartamento: Object.entries(porDepartamento).map(([dept, dias]) => ({ departamento: dept, dias }))
    };
  }, [ausencias, colaboradores, filtroTipo, anoSelecionado, searchTerm]);

  const totalDiasAbsentes = filteredData.colaboradores.reduce((sum, c) => sum + c.dias_total, 0);
  const colaboradoresAusentes = filteredData.colaboradores.length;

  const tiposAbsencia = {
    'ferias': { label: 'Férias', cor: '#10b981' },
    'baixa_medica': { label: 'Baixa Médica', cor: '#ef4444' },
    'feriado': { label: 'Feriado', cor: '#3b82f6' },
    'justificada': { label: 'Justificada', cor: '#f59e0b' },
    'injustificada': { label: 'Injustificada', cor: '#8b5cf6' }
  };

  const exportarRelatorio = () => {
    const csv = [
      ['Colaborador', 'Departamento', 'Dias de Ausência', 'Férias', 'Baixa Médica', 'Justificada', 'Injustificada'],
      ...filteredData.colaboradores.map(c => [
        c.nome,
        c.departamento,
        c.dias_total,
        c.tipos['ferias'] || 0,
        c.tipos['baixa_medica'] || 0,
        c.tipos['justificada'] || 0,
        c.tipos['injustificada'] || 0
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
    element.setAttribute('download', `relatorio_absentismo_${anoSelecionado}.csv`);
    element.click();
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Relatório de Absentismo</h1>
          <p className="text-slate-600">Taxa por colaborador, departamento e período</p>
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
                  placeholder="Buscar colaborador ou departamento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="ferias">Férias</option>
                <option value="baixa_medica">Baixa Médica</option>
                <option value="justificada">Justificada</option>
                <option value="injustificada">Injustificada</option>
              </select>
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm"
              >
                {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{totalDiasAbsentes}</div>
              <p className="text-sm text-slate-600 mt-1">Total de Dias de Ausência</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">{colaboradoresAusentes}</div>
              <p className="text-sm text-slate-600 mt-1">Colaboradores com Ausências</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Ausências por Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={filteredData.porTipo}
                    dataKey="dias"
                    nameKey="tipo"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                  >
                    {filteredData.porTipo.map((entry) => (
                      <Cell key={entry.tipo} fill={tiposAbsencia[entry.tipo]?.cor || '#999'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Departamentos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={filteredData.porDepartamento}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="departamento" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="dias" fill="#8b5cf6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Export */}
        <div className="mb-6 flex justify-end">
          <Button onClick={exportarRelatorio} variant="outline" className="gap-2">
            <Download className="h-4 w-4" /> Exportar Relatório
          </Button>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhe por Colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Colaborador</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-700">Departamento</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Total Dias</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Férias</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Baixa</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Justificada</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-700">Injustificada</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.colaboradores.map((c) => (
                    <tr key={c.enrollid} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{c.nome}</td>
                      <td className="py-3 px-4 text-slate-600">{c.departamento}</td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-900">{c.dias_total}</td>
                      <td className="py-3 px-4 text-center"><Badge className="bg-green-100 text-green-700">{c.tipos['ferias'] || 0}</Badge></td>
                      <td className="py-3 px-4 text-center"><Badge className="bg-red-100 text-red-700">{c.tipos['baixa_medica'] || 0}</Badge></td>
                      <td className="py-3 px-4 text-center"><Badge className="bg-amber-100 text-amber-700">{c.tipos['justificada'] || 0}</Badge></td>
                      <td className="py-3 px-4 text-center"><Badge className="bg-purple-100 text-purple-700">{c.tipos['injustificada'] || 0}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}