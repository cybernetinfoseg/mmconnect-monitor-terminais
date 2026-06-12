import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Clock, AlertTriangle, DollarSign, TrendingDown, Calendar } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function DashboardRHExecutivo() {
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_exec'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const { data: contratos = [] } = useQuery({
    queryKey: ['contratos_exec'],
    queryFn: () => base44.entities.Contrato.list()
  });

  const { data: horasExtra = [] } = useQuery({
    queryKey: ['horas_extra_exec'],
    queryFn: () => base44.entities.RegistoHorasExtra.list()
  });

  const { data: ausencias = [] } = useQuery({
    queryKey: ['ausencias_exec'],
    queryFn: () => base44.entities.AusenciaFalta.list()
  });

  const { data: saldos = [] } = useQuery({
    queryKey: ['saldos_ferias_exec'],
    queryFn: () => base44.entities.SaldoFerias.list()
  });

  const { data: marcacoes = [] } = useQuery({
    queryKey: ['marcacoes_exec'],
    queryFn: () => base44.entities.Marcacao.list('-data_marcacao', 50000)
  });

  const kpis = useMemo(() => {
    const anoAtual = new Date().getFullYear();

    const colaboradoresAtivos = colaboradores.filter(c => c.ativo === true);
    const colaboradoresSaidos = colaboradores.filter(c => !c.ativo);
    const turnoverRate = colaboradores.length > 0 
      ? ((colaboradoresSaidos.length / colaboradores.length) * 100).toFixed(1) 
      : 0;

    const ausenciasAno = ausencias.filter(a => {
      const dataIni = new Date(a.data_inicio);
      return dataIni.getFullYear() === anoAtual;
    });
    const diasAusentes = ausenciasAno.reduce((sum, a) => {
      const inicio = new Date(a.data_inicio);
      const fim = new Date(a.data_fim);
      const dias = Math.ceil((fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
      return sum + dias;
    }, 0);
    const diasUteis = colaboradoresAtivos.length * 22 * (new Date().getMonth() + 1) / 12;
    const taxaAbsentismo = diasUteis > 0 ? ((diasAusentes / diasUteis) * 100).toFixed(1) : 0;

    const custoTotalMensalEstimado = contratos.reduce((sum, c) => {
      const salarioMensal = c.salario_base || 0;
      const subsidiosAno = (c.subsidio_alimentacao || 0) * 22 * 12;
      const totalAnual = (salarioMensal * 12) + subsidiosAno;
      return sum + totalAnual / 12;
    }, 0);
    const custoMedio = colaboradoresAtivos.length > 0 
      ? (custoTotalMensalEstimado / colaboradoresAtivos.length).toFixed(0)
      : 0;

    const horasExtraAno = horasExtra.filter(h => {
      const data = new Date(h.data);
      return data.getFullYear() === anoAtual;
    });
    const minutosTotais = horasExtraAno.reduce((sum, h) => sum + (h.minutos_extra || 0), 0);
    const horasTotais = (minutosTotais / 60).toFixed(0);

    const agora = new Date();
    const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
    const contratosExpirando = contratos.filter(c => {
      if (!c.data_fim) return false;
      const dataFim = new Date(c.data_fim);
      return dataFim >= agora && dataFim <= em30dias;
    });

    const colaboradoresComMarcacao = new Set(marcacoes.map(m => m.enrollid)).size;
    const taxaFrequencia = colaboradoresAtivos.length > 0
      ? ((colaboradoresComMarcacao / colaboradoresAtivos.length) * 100).toFixed(1)
      : 0;

    const colaboradoresEmRisco = new Set();
    horasExtraAno.forEach(h => {
      if ((h.acumulado_ano_antes || 0) + (h.minutos_extra || 0) > 150 * 60) {
        colaboradoresEmRisco.add(h.colaborador_id);
      }
    });

    return {
      turnoverRate,
      taxaAbsentismo,
      custoMedio,
      horasTotais,
      contratosExpirando: contratosExpirando.length,
      taxaFrequencia,
      colaboradoresEmRisco: colaboradoresEmRisco.size,
      colaboradoresAtivos: colaboradoresAtivos.length
    };
  }, [colaboradores, contratos, horasExtra, ausencias, marcacoes]);

  const chartData = [
    { mes: 'Jan', absentismo: 2.5, frequencia: 98.2 },
    { mes: 'Fev', absentismo: 2.8, frequencia: 97.9 },
    { mes: 'Mar', absentismo: 2.1, frequencia: 98.5 },
    { mes: 'Abr', absentismo: 3.2, frequencia: 97.1 },
    { mes: 'Mai', absentismo: 2.9, frequencia: 98.0 }
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard RH Executivo</h1>
          <p className="text-slate-600">KPIs e métricas de gestão de pessoas</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Turnover</CardTitle>
                <TrendingDown className="h-5 w-5 text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{kpis.turnoverRate}%</div>
              <p className="text-xs text-slate-500 mt-1">Colaboradores que saíram</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Absentismo</CardTitle>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{kpis.taxaAbsentismo}%</div>
              <p className="text-xs text-slate-500 mt-1">Taxa de ausências</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Custo Médio</CardTitle>
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{kpis.custoMedio}</div>
              <p className="text-xs text-slate-500 mt-1">Por colaborador/mês</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-600">Horas Extra</CardTitle>
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{kpis.horasTotais}h</div>
              <p className="text-xs text-slate-500 mt-1">Acumuladas este ano</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{kpis.colaboradoresAtivos}</div>
              <p className="text-sm text-slate-600 mt-1">Colaboradores Ativos</p>
            </CardContent>
          </Card>

          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{kpis.contratosExpirando}</div>
              <p className="text-sm text-slate-600 mt-1">Contratos a Expirar (30 dias)</p>
            </CardContent>
          </Card>

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-amber-600">{kpis.colaboradoresEmRisco}</div>
              <p className="text-sm text-slate-600 mt-1">Em Risco (150+ horas)</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Absentismo vs Frequência</CardTitle>
              <CardDescription>Tendência últimos 5 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="absentismo" stroke="#f59e0b" name="Absentismo %" />
                  <Line type="monotone" dataKey="frequencia" stroke="#10b981" name="Frequência %" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribuição de Custos</CardTitle>
              <CardDescription>Salários vs Subsídios</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { categoria: 'Salários', valor: 65 },
                  { categoria: 'Subsídios', valor: 20 },
                  { categoria: 'Horas Extra', valor: 10 },
                  { categoria: 'Outros', valor: 5 }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="categoria" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="valor" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}