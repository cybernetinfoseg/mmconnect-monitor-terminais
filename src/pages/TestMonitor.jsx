import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Activity, 
  Play,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TestMonitor() {
  const [testResults, setTestResults] = useState([]);
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);

  const { data: terminals = [] } = useQuery({
    queryKey: ['terminals-test'],
    queryFn: () => base44.entities.Terminal.filter({ ativo: true }),
  });

  const testAllTerminals = async () => {
    setTesting(true);
    setTestResults([]);
    setProgress(0);

    const results = [];
    const total = terminals.length;

    for (let i = 0; i < terminals.length; i++) {
      const terminal = terminals[i];
      
      try {
        const response = await base44.functions.invoke('monitorTerminal', {
          terminalId: terminal.id
        });

        results.push({
          terminal: terminal.nome,
          success: response.data.success,
          status: response.data.status,
          latencia: response.data.latencia,
          error: response.data.error,
          host: response.data.host
        });

      } catch (error) {
        results.push({
          terminal: terminal.nome,
          success: false,
          status: 'error',
          error: error.message
        });
      }

      setProgress(Math.round(((i + 1) / total) * 100));
      setTestResults([...results]);
    }

    setTesting(false);
    toast.success('Teste concluído');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Teste de Monitoramento</h1>
              <p className="text-sm text-slate-500">Verificar conectividade de todos os terminais</p>
            </div>
          </div>
          
          <Button
            onClick={testAllTerminals}
            disabled={testing || terminals.length === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Play className={cn("h-4 w-4 mr-2", testing && "animate-pulse")} />
            {testing ? 'Testando...' : 'Iniciar Teste'}
          </Button>
        </div>

        {/* Stats */}
        {testResults.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
              <CardContent className="p-6">
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Total</p>
                    <p className="text-2xl font-bold text-slate-900">{testResults.length}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Online</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      {testResults.filter(r => r.status === 'online').length}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Offline</p>
                    <p className="text-2xl font-bold text-red-600">
                      {testResults.filter(r => r.status === 'offline').length}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-slate-500">Taxa Sucesso</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round((testResults.filter(r => r.status === 'online').length / testResults.length) * 100)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Progress */}
        {testing && (
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardContent className="p-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Progresso do teste</span>
                  <span className="font-semibold text-slate-900">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {testResults.length > 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader>
              <CardTitle>Resultados do Teste</CardTitle>
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
                        <p className="text-sm text-slate-500">{result.host}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {result.latencia && (
                        <Badge variant="outline" className="border-slate-300">
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
                        {result.status === 'online' ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {terminals.length === 0 && (
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-slate-400" />
              <p className="text-slate-600">Nenhum terminal ativo encontrado</p>
              <p className="text-sm text-slate-400 mt-2">Cadastre terminais primeiro na página de gestão</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}