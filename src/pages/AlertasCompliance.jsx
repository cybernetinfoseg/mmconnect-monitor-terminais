import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, FileSignature, TrendingUp, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

export default function AlertasCompliance() {
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [resolvidos, setResolvidos] = useState(false);

  const { data: horasExtra = [] } = useQuery({
    queryKey: ['horas_extra_compliance'],
    queryFn: () => base44.entities.RegistoHorasExtra.list()
  });

  const { data: contratos = [] } = useQuery({
    queryKey: ['contratos_compliance'],
    queryFn: () => base44.entities.Contrato.list()
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores_compliance'],
    queryFn: () => base44.entities.Colaborador.list()
  });

  const alertas = useMemo(() => {
    const lista = [];
    const anoAtual = new Date().getFullYear();
    const agora = new Date();

    // Alerta 1: Colaboradores acumulando mais de 150 horas extras
    const horasExtraAno = horasExtra.filter(h => {
      const data = new Date(h.data);
      return data.getFullYear() === anoAtual;
    });

    const porColaborador = {};
    horasExtraAno.forEach(h => {
      if (!porColaborador[h.colaborador_id]) {
        porColaborador[h.colaborador_id] = {
          minutos: 0,
          nome: h.colaborador_nome,
          id: h.colaborador_id
        };
      }
      porColaborador[h.colaborador_id].minutos += h.minutos_extra || 0;
    });

    Object.values(porColaborador).forEach(item => {
      const horas = item.minutos / 60;
      if (horas > 150) {
        lista.push({
          id: 'horas_extra_' + item.id,
          tipo: 'horas_extra',
          severidade: horas > 200 ? 'critico' : 'aviso',
          titulo: 'Limite de Horas Extra Atingido',
          descricao: `${item.nome} acumulou ${horas.toFixed(1)}h (limite legal: 150h)`,
          colaborador: item.nome,
          data: new Date(),
          resolvido: false
        });
      }
    });

    // Alerta 2: Contratos a expirar
    const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
    contratos.forEach(c => {
      if (!c.data_fim) return;
      const dataFim = new Date(c.data_fim);
      if (dataFim >= agora && dataFim <= em30dias && c.tipo !== 'sem_termo') {
        const colab = colaboradores.find(col => col.id === c.colaborador_id);
        const diasRestantes = Math.ceil((dataFim - agora) / (1000 * 60 * 60 * 24));
        lista.push({
          id: 'contrato_' + c.id,
          tipo: 'contrato_expirando',
          severidade: diasRestantes <= 7 ? 'critico' : 'aviso',
          titulo: 'Contrato a Expirar',
          descricao: `${colab?.nome || 'Desconhecido'} - Vence em ${diasRestantes} dias (${format(dataFim, 'dd/MM/yyyy')})`,
          colaborador: colab?.nome || 'Desconhecido',
          data: dataFim,
          resolvido: false
        });
      }
    });

    return lista.sort((a, b) => {
      // Ordenar por severidade e data
      const severidadeOrder = { 'critico': 0, 'aviso': 1, 'info': 2 };
      const diff = severidadeOrder[a.severidade] - severidadeOrder[b.severidade];
      return diff !== 0 ? diff : b.data - a.data;
    });
  }, [horasExtra, contratos, colaboradores]);

  const filteredAlertas = alertas.filter(a => {
    if (filtroTipo !== 'todos' && a.tipo !== filtroTipo) return false;
    if (!resolvidos && a.resolvido) return false;
    return true;
  });

  const severidadeConfig = {
    'critico': { cor: 'bg-red-100 border-red-300', text: 'text-red-700', icon: '🔴', label: 'Crítico' },
    'aviso': { cor: 'bg-amber-100 border-amber-300', text: 'text-amber-700', icon: '🟠', label: 'Aviso' },
    'info': { cor: 'bg-blue-100 border-blue-300', text: 'text-blue-700', icon: '🔵', label: 'Info' }
  };

  const tipoConfig = {
    'horas_extra': { label: 'Horas Extra', icon: TrendingUp },
    'contrato_expirando': { label: 'Contrato Expirado', icon: FileSignature }
  };

  const stats = {
    total: alertas.length,
    criticos: alertas.filter(a => a.severidade === 'critico').length,
    avisos: alertas.filter(a => a.severidade === 'aviso').length
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Alertas de Compliance</h1>
          <p className="text-slate-600">Colaboradores atingindo limites legais e eventos críticos</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-red-600">{stats.criticos}</div>
              <p className="text-sm text-slate-600 mt-1">Alertas Críticos</p>
            </CardContent>
          </Card>
          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-amber-600">{stats.avisos}</div>
              <p className="text-sm text-slate-600 mt-1">Avisos</p>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
              <p className="text-sm text-slate-600 mt-1">Total de Alertas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="px-3 py-2 rounded-md border border-slate-300 bg-white text-sm"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="horas_extra">Horas Extra</option>
                <option value="contrato_expirando">Contratos a Expirar</option>
              </select>
              <button
                onClick={() => setResolvidos(!resolvidos)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  resolvidos
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {resolvidos ? '✓ Mostrar Resolvidos' : 'Mostrar Ativos'}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Alertas */}
        <div className="space-y-4">
          {filteredAlertas.map((alerta, idx) => {
            const TipoIcon = tipoConfig[alerta.tipo]?.icon || AlertTriangle;
            const sevConfig = severidadeConfig[alerta.severidade];
            return (
              <motion.div key={alerta.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                <Card className={`${sevConfig.cor} border-2`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <TipoIcon className={`h-8 w-8 ${sevConfig.text}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className={`font-semibold text-lg ${sevConfig.text}`}>{alerta.titulo}</h3>
                          <Badge className={sevConfig.cor}>{sevConfig.label}</Badge>
                          <Badge variant="outline">{tipoConfig[alerta.tipo]?.label}</Badge>
                        </div>
                        <p className="text-slate-700 mb-2">{alerta.descricao}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2 text-xs text-slate-600">
                            <span>📅 {format(alerta.data, 'dd MMM yyyy', { locale: pt })}</span>
                            <span>👤 {alerta.colaborador}</span>
                          </div>
                          <div className="flex gap-2">
                            {alerta.severidade === 'critico' && (
                              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white">
                                Resolver Agora
                              </Button>
                            )}
                            {alerta.resolvido && (
                              <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Resolvido
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}

          {filteredAlertas.length === 0 && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6 text-center">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <p className="text-green-700 font-medium">Nenhum alerta encontrado</p>
                <p className="text-sm text-green-600 mt-1">Tudo em conformidade!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}