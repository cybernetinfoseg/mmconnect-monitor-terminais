import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Terminal, Key, Download, Info, ExternalLink, Shield, Upload, Trash2, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const APP_ID = '697aa46c9998c30665e2e19a';

function CopyField({ label, value }) {
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
        <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-mono text-slate-800 truncate">{value}</div>
        <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </Button>
      </div>
    </div>
  );
}

function AdminReleases() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ version: '', download_url: '', release_notes: '' });

  const { data: releases = [] } = useQuery({
    queryKey: ['agent-releases'],
    queryFn: () => base44.entities.AgentRelease.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AgentRelease.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-releases'] });
      setForm({ version: '', download_url: '', release_notes: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AgentRelease.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-releases'] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, ativo }) => base44.entities.AgentRelease.update(id, { ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-releases'] }),
  });

  return (
    <Card className="border-orange-200 bg-orange-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-5 w-5 text-orange-500" />
          Gerenciar Releases do Agent
          <Badge className="bg-orange-100 text-orange-700 text-xs">Admin</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form nova release */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Versão</label>
            <Input
              placeholder="ex: 1.0.1"
              value={form.version}
              onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
              className="mt-1 font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">URL do .exe</label>
            <Input
              placeholder="https://..."
              value={form.download_url}
              onChange={e => setForm(f => ({ ...f, download_url: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notas da versão (opcional)</label>
            <Input
              placeholder="O que mudou nesta versão..."
              value={form.release_notes}
              onChange={e => setForm(f => ({ ...f, release_notes: e.target.value }))}
              className="mt-1"
            />
          </div>
        </div>
        <Button
          onClick={() => createMutation.mutate({ ...form, ativo: true })}
          disabled={!form.version || !form.download_url || createMutation.isPending}
          className="bg-orange-600 hover:bg-orange-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          Publicar Release
        </Button>

        {/* Lista de releases */}
        {releases.length > 0 && (
          <div className="space-y-2 mt-2">
            {releases.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <Tag className="h-4 w-4 text-slate-400" />
                  <span className="font-mono font-semibold text-slate-800">v{r.version}</span>
                  {r.release_notes && <span className="text-sm text-slate-500">{r.release_notes}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ id: r.id, ativo: !r.ativo })}
                    className={r.ativo ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-500'}
                  >
                    {r.ativo ? '✓ Ativa' : 'Inativa'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(r.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentConfig() {
  const [user, setUser] = React.useState(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const scriptContent = `# agent.py — Base44 Monitoring Agent
import requests
import socket
import time
import json
import os
from datetime import datetime, timezone
from updater import check_update

CONFIG_DIR = os.path.join(os.environ["PROGRAMDATA"], "Base44Agent")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
INTERVALO = 30
TIMEOUT = 3

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

def listar_terminais(base_url, api_key):
    r = requests.get(base_url, headers={"api_key": api_key}, timeout=10)
    r.raise_for_status()
    return r.json()

def atualizar_terminal(base_url, api_key, entity_id, data):
    requests.put(f"{base_url}/{entity_id}",
        headers={"api_key": api_key, "Content-Type": "application/json"},
        json=data, timeout=10)

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

def executar():
    config = carregar_config() or setup_inicial()
    api_key = config["API_KEY"]
    app_id = config["APP_ID"]
    base_url = f"https://app.base44.com/api/apps/{app_id}/entities/Terminal"

    while True:
        check_update(app_id, api_key)
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

  const handleDownload = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updaterContent = `# updater.py
import os, requests, subprocess, sys, tempfile

VERSION = "1.0.0"
SERVICE_NAME = "Base44Agent"

def get_latest(app_id, api_key):
    try:
        url = f"https://app.base44.com/api/apps/{app_id}/functions/agentVersion/invoke"
        r = requests.post(url, headers={"api_key": api_key}, json={}, timeout=10)
        r.raise_for_status()
        return r.json()
    except:
        return None

def download_file(url):
    try:
        r = requests.get(url, stream=True, timeout=30)
        r.raise_for_status()
        temp_path = os.path.join(tempfile.gettempdir(), "agent_new.exe")
        with open(temp_path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)
        return temp_path
    except:
        return None

def replace_and_restart(new_exe):
    try:
        current_exe = sys.executable
        subprocess.run(["sc", "stop", SERVICE_NAME], capture_output=True)
        subprocess.run(["cmd", "/c", "copy", "/Y", new_exe, current_exe], capture_output=True)
        subprocess.run(["sc", "start", SERVICE_NAME], capture_output=True)
    except:
        pass

def check_update(app_id, api_key=None):
    data = get_latest(app_id, api_key)
    if not data or data.get("version") == VERSION:
        return
    new_file = download_file(data["url"])
    if new_file:
        replace_and_restart(new_file)
`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agent de Monitoramento Local</h1>
          <p className="text-slate-500 mt-1">Configure o agent Windows para monitorar terminais na rede local com atualização automática.</p>
        </div>

        {/* Passo 1 — App ID */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">1</div>
              App ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CopyField label="App ID (mesmo para todos os usuários)" value={APP_ID} />
          </CardContent>
        </Card>

        {/* Passo 2 — API Key */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">2</div>
              API Key pessoal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-800">Cada usuário possui sua própria API Key — o agent acessa <strong>somente os terminais do seu usuário</strong>.</p>
            </div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li className="flex gap-2"><span className="font-bold text-slate-400">1.</span> Acesse <a href="https://app.base44.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-1">app.base44.com <ExternalLink className="h-3 w-3" /></a></li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">2.</span> Clique no seu perfil → <strong>Settings → Account Settings</strong></li>
              <li className="flex gap-2"><span className="font-bold text-slate-400">3.</span> Copie o campo <strong>API Key</strong></li>
            </ol>
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <Key className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800">Trate sua API Key como senha — não compartilhe.</p>
            </div>
          </CardContent>
        </Card>

        {/* Passo 3 — Download */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">3</div>
              Baixe os arquivos do Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleDownload(scriptContent, 'agent.py')} className="bg-slate-900 hover:bg-slate-800">
                <Download className="h-4 w-4 mr-2" /> agent.py
              </Button>
              <Button variant="outline" onClick={() => handleDownload(updaterContent, 'updater.py')}>
                <Download className="h-4 w-4 mr-2" /> updater.py
              </Button>
            </div>

            <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm space-y-1">
              <p className="text-slate-400"># Instalar dependência</p>
              <p className="text-emerald-400">pip install requests</p>
              <p className="text-slate-400 mt-2"># Executar (1ª vez pede API Key e App ID)</p>
              <p className="text-emerald-400">python agent.py</p>
            </div>

            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
              <Terminal className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold mb-1">Instalação como serviço Windows</p>
                <p>Use o <strong>Inno Setup</strong> com o <code className="bg-emerald-100 px-1 rounded">setup.iss</code> para gerar um instalador. O <code className="bg-emerald-100 px-1 rounded">service_install.bat</code> registra o agent como serviço Windows que inicia automaticamente.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Passo 4 — Auto-update */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold">4</div>
              Atualização automática
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
              <Info className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Como funciona</p>
                <p>A cada ciclo, o agent consulta a função <code className="bg-slate-100 px-1 rounded">agentVersion</code> neste app. Se houver uma versão mais nova marcada como <strong>ativa</strong>, ele baixa o novo <code>.exe</code> e reinicia o serviço automaticamente.</p>
                <p className="mt-2">Para publicar uma nova versão, use a seção Admin abaixo.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Admin — somente para admin */}
        {user?.role === 'admin' && <AdminReleases />}

      </div>
    </div>
  );
}