import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Webhook,
  Copy,
  CheckCircle,
  Code,
  Terminal,
  RefreshCw,
  ExternalLink,
  Key,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function WebhookAPI() {
  const [copiedCode, setCopiedCode] = useState(null);

  const { data: terminais = [] } = useQuery({
    queryKey: ['terminais-api'],
    queryFn: () => base44.entities.Terminal.list(),
  });

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const baseUrl = window.location.origin;

  const curlExample = `# Atualizar status de UM terminal
curl -X POST "${baseUrl}/api/webhook/terminal-status" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \\
  -d '{
    "terminal_id": "TERMINAL_ID",
    "status": "online",
    "latencia_ms": 25,
    "timestamp": "2024-01-30T10:00:00Z"
  }'`;

  const curlBulkExample = `# Atualizar status de MÚLTIPLOS terminais
curl -X POST "${baseUrl}/api/webhook/terminal-status/bulk" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \\
  -d '{
    "terminais": [
      {"terminal_id": "ID1", "status": "online", "latencia_ms": 25},
      {"terminal_id": "ID2", "status": "offline"},
      {"terminal_id": "ID3", "status": "online", "latencia_ms": 45}
    ]
  }'`;

  const pythonExample = `import requests
from datetime import datetime

# Configuração
API_URL = "${baseUrl}"
API_TOKEN = "SEU_TOKEN_AQUI"

def atualizar_terminal(terminal_id, status, latencia_ms=None):
    """Atualiza o status de um terminal via API"""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_TOKEN}"
    }
    
    payload = {
        "terminal_id": terminal_id,
        "status": status,  # "online" ou "offline"
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    if latencia_ms is not None:
        payload["latencia_ms"] = latencia_ms
    
    response = requests.post(
        f"{API_URL}/api/webhook/terminal-status",
        json=payload,
        headers=headers
    )
    return response.json()

# Exemplo de uso
result = atualizar_terminal("${terminais[0]?.id || 'TERMINAL_ID'}", "online", 25)
print(result)`;

  const powershellExample = `# PowerShell - Integração com SQL Server e API
$ApiUrl = "${baseUrl}"
$ApiToken = "SEU_TOKEN_AQUI"

# Conexão SQL Server - buscar status dos terminais
$connectionString = "Server=SEU_SERVIDOR;Database=SUA_DATABASE;User Id=usuario;Password=senha;"
$query = @"
SELECT 
    t.terminal_id,
    CASE WHEN DATEDIFF(SECOND, t.ultimo_ping, GETDATE()) < 120 
         THEN 'online' ELSE 'offline' END as status,
    t.latencia_ms
FROM terminais t
WHERE t.ativo = 1
"@

$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
$connection.Open()
$command = New-Object System.Data.SqlClient.SqlCommand($query, $connection)
$reader = $command.ExecuteReader()

$terminais = @()
while ($reader.Read()) {
    $terminais += @{
        terminal_id = $reader["terminal_id"]
        status = $reader["status"]
        latencia_ms = $reader["latencia_ms"]
    }
}
$connection.Close()

# Enviar para API
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $ApiToken"
}

$body = @{ terminais = $terminais } | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "$ApiUrl/api/webhook/terminal-status/bulk" \`
    -Method POST -Headers $headers -Body $body`;

  const csharpExample = `using System;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

public class TerminalMonitor
{
    private readonly HttpClient _client;
    private readonly string _apiUrl = "${baseUrl}";
    private readonly string _apiToken = "SEU_TOKEN_AQUI";

    public TerminalMonitor()
    {
        _client = new HttpClient();
        _client.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiToken}");
    }

    public async Task<bool> AtualizarStatusAsync(string terminalId, string status, int? latenciaMs = null)
    {
        var payload = new
        {
            terminal_id = terminalId,
            status = status,
            latencia_ms = latenciaMs,
            timestamp = DateTime.UtcNow.ToString("o")
        };

        var json = JsonSerializer.Serialize(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _client.PostAsync($"{_apiUrl}/api/webhook/terminal-status", content);
        return response.IsSuccessStatusCode;
    }

    // Integração com ping real
    public async Task MonitorarTerminalAsync(string terminalId, string host, int porta)
    {
        var ping = new System.Net.NetworkInformation.Ping();
        try
        {
            var reply = ping.Send(host, 5000);
            if (reply.Status == System.Net.NetworkInformation.IPStatus.Success)
            {
                await AtualizarStatusAsync(terminalId, "online", (int)reply.RoundtripTime);
            }
            else
            {
                await AtualizarStatusAsync(terminalId, "offline");
            }
        }
        catch
        {
            await AtualizarStatusAsync(terminalId, "offline");
        }
    }
}`;

  const CodeBlock = ({ code, id, language }) => (
    <div className="relative">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-2 right-2 text-slate-400 hover:text-white hover:bg-slate-800"
        onClick={() => copyToClipboard(code, id)}
      >
        {copiedCode === id ? (
          <><CheckCircle className="h-4 w-4 mr-1" />Copiado</>
        ) : (
          <><Copy className="h-4 w-4 mr-1" />Copiar</>
        )}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="p-3 bg-orange-100 rounded-xl">
            <Webhook className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">API Webhook</h1>
            <p className="text-sm text-slate-500">Integre seu sistema de monitoramento com nossa API</p>
          </div>
        </div>

        {/* Alert */}
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-900">Monitoramento via Webhook</AlertTitle>
          <AlertDescription className="text-amber-800">
            Use a API abaixo para enviar atualizações de status dos terminais a partir do seu sistema de monitoramento 
            (Zabbix, PRTG, Nagios, script PowerShell, etc). Seu sistema faz o ping/verificação e envia o resultado para cá.
          </AlertDescription>
        </Alert>

        {/* API Endpoints */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5" />
              Endpoints Disponíveis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-100 text-green-700">POST</Badge>
                  <code className="text-sm font-mono">/api/webhook/terminal-status</code>
                </div>
                <p className="text-sm text-slate-600">Atualiza o status de um único terminal</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-green-100 text-green-700">POST</Badge>
                  <code className="text-sm font-mono">/api/webhook/terminal-status/bulk</code>
                </div>
                <p className="text-sm text-slate-600">Atualiza múltiplos terminais de uma vez</p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Payload esperado:</h4>
              <pre className="text-sm text-blue-800 font-mono">
{`{
  "terminal_id": "string",     // ID do terminal (obrigatório)
  "status": "online|offline",  // Status atual (obrigatório)
  "latencia_ms": number,       // Latência em ms (opcional)
  "timestamp": "ISO8601"       // Data/hora UTC (opcional)
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Terminais List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              IDs dos Terminais Cadastrados
            </CardTitle>
            <CardDescription>Use estes IDs nas chamadas da API</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {terminais.map((terminal) => (
                <div 
                  key={terminal.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                >
                  <div>
                    <p className="font-medium text-slate-900">{terminal.nome}</p>
                    <p className="text-xs text-slate-500">{terminal.cliente_nome}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-slate-200 px-2 py-1 rounded font-mono">
                      {terminal.id.slice(0, 8)}...
                    </code>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(terminal.id, `id-${terminal.id}`)}
                    >
                      {copiedCode === `id-${terminal.id}` ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
              {terminais.length === 0 && (
                <p className="col-span-full text-center text-slate-400 py-8">
                  Nenhum terminal cadastrado
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Code Examples */}
        <Card>
          <CardHeader>
            <CardTitle>Exemplos de Código</CardTitle>
            <CardDescription>Copie e adapte para seu ambiente</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="curl" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="powershell">PowerShell</TabsTrigger>
                <TabsTrigger value="csharp">C#</TabsTrigger>
              </TabsList>

              <TabsContent value="curl" className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Terminal único:</h4>
                  <CodeBlock code={curlExample} id="curl-single" />
                </div>
                <div>
                  <h4 className="font-medium mb-2">Múltiplos terminais (bulk):</h4>
                  <CodeBlock code={curlBulkExample} id="curl-bulk" />
                </div>
              </TabsContent>

              <TabsContent value="python">
                <CodeBlock code={pythonExample} id="python" language="python" />
              </TabsContent>

              <TabsContent value="powershell">
                <div className="mb-4">
                  <Badge className="bg-blue-100 text-blue-700">SQL Server + API</Badge>
                  <p className="text-sm text-slate-600 mt-2">
                    Este script conecta ao SQL Server, busca o status e envia para a API
                  </p>
                </div>
                <CodeBlock code={powershellExample} id="powershell" language="powershell" />
              </TabsContent>

              <TabsContent value="csharp">
                <CodeBlock code={csharpExample} id="csharp" language="csharp" />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Integration Tips */}
        <Card className="bg-slate-900 text-white">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-400" />
              Dicas de Integração
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-amber-400 mb-2">Com Zabbix / PRTG / Nagios:</h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>• Configure um script de saída que chame a API quando o status mudar</li>
                  <li>• Use triggers para enviar "offline" quando o host ficar indisponível</li>
                  <li>• Envie "online" + latência quando o ping for bem-sucedido</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-amber-400 mb-2">Com Windows Task Scheduler:</h4>
                <ul className="text-sm text-slate-300 space-y-1">
                  <li>• Crie uma tarefa agendada que rode o PowerShell a cada 1-5 minutos</li>
                  <li>• O script faz ping nos terminais e envia resultado para API</li>
                  <li>• Use o exemplo PowerShell acima como base</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}