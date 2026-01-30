import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Webhook,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Send,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import moment from 'moment';

export default function WebhookReceiver() {
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [status, setStatus] = useState('online');
  const [latencia, setLatencia] = useState('');
  const [logs, setLogs] = useState([]);
  const [processing, setProcessing] = useState(false);

  const queryClient = useQueryClient();

  const { data: terminais = [] } = useQuery({
    queryKey: ['terminais-webhook'],
    queryFn: () => base44.entities.Terminal.list(),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ terminalId, data }) => {
      return base44.entities.Terminal.update(terminalId, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(['terminais-webhook']);
      addLog('success', `Terminal ${variables.terminalId.slice(0,8)}... atualizado para ${variables.data.status}`);
    },
    onError: (error, variables) => {
      addLog('error', `Erro ao atualizar ${variables.terminalId.slice(0,8)}...: ${error.message}`);
    }
  });

  const addLog = (type, message) => {
    setLogs(prev => [{
      id: Date.now(),
      type,
      message,
      timestamp: new Date()
    }, ...prev].slice(0, 50));
  };

  // Função para processar atualização de status
  const processStatusUpdate = async (terminalId, newStatus, latenciaMs = null) => {
    const terminal = terminais.find(t => t.id === terminalId);
    if (!terminal) {
      addLog('error', `Terminal ${terminalId} não encontrado`);
      return { success: false, error: 'Terminal não encontrado' };
    }

    const now = new Date().toISOString();
    const updateData = {
      status: newStatus,
      ultimo_ping: now,
      segundos_sem_ping: 0
    };

    if (latenciaMs !== null) {
      updateData.latencia_ms = latenciaMs;
    }

    // Se mudou de online para offline, criar incidente
    if (terminal.status === 'online' && newStatus === 'offline' && terminal.notificar_offline) {
      await base44.entities.AlertIncident.create({
        terminal_id: terminalId,
        terminal_nome: terminal.nome,
        local: terminal.local,
        cliente: terminal.cliente_nome,
        tipo: 'offline',
        timestamp: now,
        resolvido: false,
        notificado: false
      });
      addLog('warning', `Incidente criado: ${terminal.nome} ficou offline`);
    }

    // Se mudou de offline para online, resolver incidentes
    if (terminal.status === 'offline' && newStatus === 'online') {
      const incidents = await base44.entities.AlertIncident.filter({
        terminal_id: terminalId,
        tipo: 'offline',
        resolvido: false
      });
      
      for (const incident of incidents) {
        const duracao = Math.round((new Date() - new Date(incident.timestamp)) / 60000);
        await base44.entities.AlertIncident.update(incident.id, {
          resolvido: true,
          resolvido_em: now,
          duracao_minutos: duracao
        });
      }

      if (incidents.length > 0) {
        await base44.entities.AlertIncident.create({
          terminal_id: terminalId,
          terminal_nome: terminal.nome,
          local: terminal.local,
          cliente: terminal.cliente_nome,
          tipo: 'restored',
          timestamp: now,
          resolvido: true
        });
        addLog('success', `${terminal.nome} restaurado após ${incidents[0] ? Math.round((new Date() - new Date(incidents[0].timestamp)) / 60000) : 0} minutos offline`);
      }
    }

    await updateMutation.mutateAsync({ terminalId, data: updateData });

    // Registrar no histórico
    await base44.entities.StatusHistory.create({
      terminal_id: terminalId,
      terminal_nome: terminal.nome,
      status: newStatus,
      timestamp: now,
      local: terminal.local,
      cliente: terminal.cliente_nome
    });

    return { success: true };
  };

  // Simular envio manual
  const handleManualUpdate = async () => {
    if (!selectedTerminal) {
      addLog('error', 'Selecione um terminal');
      return;
    }

    setProcessing(true);
    await processStatusUpdate(
      selectedTerminal, 
      status, 
      latencia ? parseInt(latencia) : null
    );
    setProcessing(false);
  };

  // Simular ping em todos os terminais (para demo)
  const simulatePingAll = async () => {
    setProcessing(true);
    addLog('info', 'Iniciando verificação de todos os terminais...');

    for (const terminal of terminais) {
      if (!terminal.monitoramento_ativo) continue;

      // Simular resultado do ping (80% online, 20% offline)
      const isOnline = Math.random() > 0.2;
      const latenciaSimulada = isOnline ? Math.floor(Math.random() * 100) + 10 : null;

      await processStatusUpdate(
        terminal.id,
        isOnline ? 'online' : 'offline',
        latenciaSimulada
      );

      // Delay para não sobrecarregar
      await new Promise(r => setTimeout(r, 200));
    }

    addLog('success', `Verificação concluída: ${terminais.length} terminais processados`);
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-100 rounded-xl">
              <Activity className="h-6 w-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Simulador de Monitoramento</h1>
              <p className="text-sm text-slate-500">Teste a atualização de status dos terminais</p>
            </div>
          </div>

          <Button 
            onClick={simulatePingAll} 
            disabled={processing}
            className="bg-violet-600 hover:bg-violet-700"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${processing ? 'animate-spin' : ''}`} />
            {processing ? 'Processando...' : 'Simular Ping em Todos'}
          </Button>
        </div>

        {/* Info Alert */}
        <Alert className="bg-violet-50 border-violet-200">
          <AlertCircle className="h-4 w-4 text-violet-600" />
          <AlertTitle className="text-violet-900">Simulador para Testes</AlertTitle>
          <AlertDescription className="text-violet-800">
            Use esta página para testar a atualização de status manualmente. Em produção, 
            seu sistema de monitoramento (Zabbix, script PowerShell, etc) chamaria a API automaticamente.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Manual Update */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Atualização Manual
              </CardTitle>
              <CardDescription>Simule uma atualização de status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Terminal</Label>
                <Select value={selectedTerminal} onValueChange={setSelectedTerminal}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um terminal" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminais.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome} - {t.cliente_nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Latência (ms)</Label>
                  <Input
                    type="number"
                    value={latencia}
                    onChange={(e) => setLatencia(e.target.value)}
                    placeholder="25"
                  />
                </div>
              </div>

              <Button 
                onClick={handleManualUpdate} 
                disabled={processing || !selectedTerminal}
                className="w-full"
              >
                <Send className="h-4 w-4 mr-2" />
                Enviar Atualização
              </Button>
            </CardContent>
          </Card>

          {/* Status dos Terminais */}
          <Card>
            <CardHeader>
              <CardTitle>Status Atual</CardTitle>
              <CardDescription>Visão geral dos terminais</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {terminais.map((terminal) => (
                  <div 
                    key={terminal.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        terminal.status === 'online' ? 'bg-emerald-500' :
                        terminal.status === 'offline' ? 'bg-red-500' : 'bg-slate-400'
                      }`} />
                      <div>
                        <p className="font-medium text-sm">{terminal.nome}</p>
                        <p className="text-xs text-slate-500">{terminal.cliente_nome}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={terminal.status === 'online' ? 'default' : 'destructive'}
                             className={terminal.status === 'online' ? 'bg-emerald-100 text-emerald-700' : ''}>
                        {terminal.status || 'unknown'}
                      </Badge>
                      {terminal.latencia_ms && (
                        <p className="text-xs text-slate-500 mt-1">{terminal.latencia_ms}ms</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Log de Atualizações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <AnimatePresence>
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      log.type === 'success' ? 'bg-emerald-50 border border-emerald-200' :
                      log.type === 'error' ? 'bg-red-50 border border-red-200' :
                      log.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
                      'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    {log.type === 'success' ? <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5" /> :
                     log.type === 'error' ? <XCircle className="h-4 w-4 text-red-500 mt-0.5" /> :
                     log.type === 'warning' ? <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5" /> :
                     <Activity className="h-4 w-4 text-blue-500 mt-0.5" />}
                    <div className="flex-1">
                      <p className="text-sm">{log.message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {moment(log.timestamp).format('HH:mm:ss')}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {logs.length === 0 && (
                <p className="text-center text-slate-400 py-8">
                  Nenhuma atualização ainda. Use os controles acima para testar.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}