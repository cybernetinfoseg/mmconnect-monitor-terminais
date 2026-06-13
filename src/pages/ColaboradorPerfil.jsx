import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Users, Fingerprint, Calendar, FileText, Clock,
  Mail, Phone, Building2, Loader2, TrendingUp, AlertTriangle, Banknote
} from 'lucide-react';
import { format, parseISO, differenceInYears } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ColaboradorPerfil() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const colaboradorId = params.get('id');
  const enrollidParam = params.get('enrollid') ? Number(params.get('enrollid')) : null;

  // Ficha RH (Colaborador)
  const { data: fichaRH, isLoading: loadingRH } = useQuery({
    queryKey: ['perfil-rh', colaboradorId, enrollidParam],
    queryFn: async () => {
      if (enrollidParam) {
        const list = await base44.entities.Colaborador.filter({ enrollid: enrollidParam });
        return list[0] || null;
      }
      if (colaboradorId) {
        const list = await base44.entities.Colaborador.list('-data_admissao', 500);
        return list.find(c => c.id === colaboradorId) || null;
      }
      return null;
    },
    enabled: !!(colaboradorId || enrollidParam),
  });

  // Terminal User (Biometria)
  const { data: terminalUser } = useQuery({
    queryKey: ['perfil-tu', enrollidParam, fichaRH?.enrollid],
    queryFn: async () => {
      const eid = enrollidParam || fichaRH?.enrollid;
      if (!eid) return null;
      const list = await base44.entities.TerminalUser.filter({ enrollid: eid });
      return list[0] || null;
    },
    enabled: !!(enrollidParam || fichaRH?.enrollid),
  });

  const effectiveEnrollid = enrollidParam || fichaRH?.enrollid || terminalUser?.enrollid;
  const nomeDisplay = fichaRH?.nome || terminalUser?.nome || '—';

  // Marcações
  const { data: marcacoes = [] } = useQuery({
    queryKey: ['perfil-marcacoes', effectiveEnrollid],
    queryFn: () => base44.entities.Marcacao.filter({ enrollid: effectiveEnrollid }, '-timestamp', 30),
    enabled: !!effectiveEnrollid,
  });

  // Pedidos de Férias
  const { data: pedidosFerias = [] } = useQuery({
    queryKey: ['perfil-ferias', fichaRH?.id],
    queryFn: () => base44.entities.PedidoFerias.filter({ colaborador_id: fichaRH.id }, '-created_date', 30),
    enabled: !!fichaRH?.id,
  });

  // Contratos
  const { data: contratos = [] } = useQuery({
    queryKey: ['perfil-contratos', fichaRH?.id],
    queryFn: () => base44.entities.Contrato.filter({ colaborador_id: fichaRH.id }, '-data_inicio', 20),
    enabled: !!fichaRH?.id,
  });

  // Horas Extra
  const { data: horasExtra = [] } = useQuery({
    queryKey: ['perfil-horas-extra', fichaRH?.id],
    queryFn: () => base44.entities.RegistoHorasExtra.filter({ colaborador_id: fichaRH.id }, '-data', 20),
    enabled: !!fichaRH?.id,
  });

  // Ausências
  const { data: ausencias = [] } = useQuery({
    queryKey: ['perfil-ausencias', effectiveEnrollid],
    queryFn: () => base44.entities.AusenciaFalta.filter({ enrollid: effectiveEnrollid }, '-data_inicio', 20),
    enabled: !!effectiveEnrollid,
  });

  // Processamentos salariais
  const { data: salarios = [] } = useQuery({
    queryKey: ['perfil-salarios', fichaRH?.id],
    queryFn: () => base44.entities.ProcessamentoSalario.filter({ colaborador_id: fichaRH.id }, '-ano', 12),
    enabled: !!fichaRH?.id,
  });

  if (!colaboradorId && !enrollidParam) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <Users className="h-12 w-12 mx-auto text-slate-300" />
          <p className="text-slate-500">Colaborador não especificado.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
        </div>
      </div>
    );
  }

  if (loadingRH) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const idade = fichaRH?.data_nascimento
    ? differenceInYears(new Date(), parseISO(fichaRH.data_nascimento))
    : null;

  const contratoAtivo = contratos.find(c => c.estado === 'ativo');
  const ultimaMarcacao = marcacoes[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-slate-600 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        {/* Profile Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-start gap-5 flex-wrap">
            {fichaRH?.foto_url
              ? <img src={fichaRH.foto_url} alt="" className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-200 shrink-0" />
              : <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-teal-100 flex items-center justify-center text-3xl font-bold text-blue-700 shrink-0 select-none">
                  {nomeDisplay?.charAt(0)?.toUpperCase()}
                </div>
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">{nomeDisplay}</h1>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {[fichaRH?.cargo || terminalUser?.cargo, fichaRH?.departamento || terminalUser?.departamento].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {fichaRH && (
                    <Link to="/FichaColaborador">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 cursor-pointer hover:bg-blue-200 transition-colors text-xs">📋 Ficha RH</Badge>
                    </Link>
                  )}
                  {terminalUser && (
                    <Link to="/Utilizadores">
                      <Badge className="bg-teal-100 text-teal-700 border-teal-200 cursor-pointer hover:bg-teal-200 transition-colors text-xs">🖐️ Biometria</Badge>
                    </Link>
                  )}
                  {fichaRH
                    ? fichaRH.ativo !== false
                      ? <Badge className="bg-emerald-100 text-emerald-700 text-xs">Ativo</Badge>
                      : <Badge className="bg-slate-100 text-slate-500 text-xs">Inativo</Badge>
                    : null
                  }
                </div>
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm text-slate-600">
                {effectiveEnrollid && (
                  <span className="flex items-center gap-1.5">
                    <Fingerprint className="h-4 w-4 text-slate-400" />
                    ID Biométrico: <strong>{effectiveEnrollid}</strong>
                  </span>
                )}
                {fichaRH?.numero_colaborador && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-400">#</span>{fichaRH.numero_colaborador}
                  </span>
                )}
                {idade && <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" />{idade} anos</span>}
                {(fichaRH?.email || terminalUser?.email) && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4 text-slate-400" />{fichaRH?.email || terminalUser?.email}
                  </span>
                )}
                {(fichaRH?.telemovel || terminalUser?.telefone) && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-4 w-4 text-slate-400" />{fichaRH?.telemovel || terminalUser?.telefone}
                  </span>
                )}
                {fichaRH?.data_admissao && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-slate-400" />
                    Admissão: {format(parseISO(fichaRH.data_admissao), 'dd/MM/yyyy')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-5 pt-5 border-t border-slate-100">
            {[
              { label: 'Marcações', value: marcacoes.length, color: 'text-emerald-600' },
              { label: 'Férias', value: pedidosFerias.length, color: 'text-blue-600' },
              { label: 'Contratos', value: contratos.length, color: 'text-purple-600' },
              { label: 'Ausências', value: ausencias.length, color: 'text-amber-600' },
              { label: 'Horas Extra', value: horasExtra.length, color: 'text-violet-600' },
              { label: 'Salários', value: salarios.length, color: 'text-teal-600' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Último acesso e contrato ativo */}
          {(ultimaMarcacao || contratoAtivo) && (
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100">
              {ultimaMarcacao && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>Última marcação: </span>
                  <Badge className={cn('text-xs', ultimaMarcacao.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                    {ultimaMarcacao.tipo}
                  </Badge>
                  <span className="font-mono">{format(new Date(ultimaMarcacao.timestamp), 'dd/MM/yy HH:mm')}</span>
                </div>
              )}
              {contratoAtivo && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg text-xs text-slate-600">
                  <FileText className="h-3.5 w-3.5 text-slate-400" />
                  <span>Contrato ativo: {contratoAtivo.tipo_contrato || '—'}</span>
                  {contratoAtivo.data_fim && <span>até {contratoAtivo.data_fim}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="marcacoes">
          <TabsList className="bg-white border border-slate-200 h-auto flex-wrap gap-0.5 p-1">
            <TabsTrigger value="marcacoes" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Marcações ({marcacoes.length})
            </TabsTrigger>
            <TabsTrigger value="ferias" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Férias ({pedidosFerias.length})
            </TabsTrigger>
            <TabsTrigger value="contratos" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Contratos ({contratos.length})
            </TabsTrigger>
            <TabsTrigger value="ausencias" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Ausências ({ausencias.length})
            </TabsTrigger>
            <TabsTrigger value="horas_extra" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Horas Extra ({horasExtra.length})
            </TabsTrigger>
            <TabsTrigger value="salarios" className="text-xs data-[state=active]:bg-slate-900 data-[state=active]:text-white">
              Salários ({salarios.length})
            </TabsTrigger>
          </TabsList>

          {/* Marcações */}
          <TabsContent value="marcacoes" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Últimas Marcações</CardTitle>
                <Link to="/Marcacoes"><Button variant="outline" size="sm" className="text-xs h-7">Ver Todas</Button></Link>
              </CardHeader>
              <CardContent>
                {marcacoes.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem marcações registadas</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {marcacoes.map(m => (
                      <div key={m.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge className={cn('text-xs w-14 justify-center shrink-0',
                            m.tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700' :
                            m.tipo === 'saida' ? 'bg-rose-100 text-rose-700' :
                            'bg-slate-100 text-slate-500'
                          )}>{m.tipo || '—'}</Badge>
                          <span className="text-xs text-slate-600">{m.terminal_nome || '—'}</span>
                          {m.modo && <Badge variant="outline" className="text-xs">{m.modo}</Badge>}
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          {m.timestamp ? format(new Date(m.timestamp), 'dd/MM/yy HH:mm') : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Férias */}
          <TabsContent value="ferias" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Pedidos de Férias</CardTitle>
                <Link to="/GestaoFeriasRH"><Button variant="outline" size="sm" className="text-xs h-7">Gerir</Button></Link>
              </CardHeader>
              <CardContent>
                {pedidosFerias.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem pedidos de férias</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {pedidosFerias.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge className={cn('text-xs shrink-0',
                            p.estado === 'aprovado' ? 'bg-emerald-100 text-emerald-700' :
                            p.estado === 'pendente' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          )}>{p.estado}</Badge>
                          <span className="text-xs text-slate-600">{p.data_inicio} → {p.data_fim}</span>
                          {p.num_dias && <span className="text-xs text-slate-400">{p.num_dias} dias</span>}
                        </div>
                        <span className="text-xs text-slate-400">{p.ano || ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contratos */}
          <TabsContent value="contratos" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Contratos</CardTitle>
                <Link to="/GestaoContratos"><Button variant="outline" size="sm" className="text-xs h-7">Gerir</Button></Link>
              </CardHeader>
              <CardContent>
                {contratos.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem contratos</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contratos.map(c => (
                      <div key={c.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge className={cn('text-xs shrink-0',
                            c.estado === 'ativo' ? 'bg-emerald-100 text-emerald-700' :
                            c.estado === 'expirado' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-500'
                          )}>{c.estado || '—'}</Badge>
                          <span className="text-xs text-slate-600">{c.tipo_contrato || '—'}</span>
                          {c.data_inicio && <span className="text-xs text-slate-400">{c.data_inicio} → {c.data_fim || 'Sem termo'}</span>}
                        </div>
                        {c.salario_base && (
                          <span className="text-xs font-semibold text-slate-700">{Number(c.salario_base).toLocaleString('pt-PT')}€</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ausências */}
          <TabsContent value="ausencias" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Ausências e Faltas</CardTitle>
                <Link to="/GestaoAusencias"><Button variant="outline" size="sm" className="text-xs h-7">Gerir</Button></Link>
              </CardHeader>
              <CardContent>
                {ausencias.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem ausências registadas</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {ausencias.map(a => (
                      <div key={a.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge variant="outline" className="text-xs shrink-0">{a.tipo || '—'}</Badge>
                          {a.data_inicio && <span className="text-xs text-slate-600">{a.data_inicio}{a.data_fim ? ` → ${a.data_fim}` : ''}</span>}
                          {a.motivo && <span className="text-xs text-slate-400 truncate max-w-[120px]">{a.motivo}</span>}
                        </div>
                        <Badge className={cn('text-xs', a.aprovado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                          {a.aprovado ? 'Aprovado' : 'Pendente'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Horas Extra */}
          <TabsContent value="horas_extra" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Horas Extra</CardTitle>
                <Link to="/HorasExtra"><Button variant="outline" size="sm" className="text-xs h-7">Gerir</Button></Link>
              </CardHeader>
              <CardContent>
                {horasExtra.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem horas extra registadas</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {horasExtra.map(h => (
                      <div key={h.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge className={cn('text-xs shrink-0', h.aprovado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                            {h.aprovado ? 'Aprovado' : 'Pendente'}
                          </Badge>
                          {h.data && <span className="text-xs text-slate-600">{h.data}</span>}
                          {h.minutos_extra > 0 && (
                            <span className="text-xs text-slate-500">
                              {Math.floor(h.minutos_extra / 60)}h{h.minutos_extra % 60 > 0 ? `${h.minutos_extra % 60}m` : ''}
                            </span>
                          )}
                          {h.tipo_dia && <Badge variant="outline" className="text-xs">{h.tipo_dia}</Badge>}
                        </div>
                        {h.destino && <Badge variant="outline" className="text-xs">{h.destino}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salários */}
          <TabsContent value="salarios" className="mt-3">
            <Card className="bg-white border-slate-200">
              <CardHeader className="pb-2 pt-4 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Processamentos Salariais</CardTitle>
                <Link to="/Payroll"><Button variant="outline" size="sm" className="text-xs h-7">Payroll</Button></Link>
              </CardHeader>
              <CardContent>
                {salarios.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">Sem processamentos salariais</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {salarios.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Badge className={cn('text-xs shrink-0',
                            s.estado === 'pago' ? 'bg-emerald-100 text-emerald-700' :
                            s.estado === 'processado' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-500'
                          )}>{s.estado}</Badge>
                          <span className="text-xs text-slate-600">{String(s.mes).padStart(2, '0')}/{s.ano}</span>
                          {s.remuneracao_liquida && (
                            <span className="text-xs text-slate-500">Líquido: {Number(s.remuneracao_liquida).toLocaleString('pt-PT')}€</span>
                          )}
                        </div>
                        {s.remuneracao_bruta && (
                          <span className="text-xs font-semibold text-slate-700">Bruto: {Number(s.remuneracao_bruta).toLocaleString('pt-PT')}€</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}