import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Building2, Monitor, Users, Activity, TrendingUp,
  AlertTriangle, Clock, Wifi, WifiOff, MapPin, Shield,
  BarChart3, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

export default function DashboardExecutivo() {
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-exec'],
    queryFn: () => base44.entities.Terminal.list('nome'),
    enabled: !!currentUser,
  });
  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colab-exec'],
    queryFn: () => base44.entities.Colaborador.list('-created_date', 500),
    enabled: !!currentUser,
  });
  const { data: incidents = [] } = useQuery({
    queryKey: ['incidents-exec'],
    queryFn: () => base44.entities.AlertIncident.list('-created_date', 100),
    enabled: !!currentUser,
  });
  const { data: sites = [] } = useQuery({
    queryKey: ['sites-exec'],
    queryFn: () => base44.entities.Site.list('nome'),
    enabled: !!currentUser,
  });
  const { data: tenants = [] } = useQuery({
    queryKey: ['tenants-exec'],
    queryFn: () => base44.entities.Tenant.list('nome'),
    enabled: !!currentUser,
  });

  const online = terminals.filter(t => t.status === 'online').length;
  const offline = terminals.filter(t => t.status !== 'online').length;
  const totalTerminais = terminals.length;
  const uptime = totalTerminais > 0 ? Math.round((online / totalTerminais) * 100) : 0;
  const ativos = colaboradores.filter(c => c.ativo !== false).length;

  const recentIncidents = useMemo(() => 
    incidents.filter(i => !i.resolvido).slice(0, 5)
  , [incidents]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard Executivo</h1>
              <p className="text-sm text-slate-500">Visão estratégica da plataforma</p>
            </div>
          </div>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs px-3 py-1.5">
            {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Badge>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Tenants', value: tenants.length, icon: Building2, color: 'bg-violet-50 border-violet-200', text: 'text-violet-700', iconColor: 'text-violet-600' },
            { label: 'Sites', value: sites.length, icon: MapPin, color: 'bg-blue-50 border-blue-200', text: 'text-blue-700', iconColor: 'text-blue-600' },
            { label: 'Terminais', value: totalTerminais, icon: Monitor, color: 'bg-teal-50 border-teal-200', text: 'text-teal-700', iconColor: 'text-teal-600' },
            { label: 'Colaboradores', value: ativos, icon: Users, color: 'bg-amber-50 border-amber-200', text: 'text-amber-700', iconColor: 'text-amber-600' },
            { label: 'Online', value: online, icon: Wifi, color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', iconColor: 'text-emerald-600' },
            { label: 'Offline', value: offline, icon: WifiOff, color: 'bg-red-50 border-red-200', text: 'text-red-700', iconColor: 'text-red-600', highlight: offline > 0 },
          ].map((kpi, i) => (
            <Card key={i} className={cn('border', kpi.color, kpi.highlight && 'animate-pulse')}>
              <CardContent className="p-4">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', kpi.color)}>
                  <kpi.icon className={cn('h-5 w-5', kpi.iconColor)} />
                </div>
                <p className={cn('text-2xl font-bold', kpi.text)}>{kpi.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Uptime & SLA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="bg-white border-slate-200 lg:col-span-2">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="h-4 w-4 text-emerald-600" />
                <h2 className="font-semibold text-slate-800 text-sm">Disponibilidade da Plataforma</h2>
              </div>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-4xl font-bold text-slate-900">{uptime}%</p>
                  <p className="text-xs text-slate-500 mt-1">Uptime global</p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    Online: <strong>{online}</strong>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Offline: <strong>{offline}</strong>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-700" style={{ width: `${uptime}%` }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h2 className="font-semibold text-slate-800 text-sm">Incidentes Ativos</h2>
              </div>
              <p className="text-3xl font-bold text-amber-600">{recentIncidents.length}</p>
              <p className="text-xs text-slate-500 mt-1">Por resolver</p>
              {recentIncidents.length > 0 && (
                <div className="mt-3 space-y-2">
                  {recentIncidents.slice(0, 3).map(inc => (
                    <div key={inc.id} className="flex items-center gap-2 text-xs">
                      <span className={cn('w-1.5 h-1.5 rounded-full', inc.severidade === 'critico' ? 'bg-red-500' : 'bg-amber-500')} />
                      <span className="text-slate-600 truncate">{inc.titulo || inc.descricao || 'Incidente'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sites overview */}
        {sites.length > 0 && (
          <Card className="bg-white border-slate-200">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4 text-blue-600" />
                <h2 className="font-semibold text-slate-800 text-sm">Sites</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sites.map(site => {
                  const siteTerminals = terminals.filter(t => t.site_id === site.id);
                  const siteOnline = siteTerminals.filter(t => t.status === 'online').length;
                  return (
                    <div key={site.id} className="border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{site.nome}</p>
                          <p className="text-xs text-slate-400">{site.localidade || site.morada || '—'}</p>
                        </div>
                        <Badge className={cn('text-xs', site.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                          {site.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> {siteTerminals.length} terminal(is)</span>
                        <span className="flex items-center gap-1"><Wifi className="h-3 w-3 text-emerald-500" /> {siteOnline} online</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}