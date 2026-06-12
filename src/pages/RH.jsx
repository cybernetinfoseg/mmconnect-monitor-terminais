import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, FileText, CalendarDays, TrendingUp, AlertTriangle,
  Clock, UserCheck, UserX, Plus, ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { addDays, differenceInDays, parseISO, format } from 'date-fns';

export default function RH() {
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-rh'],
    queryFn: () => base44.entities.Colaborador.list('-created_date', 500),
    enabled: !!currentUser,
  });

  const { data: contratos = [] } = useQuery({
    queryKey: ['contratos-rh'],
    queryFn: () => base44.entities.Contrato.list('-data_inicio', 500),
    enabled: !!currentUser,
  });

  const { data: pedidosFerias = [] } = useQuery({
    queryKey: ['pedidos-ferias-rh'],
    queryFn: () => base44.entities.PedidoFerias.list('-created_date', 200),
    enabled: !!currentUser,
  });

  const hoje = new Date();
  const em30Dias = addDays(hoje, 30);
  const anoAtual = hoje.getFullYear();

  const ativos = colaboradores.filter(c => c.ativo !== false);
  const inativos = colaboradores.filter(c => c.ativo === false);

  const contratosAtivos = contratos.filter(c => c.estado === 'ativo');
  const contratosAExpirar = contratosAtivos.filter(c => {
    if (!c.data_fim) return false;
    const fim = parseISO(c.data_fim);
    return fim >= hoje && fim <= em30Dias;
  });

  const feriasPendentes = pedidosFerias.filter(p => p.estado === 'pendente');
  const feriasAprovadas = pedidosFerias.filter(p => p.estado === 'aprovado' && p.ano === anoAtual);

  const moduleCards = [
    {
      title: 'Fichas de Colaborador',
      desc: 'Dados pessoais, documentos, contactos e histórico',
      icon: Users,
      color: 'bg-blue-50 border-blue-200',
      iconColor: 'text-blue-600',
      link: '/FichaColaborador',
      stats: `${ativos.length} ativos`,
      badge: inativos.length > 0 ? `${inativos.length} inativos` : null,
      badgeColor: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Contratos',
      desc: 'Gestão de contratos, renovações e alertas de expiração',
      icon: FileText,
      color: 'bg-purple-50 border-purple-200',
      iconColor: 'text-purple-600',
      link: '/GestaoContratos',
      stats: `${contratosAtivos.length} ativos`,
      badge: contratosAExpirar.length > 0 ? `${contratosAExpirar.length} a expirar` : null,
      badgeColor: 'bg-amber-100 text-amber-700',
    },
    {
      title: 'Gestão de Férias',
      desc: 'Pedidos, aprovações, saldos e mapa de férias da equipa',
      icon: CalendarDays,
      color: 'bg-emerald-50 border-emerald-200',
      iconColor: 'text-emerald-600',
      link: '/GestaoFeriasRH',
      stats: `${feriasPendentes.length} pendentes`,
      badge: feriasPendentes.length > 0 ? `${feriasPendentes.length} para aprovar` : null,
      badgeColor: 'bg-orange-100 text-orange-700',
    },
  ];

  const alertas = [];
  if (contratosAExpirar.length > 0) {
    contratosAExpirar.forEach(c => {
      const dias = differenceInDays(parseISO(c.data_fim), hoje);
      alertas.push({
        tipo: 'contrato',
        msg: `Contrato de ${c.colaborador_nome} expira em ${dias} dia(s)`,
        color: dias <= 7 ? 'text-red-600' : 'text-amber-600',
        bg: dias <= 7 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200',
      });
    });
  }
  if (feriasPendentes.length > 0) {
    alertas.push({
      tipo: 'ferias',
      msg: `${feriasPendentes.length} pedido(s) de férias aguardam aprovação`,
      color: 'text-blue-600',
      bg: 'bg-blue-50 border-blue-200',
    });
  }

  const depMap = {};
  ativos.forEach(c => {
    const dep = c.departamento || 'Sem Departamento';
    depMap[dep] = (depMap[dep] || 0) + 1;
  });
  const depStats = Object.entries(depMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Recursos Humanos</h1>
            <p className="text-sm text-slate-500">Gestão completa de colaboradores, contratos e férias</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Colaboradores Ativos', value: ativos.length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Contratos Ativos', value: contratosAtivos.length, icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Férias Pendentes', value: feriasPendentes.length, icon: CalendarDays, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Contratos a Expirar', value: contratosAExpirar.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
          ].map((kpi, i) => (
            <Card key={i} className="bg-white border-slate-200">
              <CardContent className="p-4">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', kpi.bg)}>
                  <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                </div>
                <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas
            </h2>
            {alertas.map((a, i) => (
              <div key={i} className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border text-sm', a.bg)}>
                <AlertTriangle className={cn('h-4 w-4 shrink-0', a.color)} />
                <span className={a.color}>{a.msg}</span>
              </div>
            ))}
          </div>
        )}

        {/* Módulos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {moduleCards.map((m, i) => (
            <Link key={i} to={m.link}>
              <Card className={cn('border hover:shadow-md transition-shadow cursor-pointer h-full', m.color)}>
                <CardContent className="p-5 flex flex-col gap-3 h-full">
                  <div className="flex items-start justify-between">
                    <div className={cn('p-2.5 rounded-xl bg-white/70')}>
                      <m.icon className={cn('h-5 w-5', m.iconColor)} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{m.title}</h3>
                    <p className="text-xs text-slate-500 mt-1">{m.desc}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-600">{m.stats}</span>
                    {m.badge && (
                      <Badge className={cn('text-xs', m.badgeColor)}>{m.badge}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Departamentos */}
        {depStats.length > 0 && (
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Colaboradores por Departamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {depStats.map(([dep, count], i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-48 truncate">{dep}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(count / ativos.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-8 text-right">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}