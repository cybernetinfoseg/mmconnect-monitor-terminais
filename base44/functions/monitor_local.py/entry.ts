#!/usr/bin/env python3
"""
Script de Monitoramento Local de Terminais
Roda na rede local e atualiza status no Base44
"""

import socket
import time
import json
import requests
from datetime import datetime
from typing import Dict, List, Optional

# ==================== CONFIGURAÇÃO ====================
BASE44_API_URL = "https://api.base44.com/v1"
APP_ID = "697aa46c9998c30665e2e19a"  # Seu App ID
MONITOR_API_KEY = "SUA_CHAVE_AQUI"  # Substitua pela chave do secret MONITOR_API_KEY

# URL da função updateTerminalStatus
UPDATE_STATUS_URL = f"https://app.base44.com/api/apps/{APP_ID}/functions/updateTerminalStatus/invoke"

# Intervalo de verificação (segundos)
CHECK_INTERVAL = 30

# Timeout para teste TCP (segundos)
SOCKET_TIMEOUT = 5
# ======================================================


def test_tcp_connection(host: str, port: int, timeout: int = SOCKET_TIMEOUT) -> tuple[bool, Optional[int], Optional[str]]:
    """
    Testa conexão TCP com um host:porta
    Retorna: (sucesso, latencia_ms, erro)
    """
    start_time = time.time()
    
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        
        latencia = int((time.time() - start_time) * 1000)
        
        if result == 0:
            return True, latencia, None
        else:
            return False, None, f"Porta {port} fechada ou inacessível"
            
    except socket.timeout:
        return False, None, f"Timeout após {timeout}s"
    except socket.gaierror:
        return False, None, "Erro DNS - host não encontrado"
    except Exception as e:
        return False, None, str(e)


def get_local_terminals() -> List[Dict]:
    """
    Busca terminais com tipo_conexao = 'ip_local' do Base44
    """
    try:
        url = f"{BASE44_API_URL}/apps/{APP_ID}/entities/Terminal/records"
        headers = {
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            url,
            headers=headers,
            json={
                "operation": "list",
                "params": {
                    "filter": {"tipo_conexao": "ip_local", "ativo": True},
                    "limit": 1000
                }
            }
        )
        
        if response.status_code == 200:
            data = response.json()
            return data.get('records', [])
        else:
            print(f"❌ Erro ao buscar terminais: {response.status_code} - {response.text}")
            return []
            
    except Exception as e:
        print(f"❌ Erro ao buscar terminais: {e}")
        return []


def update_terminal_status(terminal_id: str, status: str, latencia: Optional[int] = None, error_msg: Optional[str] = None):
    """
    Envia atualização de status para Base44
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "X-Monitor-API-Key": MONITOR_API_KEY
        }
        
        payload = {
            "terminalId": terminal_id,
            "status": status,
            "latencia": latencia,
            "errorMsg": error_msg
        }
        
        response = requests.post(UPDATE_STATUS_URL, headers=headers, json=payload)
        
        if response.status_code == 200:
            return True
        else:
            print(f"❌ Erro ao atualizar {terminal_id}: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Erro ao enviar status: {e}")
        return False


def monitor_terminal(terminal: Dict):
    """
    Monitora um terminal específico
    """
    terminal_id = terminal['id']
    nome = terminal.get('nome', 'Desconhecido')
    ip = terminal.get('ip_local')
    porta = terminal.get('porta', 5005)
    
    if not ip:
        print(f"⚠️  {nome}: IP local não configurado")
        return
    
    # Testar conexão TCP
    sucesso, latencia, erro = test_tcp_connection(ip, porta)
    
    status = 'online' if sucesso else 'offline'
    
    # Enviar para Base44
    if update_terminal_status(terminal_id, status, latencia, erro):
        if sucesso:
            print(f"✅ {nome} ({ip}:{porta}): ONLINE - {latencia}ms")
        else:
            print(f"❌ {nome} ({ip}:{porta}): OFFLINE - {erro}")


def main():
    """
    Loop principal de monitoramento
    """
    print("=" * 60)
    print("🚀 Monitor Local de Terminais - Base44")
    print("=" * 60)
    print(f"App ID: {APP_ID}")
    print(f"Intervalo: {CHECK_INTERVAL}s")
    print(f"Timeout TCP: {SOCKET_TIMEOUT}s")
    print("=" * 60)
    
    if MONITOR_API_KEY == "SUA_CHAVE_AQUI":
        print("\n❌ ERRO: Configure a MONITOR_API_KEY no código!")
        print("   Encontre a chave em: Dashboard Base44 > Configurações > Secrets")
        return
    
    ciclo = 0
    
    while True:
        ciclo += 1
        print(f"\n📡 Ciclo #{ciclo} - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("-" * 60)
        
        # Buscar terminais locais
        terminals = get_local_terminals()
        
        if not terminals:
            print("⚠️  Nenhum terminal IP local encontrado ou erro na API")
        else:
            print(f"📋 {len(terminals)} terminal(is) IP local encontrado(s)")
            print()
            
            # Monitorar cada terminal
            for terminal in terminals:
                monitor_terminal(terminal)
        
        # Aguardar próximo ciclo
        print(f"\n⏳ Aguardando {CHECK_INTERVAL}s para próximo ciclo...")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Monitor encerrado pelo usuário")
    except Exception as e:
        print(f"\n\n❌ Erro fatal: {e}")