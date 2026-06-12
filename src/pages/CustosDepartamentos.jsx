import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function CustosDepartamentos() {
  const [anoSelecionado, setAnoSelecionado] = useState(new Date().getFullYear());

  const { data: custos = [] } = useQuery({
    queryKey: ['custos_departamentos'],
    queryFn: () => base44.entities.CustoDepartamento.list()
  });

  const filtrados = useMemo(() => {
    return custos.filter(c => c.ano === anoSelecionado && !c.mes);
  }, [custos, anoSelecionado]);

  const totalCusto = useMemo(() => {
    return filtrados.reduce((sum, c) => sum + (c.custo_total_bruto || 0), 0);
  }, [filtrados]);

  const dataPie = filtrados.map(c => ({
    name: c.departamento,
    value: c.custo_total_bruto || 0
  }));

  const dataBar = filtrados.sort((a, b) => (b.custo_total_bruto || 0) - (a.custo_total_bruto || 0));

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Custos por Departamento</h1>
          <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(Number(e.target.value))} className="px-3 py-2 border rounded-md">
            {[2024, 2025, 2026].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">€{(totalCusto / 1000).toFixed(1)}k</div>
              <p className="text-sm text-slate-600">Custo Total Anual</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-green-600">{filtrados.length}</div>
              <p className="text-sm text-slate-600">Departamentos</p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-purple-600">€{(totalCusto / filtrados.length / 1000).toFixed(1)}k</div>
              <p className="text-sm text-slate-600">Média por Departamento</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={dataPie} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} outerRadius={100} fill="#8884d8" dataKey="value">
                    {dataPie.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custos por Departamento</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dataBar}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="departamento" angle={-45} textAnchor="end" height={60} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="custo_total_bruto" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detalhe por Departamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Departamento</th>
                    <th className="text-right py-3 px-4">Colaboradores</th>
                    <th className="text-right py-3 px-4">Salários</th>
                    <th className="text-right py-3 px-4">SS Empresa</th>
                    <th className="text-right py-3 px-4">Total</th>
                    <th className="text-right py-3 px-4">Média/Colab</th>
                  </tr>
                </thead>
                <tbody>
                  {dataBar.map((c) => (
                    <tr key={c.departamento} className="border-b hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium">{c.departamento}</td>
                      <td className="py-3 px-4 text-right">{c.numero_colaboradores}</td>
                      <td className="py-3 px-4 text-right">€{(c.salarios_brutos || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">€{(c.custo_ss_empresa || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right font-semibold">€{(c.custo_total_bruto || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">€{((c.custo_total_bruto || 0) / c.numero_colaboradores).toFixed(0)}</td>
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