import React, { useState } from 'react';
import { Copy, Check, Terminal, Key, Download, Info, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const APP_ID = '697aa46c9998c30665e2e19a';

function CopyField({ label, value, mono = true }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2">
        <div className={`flex-1 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm ${mono ? 'font-mono' : ''} text-slate-800 truncate`}>
          {value}
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

export default function AgentConfig() {
  const [scriptCopied, setScriptCopied] = useState(false);

  const scriptContent = `import requests
import socket
import time
import json
import os
from datetime import datetime, timezone

CONFIG_DIR = os.path.join(os.environ["PROGRAMDATA"], "Base44Agent")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

INTERVALO = 30
TIMEOUT = 3


# ---------- CONFIG ----------

def garantir_pasta():
    os.makedirs(CONFIG_DIR, exist_ok=True)


def carregar_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return None


def salvar_config(config):
    garantir_pasta()
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def setup_inicial():
    print("=== Configuração do Base44 Agent ===")
    api_key = input("API KEY: ").strip()
    app_id = input("APP ID: ").strip()

    config = {"API_KEY": api_key, "APP_ID": app_id}
    salvar_config(config)
    return config


# ---------- BASE44 ----------

def listar_terminais(base_url, api_key):
    r = requests.get(base_url, headers={"api_key": api_key}, timeout=10)
    r.raise_for_status()
    return r.json()


def atualizar_terminal(base_url, api_key, entity_id, data):
    requests.put(
        f"{base_url}/{entity_id}",
        headers={"api_key": api_key, "Content-Type": "application/json"},
        json=data,
        timeout=10
    )


# ---------- TESTES ----------

def testar_http(host, porta):
    inicio = time.time()
    try:
        requests.get(f"http://{host}:{porta}", timeout=TIMEOUT)
        return True, int((time.time() - inicio) * 1000)
    except:
        return False, None


def testar_tcp(host, porta):
    inicio = time.time()
    try:
        with socket.create_connection((host, int(porta)), timeout=TIMEOUT):
            return True, int((time.time() - inicio) * 1000)
    except:
        return False, None


def escolher_host(t):
    return t.get("ip_local") or t.get("ip_publico") or t.get("dns")


# ---------- LOOP ----------

def executar():
    config = carregar_config() or setup_inicial()

    api_key = config["API_KEY"]
    app_id = config["APP_ID"]

    base_url = f"https://app.base44.com/api/apps/{app_id}/entities/Terminal"

    while True:
        try:
            terminais = listar_terminais(base_url, api_key)

            for t in terminais:
                if not t.get("ativo"):
                    continue

                host = escolher_host(t)
                porta = t.get("porta") or 80

                sucesso, latencia = testar_http(host, porta)
                if not sucesso:
                    sucesso, latencia = testar_tcp(host, porta)

                agora = datetime.now(timezone.utc)

                atualizar_terminal(base_url, api_key, t["id"], {
                    "ultimo_check": agora.isoformat(),
                    "status": "online" if sucesso else "offline",
                    "latencia_ms": latencia,
                    "ultimo_ping": agora.isoformat() if sucesso else t.get("ultimo_ping")
                })

        except Exception:
            pass

        time.sleep(INTERVALO)


if __name__ == "__main__":
    executar()
`;

  const handleDownload = () => {
    const blob = new Blob([scriptContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'monitor_local.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(scriptContent);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent de Monitoramento Local</h1>
          <p className="text-slate-500 mt-1">Configure o script que roda na sua rede local para monitorar terminais com IP privado.</p>
        </div>

        {/* Step 1 - App ID */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">1</div>
              Anote o App ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CopyField label="App ID (igual para todos os usuários)" value={APP_ID} />
          </CardContent>
        </Card>

        {/* Step 2 - API Key */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">2</div>
              Obtenha sua API Key pessoal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Cada usuário tem sua própria API Key</p>
                <p>Ela garante que o script acesse <strong>apenas os seus terminais</strong>, sem interferir nos de outros usuários.</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Como obter sua API Key:</p>
              <ol className="space-y-2 text-sm text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-400 shrink-0">1.</span>
                  Acesse <a href="https://app.base44.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">app.base44.com <ExternalLink className="h-3 w-3" /></a>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-400 shrink-0">2.</span>
                  Clique no seu perfil (canto superior direito)
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-400 shrink-0">3.</span>
                  Vá em <strong>Settings → Account Settings</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-slate-400 shrink-0">4.</span>
                  Copie o campo <strong>API Key</strong>
                </li>
              </ol>
            </div>

            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Key className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800">Trate sua API Key como senha — não compartilhe com outras pessoas.</p>
            </div>
          </CardContent>
        </Card>

        {/* Step 3 - Download Script */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">3</div>
              Baixe e execute o script
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button onClick={handleDownload} className="bg-slate-900 hover:bg-slate-800">
                <Download className="h-4 w-4 mr-2" />
                Baixar monitor_local.py
              </Button>
              <Button variant="outline" onClick={handleCopyScript}>
                {scriptCopied ? <Check className="h-4 w-4 mr-2 text-emerald-500" /> : <Copy className="h-4 w-4 mr-2" />}
                {scriptCopied ? 'Copiado!' : 'Copiar código'}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Para executar:</p>
              <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-1">
                <p className="text-slate-400"># Instalar dependência</p>
                <p className="text-emerald-400">pip install requests</p>
                <p className="text-slate-400 mt-2"># Executar (primeira vez pedirá API Key e App ID)</p>
                <p className="text-emerald-400">python monitor_local.py</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
              <Terminal className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold mb-1">Na primeira execução</p>
                <p>O script vai pedir sua <strong>API Key</strong> e o <strong>App ID</strong>. Após informar, salva automaticamente em <code className="bg-emerald-100 px-1 rounded">%PROGRAMDATA%\Base44Agent\config.json</code> e não pede novamente.</p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}