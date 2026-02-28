#!/usr/bin/env python3
"""
Monitor Local de Terminais - NOC Monitor Base44
Roda na rede local e reporta o status dos terminais para o Base44.
"""

import socket
import time
import requests
from datetime import datetime
from typing import Optional

# ==================== CONFIGURAÇÃO ====================
APP_ID = "697aa46c9998c30665e2e19a"
MONITOR_API_KEY = "!Uolcor20"  # Substitua pelo valor do secret API_KEY no Base44

# URLs das funções backend
APP_NAME = "terminais"  # ex: "noc-monitor"
BASE_URL = f"https://app--{APP_NAME}.base44.app/api/apps/{APP_ID}/functions"
GET_TERMINALS_URL = f"{BASE_URL}/getLocalTerminals"
UPDATE_STATUS_URL = f"{BASE_URL}/updateTerminalStatus"

# Intervalo entre ciclos completos (segundos)
CHECK_INTERVAL = 30

# Timeout TCP padrão (segundos)
SOCKET_TIMEOUT = 5
# ======================================================

HEADERS = {
    "Content-Type": "application/json",
    "X-Monitor-API-Key": MONITOR_API_KEY
}


def test_tcp_connection(host: str, port: int, timeout: int = SOCKET_TIMEOUT):
    """
    Testa conexão TCP com host:porta.
    Retorna: (sucesso, latencia_ms, erro)
    """
    start = time.time()
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        latencia = int((time.time() - start) * 1000)
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


def get_local_terminals():
    """Busca no Base44 os terminais do tipo ip_local que estão ativos."""
    try:
        response = requests.post(GET_TERMINALS_URL, headers=HEADERS, json={}, timeout=15)
        if response.status_code == 200:
            return response.json().get("terminals", [])
        else:
            print(f"  ❌ Erro ao buscar terminais: HTTP {response.status_code} - {response.text}")
            return []
    except Exception as e:
        print(f"  ❌ Erro ao buscar terminais: {e}")
        return []


def update_terminal_status(terminal_id: str, status: str, latencia: Optional[int] = None, error_msg: Optional[str] = None):
    """Envia o status do terminal para o Base44."""
    payload = {
        "terminalId": terminal_id,
        "status": status,
        "latencia": latencia,
        "errorMsg": error_msg
    }
    try:
        response = requests.post(UPDATE_STATUS_URL, headers=HEADERS, json=payload, timeout=15)
        return response.status_code == 200
    except Exception as e:
        print(f"  ❌ Erro ao enviar status: {e}")
        return False


def monitor_terminal(terminal: dict):
    """Monitora um terminal e envia o resultado para o Base44."""
    nome    = terminal.get("nome", "Desconhecido")
    ip      = terminal.get("ip_local")
    porta   = terminal.get("porta", 5005)
    timeout = terminal.get("timeout_segundos", SOCKET_TIMEOUT)

    if not terminal.get("monitoramento_ativo", True):
        print(f"  ⏸  {nome}: monitoramento desativado, pulando")
        return

    if not ip:
        print(f"  ⚠️  {nome}: IP local não configurado")
        return

    sucesso, latencia, erro = test_tcp_connection(ip, porta, timeout)
    status = "online" if sucesso else "offline"

    ok = update_terminal_status(terminal["id"], status, latencia, erro)
    if ok:
        if sucesso:
            print(f"  ✅ {nome} ({ip}:{porta}): ONLINE - {latencia}ms")
        else:
            print(f"  ❌ {nome} ({ip}:{porta}): OFFLINE - {erro}")
    else:
        print(f"  ⚠️  {nome}: falha ao enviar status para o Base44")


def main():
    print("=" * 60)
    print("🚀 Monitor Local - NOC Monitor Base44")
    print("=" * 60)
    print(f"  App ID   : {APP_ID}")
    print(f"  Intervalo: {CHECK_INTERVAL}s")
    print(f"  Timeout  : {SOCKET_TIMEOUT}s")
    print("=" * 60)

    if MONITOR_API_KEY == "SUA_CHAVE_AQUI":
        print("\n❌ ERRO: Configure a MONITOR_API_KEY no script!")
        print("   Acesse: Base44 Dashboard → Settings → Secrets → API_KEY")
        return

    ciclo = 0
    while True:
        ciclo += 1
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n📡 Ciclo #{ciclo} - {ts}")
        print("-" * 60)

        terminals = get_local_terminals()

        if not terminals:
            print("  ⚠️  Nenhum terminal ip_local ativo encontrado.")
        else:
            print(f"  📋 {len(terminals)} terminal(is) encontrado(s)\n")
            for t in terminals:
                monitor_terminal(t)

        print(f"\n  ⏳ Aguardando {CHECK_INTERVAL}s...")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Monitor encerrado pelo usuário.")
    except Exception as e:
        print(f"\n\n❌ Erro fatal: {e}")