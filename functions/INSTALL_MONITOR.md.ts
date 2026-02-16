# 📋 Instalação do Monitor Local de Terminais

## ✅ Pré-requisitos

- Python 3.7 ou superior
- Rede local com acesso aos terminais (192.168.x.x)
- Biblioteca `requests`

## 🔧 Instalação

### 1. Instalar Python (se necessário)

**Windows:**
```bash
# Baixe em: https://www.python.org/downloads/
# Marque "Add Python to PATH" durante instalação
```

**Linux/Mac:**
```bash
# Geralmente já vem instalado
python3 --version
```

### 2. Instalar biblioteca requests

```bash
pip install requests
```

ou

```bash
pip3 install requests
```

### 3. Configurar o Script

1. **Baixe o arquivo:** `monitor_local.py`

2. **Edite a linha 15** com sua chave API:
   ```python
   MONITOR_API_KEY = "sua_chave_do_secret_MONITOR_API_KEY"
   ```
   
   ⚠️ **Encontre a chave em:**
   - Dashboard Base44 → Configurações → Environment Variables (Secrets)
   - Copie o valor de `MONITOR_API_KEY`

3. **(Opcional) Ajuste o intervalo:**
   ```python
   CHECK_INTERVAL = 30  # Segundos entre verificações
   ```

## 🚀 Execução

### Rodar Manualmente (Teste)

```bash
python monitor_local.py
```

ou

```bash
python3 monitor_local.py
```

Você verá:
```
============================================================
🚀 Monitor Local de Terminais - Base44
============================================================
App ID: 697aa46c9998c30665e2e19a
Intervalo: 30s
Timeout TCP: 5s
============================================================

📡 Ciclo #1 - 2026-02-16 18:30:00
------------------------------------------------------------
📋 3 terminal(is) IP local encontrado(s)

✅ BIO-001 (192.168.1.100:5005): ONLINE - 12ms
✅ BIO-002 (192.168.1.101:5005): ONLINE - 8ms
❌ BIO-003 (192.168.1.102:5005): OFFLINE - Timeout após 5s
```

### Rodar Continuamente (Produção)

**Windows - Como Serviço:**
1. Usar NSSM (Non-Sucking Service Manager): https://nssm.cc/
2. `nssm install MonitorTerminais "C:\Python\python.exe" "C:\scripts\monitor_local.py"`

**Linux - Systemd Service:**
```bash
sudo nano /etc/systemd/system/monitor-terminais.service
```

Conteúdo:
```ini
[Unit]
Description=Monitor Local de Terminais Base44
After=network.target

[Service]
Type=simple
User=seu_usuario
WorkingDirectory=/home/seu_usuario/scripts
ExecStart=/usr/bin/python3 /home/seu_usuario/scripts/monitor_local.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Ativar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable monitor-terminais
sudo systemctl start monitor-terminais
sudo systemctl status monitor-terminais
```

**Mac - LaunchAgent:**
Criar arquivo: `~/Library/LaunchAgents/com.base44.monitor.plist`

## 🔍 Verificação

1. Execute o script
2. Vá ao Dashboard Base44 → Terminais
3. Aguarde 30s (ou o intervalo configurado)
4. Verifique se os status dos terminais IP local estão atualizando

## ⚠️ Troubleshooting

### "Erro ao buscar terminais: 401"
- Verifique se a `MONITOR_API_KEY` está correta
- Confirme que copiou exatamente do Dashboard Base44

### "Nenhum terminal IP local encontrado"
- Verifique se há terminais com `tipo_conexao = "ip_local"` e `ativo = true`
- Confirme no Dashboard: Terminais → Tipo de Conexão = "IP Local"

### Terminais sempre OFFLINE
- Verifique se o computador executando o script está na mesma rede
- Teste ping manual: `ping 192.168.1.100`
- Confirme portas corretas (padrão: 5005)

### Firewall bloqueando
- Libere Python no Firewall do Windows
- Linux: `sudo ufw allow out 5005/tcp`

## 📊 Logs

O script imprime logs em tempo real. Para salvar:

```bash
python monitor_local.py > monitor.log 2>&1
```

## 🛑 Parar o Monitor

**Manual:** `Ctrl + C`

**Windows Service:** `nssm stop MonitorTerminais`

**Linux:** `sudo systemctl stop monitor-terminais`

---

💡 **Dica:** Rode o script em um servidor/computador que fique sempre ligado na rede local.