import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  AlertTriangle,
  Search,
  Target,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TestMonitor() {
  const [activeTab, setActiveTab] = useState('monitor');
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Network Scanner
  const [scanConfig, setScanConfig] = useState({
    baseIp: '192.168.1',
    startHost: 1,
    endHost: 254,
    port: 5005,
    timeout: 3000
  });
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);

  // Ping Test
  const [pingConfig, setPingConfig] = useState({
    host: '',
    port: 5005,
    count: 4,
    timeout: 3000
  });
  const [pingResults, setPingResults] = useState(null);
  const [pinging, setPinging] = useState(false);

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-test'],
    queryFn: () => base44.entities.Terminal.filter({ ativo: true }),
  });

  // Test terminal connection directly from browser (for local network access)
  const testTerminalLocal = async (terminal) => {
    let host = '';
    let port = terminal.porta || 5005;
    
    switch (terminal.tipo_conexao) {
      case 'ip_local':
        host = terminal.ip_local;
        break;
      case 'ip_publico':
        host = terminal.ip_publico;
        break;
      case 'dns':
        host = terminal.dns;
        break;
      case 'p2s':
        host = terminal.ip_local;
        break;
      case 'api':
        host = terminal.api_endpoint;
        break;
    }

    if (!host) {
      return {
        success: false,
        status: 'offline',
        error: 'Host não configurado'
      };
    }

    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const url = terminal.tipo_conexao === 'api' ? host : `http://${host}:${port}`;
      
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors', // Permite requisições para IPs locais
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Com no-cors, qualquer resposta (mesmo opaque) significa que está online
      return {
        success: true,
        status: 'online',
        latencia: Date.now() - startTime,
        host: terminal.tipo_conexao === 'api' ? host : `${host}:${port}`
      };
      
    } catch (error) {
      return {
        success: false,
        status: 'offline',
        error: error.message,
        host: terminal.tipo_conexao === 'api' ? host : `${host}:${port}`
      };
    }
  };

  // Monitor All Terminals
  const testAllTerminals = async () => {
    setTesting(true);
    setTestResults([]);
    setProgress(0);

    const results = [];
    const total = terminals.length;

    for (let i = 0; i < terminals.length; i++) {
      const terminal = terminals[i];
      
      const result = await testTerminalLocal(terminal);
      
      results.push({
        terminal: terminal.nome,
        tipo: terminal.tipo_conexao,
        success: result.success,
        status: result.status,
        latencia: result.latencia,
        error: result.error,
        host: result.host
      });

      setProgress(Math.round(((i + 1) / total) * 100));
      setTestResults([...results]);
    }

    setTesting(false);
    toast.success('Teste concluído');
  };

  // Network Scanner (runs in browser for local network access)
  const startScan = async () => {
    setScanning(true);
    setScanResults(null);

    const results = [];
    const ipBase = scanConfig.baseIp.substring(0, scanConfig.baseIp.lastIndexOf('.'));
    const total = scanConfig.endHost - scanConfig.startHost + 1;
    let found = 0;

    toast.info(`Escaneando ${total} hosts na rede local...`);

    for (let i = scanConfig.startHost; i <= scanConfig.endHost; i++) {
      const host = `${ipBase}.${i}`;
      const startTime = Date.now();
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), scanConfig.timeout);
        
        await fetch(`http://${host}:${scanConfig.port}`, {
          method: 'GET',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Se não deu timeout/erro, o host respondeu
        results.push({
          host,
          port: scanConfig.port,
          status: 'online',
          latencia: Date.now() - startTime
        });
        found++;
        
      } catch (error) {
        // Host offline ou não respondeu
      }
    }

    setScanResults({
      success: true,
      scanned: total,
      found,
      results
    });
    
    toast.success(`Scan concluído: ${found} dispositivos encontrados`);
    setScanning(false);
  };

  // Ping Test (runs in browser for local network access)
  const startPing = async () => {
    setPinging(true);
    setPingResults(null);

    const results = [];
    const latencias = [];

    for (let i = 0; i < pingConfig.count; i++) {
      const startTime = Date.now();
      let success = false;
      let latencia = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), pingConfig.timeout);
        
        await fetch(`http://${pingConfig.host}:${pingConfig.port}`, {
          method: 'GET',
          mode: 'no-cors',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        success = true;
        latencia = Date.now() - startTime;
        latencias.push(latencia);
        
      } catch (error) {
        success = false;
      }

      results.push({
        attempt: i + 1,
        success,
        latencia,
        timestamp: new Date().toISOString()
      });

      // Aguardar 1 segundo entre pings
      if (i < pingConfig.count - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successful = results.filter(r => r.success).length;
    
    const stats = {
      sent: pingConfig.count,
      received: successful,
      lost: pingConfig.count - successful,
      lossPercent: ((pingConfig.count - successful) / pingConfig.count) * 100,
      minLatency: latencias.length > 0 ? Math.min(...latencias) : null,
      maxLatency: latencias.length > 0 ? Math.max(...latencias) : null,
      avgLatency: latencias.length > 0 ? latencias.reduce((a, b) => a + b, 0) / latencias.length : null
    };

    setPingResults({
      success: true,
      host: pingConfig.host,
      port: pingConfig.port,
      stats,
      results
    });
    
    toast.success('Ping test concluído');
    setPinging(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Diagnóstico Avançado</h1>
              <p className="text-sm text-slate-500">Ferramentas completas de teste e monitoramento</p>
            </div>
          </div>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
            <Wifi className="h-3 w-3 mr-1" />
            Acesso à Rede Local
          </Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-white shadow-sm">
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Monitorar Terminais
            </TabsTrigger>
            <TabsTrigger value="scan" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Scanner de Rede
            </TabsTrigger>
            <TabsTrigger value="ping" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Teste de Latência
            </TabsTrigger>
          </TabsList>

          {/* Monitor Terminals */}
          <TabsContent value="monitor" className="space-y-6">
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle>Verificar Todos os Terminais</CardTitle>
                <CardDescription>
                  Testa conectividade de {terminals.length} terminais cadastrados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={testAllTerminals}
                  disabled={testing || terminals.length === 0}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className={cn("h-4 w-4 mr-2", testing && "animate-pulse")} />
                  {testing ? 'Testando...' : 'Iniciar Teste'}
                </Button>
              </CardContent>
            </Card>

            {/* Progress */}
            {testing && (
              <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
                <CardContent className="p-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Progresso</span>
                      <span className="font-semibold text-slate-900">{progress}%</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats */}
            {testResults.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white/80 backdrop-blur-sm">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-slate-500">Total</p>
                    <p className="text-2xl font-bold text-slate-900">{testResults.length}</p>
                  </CardContent>
                </Card>
                <Card className="bg-emerald-50/80 backdrop-blur-sm border-emerald-200/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-emerald-600">Online</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {testResults.filter(r => r.status === 'online').length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50/80 backdrop-blur-sm border-red-200/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-red-600">Offline</p>
                    <p className="text-2xl font-bold text-red-600">
                      {testResults.filter(r => r.status === 'offline').length}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-blue-50/80 backdrop-blur-sm border-blue-200/50">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-blue-600">Latência Média</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round(
                        testResults.filter(r => r.latencia).reduce((acc, r) => acc + r.latencia, 0) / 
                        testResults.filter(r => r.latencia).length || 0
                      )}ms
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Results */}
            {testResults.length > 0 && (
              <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
                <CardHeader>
                  <CardTitle>Resultados</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {testResults.map((result, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-lg border",
                          result.status === 'online' 
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-red-50 border-red-200"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {result.status === 'online' ? (
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
                          )}
                          <div>
                            <p className="font-semibold text-slate-900">{result.terminal}</p>
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Badge variant="outline" className="text-xs">
                                {result.tipo}
                              </Badge>
                              <span>{result.host}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {result.latencia && (
                            <Badge variant="outline">
                              <Clock className="h-3 w-3 mr-1" />
                              {result.latencia}ms
                            </Badge>
                          )}
                          <Badge 
                            variant="outline"
                            className={cn(
                              result.status === 'online'
                                ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                                : "border-red-300 text-red-700 bg-red-50"
                            )}
                          >
                            {result.status}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Network Scanner */}
          <TabsContent value="scan" className="space-y-6">
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle>Scanner de Rede</CardTitle>
                <CardDescription>
                  Detecta dispositivos ativos na rede por range de IPs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Base IP (ex: 192.168.1)</Label>
                    <Input
                      value={scanConfig.baseIp}
                      onChange={(e) => setScanConfig({...scanConfig, baseIp: e.target.value})}
                      placeholder="192.168.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta</Label>
                    <Input
                      type="number"
                      value={scanConfig.port}
                      onChange={(e) => setScanConfig({...scanConfig, port: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Host Inicial</Label>
                    <Input
                      type="number"
                      min="1"
                      max="254"
                      value={scanConfig.startHost}
                      onChange={(e) => setScanConfig({...scanConfig, startHost: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Host Final</Label>
                    <Input
                      type="number"
                      min="1"
                      max="254"
                      value={scanConfig.endHost}
                      onChange={(e) => setScanConfig({...scanConfig, endHost: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Timeout (ms)</Label>
                  <Input
                    type="number"
                    value={scanConfig.timeout}
                    onChange={(e) => setScanConfig({...scanConfig, timeout: parseInt(e.target.value)})}
                  />
                </div>

                <Button
                  onClick={startScan}
                  disabled={scanning}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Search className={cn("h-4 w-4 mr-2", scanning && "animate-pulse")} />
                  {scanning ? 'Escaneando...' : 'Iniciar Scan'}
                </Button>
              </CardContent>
            </Card>

            {scanResults && (
              <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
                <CardHeader>
                  <CardTitle>Dispositivos Encontrados: {scanResults.found}</CardTitle>
                  <CardDescription>
                    Escaneados {scanResults.scanned} hosts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {scanResults.results.map((result, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200"
                      >
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4 text-emerald-600" />
                          <span className="font-mono font-semibold text-slate-900">
                            {result.host}:{result.port}
                          </span>
                        </div>
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          {result.latencia}ms
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Ping Test */}
          <TabsContent value="ping" className="space-y-6">
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardHeader>
                <CardTitle>Teste de Latência (Ping)</CardTitle>
                <CardDescription>
                  Análise detalhada de tempo de resposta e estabilidade
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Host/IP</Label>
                    <Input
                      value={pingConfig.host}
                      onChange={(e) => setPingConfig({...pingConfig, host: e.target.value})}
                      placeholder="192.168.1.100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta</Label>
                    <Input
                      type="number"
                      value={pingConfig.port}
                      onChange={(e) => setPingConfig({...pingConfig, port: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Quantidade de Pings</Label>
                    <Input
                      type="number"
                      min="1"
                      max="20"
                      value={pingConfig.count}
                      onChange={(e) => setPingConfig({...pingConfig, count: parseInt(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Timeout (ms)</Label>
                    <Input
                      type="number"
                      value={pingConfig.timeout}
                      onChange={(e) => setPingConfig({...pingConfig, timeout: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <Button
                  onClick={startPing}
                  disabled={pinging || !pingConfig.host}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  <Zap className={cn("h-4 w-4 mr-2", pinging && "animate-pulse")} />
                  {pinging ? 'Testando...' : 'Executar Ping Test'}
                </Button>
              </CardContent>
            </Card>

            {pingResults && (
              <>
                <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
                  <CardHeader>
                    <CardTitle>Estatísticas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-slate-500">Enviados</p>
                        <p className="text-2xl font-bold text-slate-900">{pingResults.stats.sent}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-slate-500">Recebidos</p>
                        <p className="text-2xl font-bold text-emerald-600">{pingResults.stats.received}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-slate-500">Perda</p>
                        <p className="text-2xl font-bold text-red-600">{pingResults.stats.lossPercent.toFixed(0)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-slate-500">Latência Média</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {pingResults.stats.avgLatency ? pingResults.stats.avgLatency.toFixed(0) : 0}ms
                        </p>
                      </div>
                    </div>
                    
                    {pingResults.stats.minLatency && (
                      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                        <p className="text-slate-600">
                          Min: <span className="font-semibold">{pingResults.stats.minLatency}ms</span> | 
                          Max: <span className="font-semibold">{pingResults.stats.maxLatency}ms</span> | 
                          Avg: <span className="font-semibold">{pingResults.stats.avgLatency.toFixed(0)}ms</span>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
                  <CardHeader>
                    <CardTitle>Tentativas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {pingResults.results.map((result, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border",
                            result.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <CheckCircle className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm font-medium text-slate-900">
                              Ping #{result.attempt}
                            </span>
                          </div>
                          {result.success && (
                            <Badge variant="outline">
                              {result.latencia}ms
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}