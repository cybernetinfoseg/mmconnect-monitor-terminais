import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  Activity, Wrench, Server, Cpu, Clock,
  AlertTriangle, Wifi, WifiOff
} from 'lucide-react';

export default function DashboardTecnico() {
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-tech'],
    queryFn: () => base44.entities.Terminal.list('nome'),
    enabled: !!currentUser,
    refetchInterval: 15000,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['agents-tech'],
    queryFn: () => base44.entities.AgentRegistry.list('-ultimo_heartbeat'),
    enabled: !!currentUser,
    refetchInterval: 15000,
  });
  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts-tech'],
    queryFn: () => base44.entities.AlertaAcesso.list('-timestamp', 100),
    enabled: !!currentUser,
  });
  const { data: logs = [] } = useQuery({
    queryKey: ['logs-tech'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 50),
    enabled: !!currentUser,
  });

  const online = terminals.filter(t => t.status === 'online').length;
  const offline = terminals.filter(t => t.status !== 'online').length;
  const latencies = terminals.filter(t => t.latencia_ms != null).map(t => t.latencia_ms);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const criticalAlerts = alerts.filter(a => a.severidade === 'critico' && !a.resolvido);
  const warningAlerts = alerts.filter(a => a.severidade === 'aviso' && !a.resolvido);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
            <Activity className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard Técnico</h1>
            <p className="text-sm text-slate-400">Monitoramento de infraestrutura e agentes</p>
          </div>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: 'Online', value: online, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
            { label: 'Offline', value: offline, color: 'bg-red-500/20 text-red-400 border-red-500/30' },
            { label: 'Latência', value: avgLatency ? `${avgLatency}ms` : '—', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
            { label: 'Agentes', value: agents.filter(a => a.status === 'online').length, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
            { label: 'Críticos', value: criticalAlerts.length, color: 'bg-red-500/20 text-red-400 border-red-500/30', pulse: criticalAlerts.length > 0 },
            { label: 'Avisos', value: warningAlerts.length, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
            { label: 'Logs', value: logs.length, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
          ].map((s, i) => (
            <div key={i} className={cn('border rounded-xl p-3 text-center', s.color, s.pulse && 'animate-pulse')}>
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] font-medium mt-0.5 opacity-70">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Terminals */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4 text-emerald-400" />
              <h2 className="font-semibold text-white text-sm">Terminais ({terminals.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left py-2 px-2 font-medium">Nome</th>
                    <th className="text-left py-2 px-2 font-medium">Fabricante</th>
                    <th className="text-center py-2 px-2 font-medium">Status</th>
                    <th className="text-center py-2 px-2 font-medium">Latência</th>
                    <th className="text-right py-2 px-2 font-medium">Último Ping</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map(t => (
                    <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="py-2.5 px-2 font-medium text-slate-200">{t.nome}</td>
                      <td className="py-2.5 px-2 text-slate-400">{t.marca || '—'}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
                          t.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', t.status === 'online' ? 'bg-emerald-400' : 'bg-red-400')} />
                          {t.status || 'offline'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono">
                        <span className={cn('text-xs',
                          !t.latencia_ms ? 'text-slate-600' :
                          t.latencia_ms < 100 ? 'text-emerald-400' :
                          t.latencia_ms < 300 ? 'text-amber-400' : 'text-red-400'
                        )}>
                          {t.latencia_ms ? `${t.latencia_ms}ms` : '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-500 text-[10px]">
                        {t.ultimo_ping ? format(new Date(t.ultimo_ping), 'dd/MM HH:mm:ss') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Agents + Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="h-4 w-4 text-violet-400" />
                <h2 className="font-semibold text-white text-sm">Agentes ({agents.length})</h2>
              </div>
              {agents.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">Nenhum agente registado</p>
              ) : (
                <div className="space-y-2">
                  {agents.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/50 border border-slate-800">
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        a.status === 'online' ? 'bg-emerald-500/20' : 'bg-red-500/20')}>
                        <Cpu className={cn('h-4 w-4', a.status === 'online' ? 'text-emerald-400' : 'text-red-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{a.hostname}</p>
                        <p className="text-[10px] text-slate-500">v{a.versao || '?.?'} · {a.ip_local || '—'}</p>
                      </div>
                      <div className="text-right">
                        <Badge className={cn('text-[9px]', a.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                          {a.status}
                        </Badge>
                        {a.ultimo_heartbeat && (
                          <p className="text-[9px] text-slate-500 mt-0.5">{format(new Date(a.ultimo_heartbeat), 'HH:mm:ss')}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="font-semibold text-white text-sm">Alertas Recentes</h2>
              </div>
              {alerts.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">Nenhum alerta</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {alerts.slice(0, 10).map(a => (
                    <div key={a.id} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                      a.severidade === 'critico' ? 'bg-red-500/10 border border-red-500/20' :
                      a.severidade === 'aviso' ? 'bg-amber-500/10 border border-amber-500/20' :
                      'bg-slate-800/50 border border-slate-800'
                    )}>
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0',
                        a.severidade === 'critico' ? 'bg-red-400' : a.severidade === 'aviso' ? 'bg-amber-400' : 'bg-blue-400'
                      )} />
                      <span className="flex-1 text-slate-300 truncate">{a.descricao || a.tipo}</span>
                      <span className="text-slate-500 text-[10px] shrink-0">
                        {a.timestamp ? format(new Date(a.timestamp), 'dd/MM HH:mm') : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit logs */}
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-slate-400" />
              <h2 className="font-semibold text-white text-sm">Últimos Logs de Auditoria</h2>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {logs.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">Nenhum log</p>
              ) : (
                logs.slice(0, 15).map(log => (
                  <div key={log.id} className="flex items-center gap-2 px-3 py-1.5 rounded text-[11px] text-slate-400 hover:bg-slate-800/30">
                    <span className="text-slate-600 w-16 shrink-0">{log.created_date ? format(new Date(log.created_date), 'dd/MM HH:mm') : '—'}</span>
                    <span className="text-slate-300 flex-1 truncate">{log.acao || log.descricao || 'Evento'}</span>
                    <span className="text-slate-600 text-[10px] shrink-0">{log.user_email || '—'}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}