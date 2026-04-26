import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Trash2,
  AlertTriangle,
  Bot,
  Key,
  Copy,
  Info,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Plug,
  Radio,
  Save,
  Shield
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

import TelegramConfig from '../components/configuracoes/TelegramConfig';
import AdmsServerCode from '../components/configuracoes/AdmsServerCode';
import AgentSourceCode from '../components/configuracoes/AgentSourceCode';
import NocServerCode from '../components/configuracoes/NocServerCode';
import P2sServerCode from '../components/configuracoes/P2sServerCode';
import TimmyWsServerCode from '../components/configuracoes/TimmyWsServerCode';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const APP_ID = '697aa46c9998c30665e2e19a';

export default function Configuracoes() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [savingInterval, setSavingInterval] = useState(false);

  useEffect(() => {
    base44.auth.me().then(async (me) => {
      if (!me) return;
      // Tentar ler api_key via entidade (campo sensível pode não vir sempre)
      try {
        const fullUser = await base44.entities.User.get(me.id);
        // Usar api_key da entidade se disponível, caso contrário manter sem ela
        setCurrentUser({ ...me, ...fullUser });
      } catch {
        setCurrentUser(me);
      }
      // Tentar obter api_key via função dedicada (mais fiável)
      try {
        const res = await base44.functions.invoke('getUserApiKey', {});
        if (res.data?.api_key) {
          setCurrentUser(prev => ({ ...prev, api_key: res.data.api_key }));
        }
      } catch {
        // silenciar — função pode não existir ainda
      }
    }).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: monitorConfig = [], refetch: refetchMonitorConfig } = useQuery({
    queryKey: ['monitor-config'],
    queryFn: () => base44.entities.MonitorConfig.list(),
    enabled: isAdmin,
  });

  useEffect(() => {
    if (monitorConfig[0]?.intervalo_sync_minutos) {
      setRefreshInterval(String(monitorConfig[0].intervalo_sync_minutos));
    }
  }, [monitorConfig]);

  const handleSaveInterval = async () => {
    setSavingInterval(true);
    try {
      const interval = Math.max(1, parseInt(refreshInterval) || 5);
      if (monitorConfig[0]?.id) {
        await base44.entities.MonitorConfig.update(monitorConfig[0].id, { intervalo_sync_minutos: interval });
      } else {
        await base44.entities.MonitorConfig.create({ tipo: 'api_externa', intervalo_sync_minutos: interval, ativo: true });
      }
      toast.success('Intervalo de sincronização atualizado!');
      refetchMonitorConfig();
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSavingInterval(false);
    }
  };

  const copyToClipboard = (value, label) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado!`);
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    try {
      // Testar a API Key diretamente chamando agentGetTerminals com a key no payload
      const res = await base44.functions.invoke('testApiKey', { api_key: currentUser?.api_key });
      const data = res.data;
      if (data?.success) {
        setTestResult({ ok: true, msg: `API Key válida — ${data.terminals ?? 0} terminal(is) associado(s)` });
      } else {
        setTestResult({ ok: false, msg: data?.error || 'API Key inválida ou sem terminais' });
      }
    } catch (e) {
      setTestResult({ ok: false, msg: e.message || 'Erro de ligação' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleGenerateApiKey = async () => {
    setGeneratingKey(true);
    try {
      const res = await base44.functions.invoke('generateUserApiKey', {});
      const newApiKey = res.data?.api_key;
      if (newApiKey) {
        // Usar a api_key retornada directamente pela função (mais fiável)
        setCurrentUser(prev => ({ ...prev, api_key: newApiKey }));
        setShowApiKey(true);
        toast.success('Nova API Key gerada! Copie e configure no seu agente.');
      }
    } catch (e) {
      toast.error('Erro ao gerar API Key');
    } finally {
      setGeneratingKey(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 w-full overflow-x-hidden">
      <div className="w-full px-3 sm:px-6 py-4 sm:py-6 space-y-6 max-w-4xl">
        <div className="flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-slate-900 rounded-xl shrink-0">
              <Settings className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Configurações</h1>
              <p className="text-xs sm:text-sm text-slate-500">Agente Local e configurações do sistema</p>
            </div>
          </div>



        {/* Local Agent Setup */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-600" />
                Agente Local (Base44 Agent)
              </CardTitle>
              <CardDescription>
                Instale o agente no Windows para monitorar terminais na sua rede local. Ele verifica cada terminal e envia o status automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Como funciona */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
                <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                  <Info className="h-4 w-4" /> Como funciona
                </p>
                <ul className="text-sm text-emerald-700 space-y-1 list-disc list-inside">
                  <li>O agente roda como serviço Windows (via NSSM)</li>
                  <li>A cada 30 segundos, busca os terminais cadastrados aqui via API</li>
                  <li>Testa HTTP ou TCP para cada terminal na rede local</li>
                  <li>Atualiza status, latência e último ping automaticamente</li>
                </ul>
              </div>

              {/* Credenciais */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Key className="h-4 w-4" /> Credenciais do Agente
                </p>

                {/* Documentação de segurança */}
                <div className="space-y-2">
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-2">
                    <p className="font-semibold flex items-center gap-1.5">🔐 Como funciona a autenticação</p>
                    <ul className="space-y-1 list-disc list-inside leading-relaxed">
                      <li>Cada utilizador tem uma <strong>API Key pessoal única</strong>, gerada aleatoriamente.</li>
                      <li>A chave é enviada pelo agente no header <code className="bg-blue-100 px-1 rounded font-mono">X-Api-Key</code> em cada pedido.</li>
                      <li>O servidor valida a chave e identifica o utilizador — o agente <strong>só acede aos seus próprios terminais</strong>.</li>
                      <li>Não é possível ler ou reportar terminais de outros utilizadores com uma chave diferente.</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">⚠️ Boas práticas de segurança</p>
                    <ul className="space-y-1 list-disc list-inside leading-relaxed">
                      <li>Guarde a API Key apenas no ficheiro <code className="bg-amber-100 px-1 rounded font-mono">config.json</code> local do agente — nunca em código fonte.</li>
                      <li>Se suspeitar de comprometimento, use "Regenerar API Key" imediatamente (a anterior fica inválida).</li>
                      <li>O servidor corre sobre HTTPS — a chave é sempre transmitida de forma encriptada.</li>
                    </ul>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {/* API Key pessoal */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500 flex items-center justify-between">
                      <span>SUA API KEY PESSOAL</span>
                      {currentUser?.api_key && (
                        <button onClick={() => setShowApiKey(v => !v)} className="text-slate-400 hover:text-slate-600 flex items-center gap-1">
                          {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {showApiKey ? 'Ocultar' : 'Mostrar'}
                        </button>
                      )}
                    </Label>
                    {currentUser?.api_key ? (
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={showApiKey ? currentUser.api_key : '•'.repeat(20)}
                          className="bg-slate-50 text-xs font-mono min-w-0"
                        />
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(currentUser.api_key, 'API Key')} className="shrink-0">
                          <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">Nenhuma API Key gerada ainda. Clique em "Gerar" abaixo.</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateApiKey}
                        disabled={generatingKey}
                        className="gap-2 text-xs"
                      >
                        <RefreshCw className={`h-3 w-3 ${generatingKey ? 'animate-spin' : ''}`} />
                        {currentUser?.api_key ? 'Regenerar API Key' : 'Gerar API Key'}
                      </Button>
                      {currentUser?.api_key && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleTestConnection}
                          disabled={testingConn}
                          className="gap-2 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          <Plug className={`h-3 w-3 ${testingConn ? 'animate-pulse' : ''}`} />
                          {testingConn ? 'A testar...' : 'Testar Ligação'}
                        </Button>
                      )}
                    </div>
                    {testResult && (
                      <div className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        {testResult.ok ? <CheckCircle className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                        {testResult.msg}
                      </div>
                    )}
                    {currentUser?.api_key && (
                      <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                        ⚠️ Ao regenerar, o agente atual deixa de funcionar até ser reconfigurado com a nova key.
                      </p>
                    )}
                  </div>

                  {/* APP ID */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">APP ID (partilhado por todos)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={APP_ID} className="bg-slate-50 text-xs font-mono min-w-0" />
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(APP_ID, 'APP ID')} className="shrink-0">
                        <Copy className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Endpoint — Obter Terminais</Label>
                    <div className="flex gap-2">
                      <Input readOnly value="/api/functions/agentGetTerminals" className="bg-slate-50 text-xs font-mono min-w-0 truncate" />
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard('/api/functions/agentGetTerminals', 'Endpoint')} className="shrink-0"><Copy className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500">Endpoint — Reportar Status</Label>
                    <div className="flex gap-2">
                      <Input readOnly value="/api/functions/agentReport" className="bg-slate-50 text-xs font-mono min-w-0 truncate" />
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard('/api/functions/agentReport', 'Endpoint')} className="shrink-0"><Copy className="h-3 w-3 sm:h-4 sm:w-4" /></Button>
                    </div>
                  </div>
                </div>
              </div>


            </CardContent>
          </Card>
        </motion.div>

        {/* ADMS Server */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-600" />
                Servidor ADMS (ZKTeco / Anviz)
              </CardTitle>
              <CardDescription>
                Servidor que recebe os push HTTP dos terminais ZKTeco e Anviz (protocolo iClock/ADMS) e reporta o status ao NOC Monitor.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdmsServerCode />
            </CardContent>
          </Card>
        </motion.div>

        {/* Telegram Notifications */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <TelegramConfig />
        </motion.div>

        {/* Intervalo de Sincronização — admin only */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-blue-600" />
                  Intervalo de Sincronização
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-500">Frequência de atualização dos dados em Dashboard, Terminais e Modo TV.</p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(e.target.value)}
                    className="flex h-9 w-[120px] rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm"
                  />
                  <span className="text-sm text-slate-500">minuto(s)</span>
                  <button onClick={handleSaveInterval} disabled={savingInterval} className="inline-flex items-center gap-2 h-9 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                    <Save className="h-4 w-4" />
                    {savingInterval ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* NOC Server — admin only */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-violet-600" />
                  NOC Server — Windows Server (51.91.219.145)
                </CardTitle>
                <p className="text-sm text-slate-500">Servidor unificado para terminais: Heartbeat TCP, ADMS/Push (ZKTeco, Anviz) e SDK-TCP.</p>
              </CardHeader>
              <CardContent>
                <NocServerCode />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* P2S Server — admin only */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-violet-200/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-violet-600" />
                  P2S Server — Push to Server (Windows Server)
                </CardTitle>
                <p className="text-sm text-slate-500">Serviço dedicado para terminais P2S: ZKTeco, Anviz, Suprema, Hikvision, Dahua, Nitgen.</p>
              </CardHeader>
              <CardContent>
                <P2sServerCode />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Timmy WS Server — admin only */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-violet-200/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5 text-violet-600" />
                  Timmy WebSocket Cloud Server
                </CardTitle>
                <p className="text-sm text-slate-500">Servidor WebSocket para terminais Timmy/THbio: TM-AI07F, TM-AIFace11F, TFS30, TFS50 e outros.</p>
              </CardHeader>
              <CardContent>
                <TimmyWsServerCode />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Agent Installation Guide — admin only */}
        {isAdmin && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-emerald-600" />
                  Instalação do Agente Local
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <div>
                      <p className="font-medium text-slate-700">Baixe o NSSM (gerenciador de serviços Windows)</p>
                      <a href="https://nssm.cc/download" target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs">nssm.cc/download</a>
                      <p className="text-xs text-slate-500 mt-1">Extraia e copie <code className="bg-slate-100 px-1 rounded">nssm.exe</code> para <code className="bg-slate-100 px-1 rounded">C:\Program Files\Base44Agent\</code></p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <div>
                      <p className="font-medium text-slate-700">Copie o código fonte para <code className="bg-slate-100 px-1 rounded">C:\Program Files\Base44Agent\core_agent.py</code></p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <div>
                      <p className="font-medium text-slate-700">Crie o ficheiro de configuração:</p>
                      <pre className="bg-slate-900 text-emerald-400 p-2 rounded text-xs mt-1 overflow-x-auto whitespace-pre-wrap">{`{\n  "API_KEY": "SUA_API_KEY",\n  "APP_ID": "697aa46c9998c30665e2e19a"\n}`}</pre>
                      <p className="text-xs text-slate-500 mt-1">Guarde em <code className="bg-slate-100 px-1 rounded">C:\ProgramData\Base44Agent\config.json</code></p>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold shrink-0">4</span>
                    <div>
                      <p className="font-medium text-slate-700">Instale como serviço Windows:</p>
                      <pre className="bg-slate-900 text-emerald-400 p-1.5 rounded text-xs mt-1 overflow-x-auto whitespace-pre-wrap">{`nssm install Base44Agent python "C:\\Program Files\\Base44Agent\\core_agent.py"\nnssm start Base44Agent`}</pre>
                    </div>
                  </div>
                </div>
                <AgentSourceCode />
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Delete Account — todos os utilizadores */}
        {currentUser && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="bg-white/80 backdrop-blur-sm border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Zona de Perigo
                </CardTitle>
                <CardDescription>
                  Estas ações são irreversíveis. Proceda com cautela.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-red-200 rounded-lg bg-red-50">
                  <div>
                    <p className="font-medium text-slate-900">Excluir Conta</p>
                    <p className="text-xs sm:text-sm text-slate-500">Remove permanentemente todos os dados e configurações.</p>
                  </div>
                  <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="select-none shrink-0 w-full sm:w-auto">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir Conta
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                          <AlertTriangle className="h-5 w-5" />
                          Confirmar Exclusão de Conta
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação é <strong>permanente e irreversível</strong>. Todos os terminais, histórico e configurações serão excluídos. Tem certeza?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="select-none">Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700 select-none"
                          onClick={() => {
                            toast.error('Funcionalidade disponível apenas via suporte. Contacte o administrador.');
                            setDeleteConfirmOpen(false);
                          }}
                        >
                          Sim, Excluir Tudo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}