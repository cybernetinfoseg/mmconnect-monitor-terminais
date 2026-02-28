#!/usr/bin/env python3
"""
Monitor Local de Terminais - NOC Monitor Base44
Roda na rede local e reporta o status dos terminais para o Base44.

MELHORIAS ANTI-FLAP:
- Um terminal só é marcado offline após N falhas consecutivas (OFFLINE_THRESHOLD)
- Ao voltar online, reporta imediatamente
- Retries na conexão TCP antes de considerar falha
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
BASE_URL = f"https://app--{APP_ID}.base44.app/api/apps/{APP_ID}/functions"
GET_TERMINALS_URL = f"{BASE_URL}/getLocalTerminals"
UPDATE_STATUS_URL = f"{BASE_URL}/updateTerminalStatus"

# Intervalo entre ciclos completos (segundos)
CHECK_INTERVAL = 30

# Timeout TCP padrão (segundos)
SOCKET_TIMEOUT = 5

# Quantas falhas TCP consecutivas antes de reportar offline
OFFLINE_THRESHOLD = 3

# Quantas tentativas TCP por ciclo antes de considerar falha
TCP_RETRIES = 2

# ======================================================

HEADERS = {
    "Content-Type": "application/json",
    "X-Monitor-API-Key": MONITOR_API_KEY
}

# Estado local de falhas por terminal { terminal_id: contagem_falhas }
falhas_consecutivas = {}


def test_tcp_connection(host: str, port: int, timeout: int = SOCKET_TIMEOUT, retries: int = TCP_RETRIES):
    """
    Testa conexão TCP com host:porta, com múltiplas tentativas.
    Retorna: (sucesso, latencia_ms, erro)
    """
    last_error = None
    for attempt in range(1, retries + 1):
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
                last_error = f"Porta {port} fechada (tentativa {attempt}/{retries})"
        except socket.timeout:
            last_error = f"Timeout após {timeout}s (tentativa {attempt}/{retries})"
        except socket.gaierror:
            return False, None, "Erro DNS - host não encontrado"
        except Exception as e:
            last_error = str(e)

        if attempt < retries:
            time.sleep(1)  # Aguarda 1s entre tentativas

    return False, None, last_error


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
    """
    Monitora um terminal com lógica anti-flap:
    - Online: reporta imediatamente e zera contador
    - Offline: incrementa contador, só reporta após OFFLINE_THRESHOLD falhas seguidas
    """
    nome    = terminal.get("nome", "Desconhecido")
    tid     = terminal.get("id")
    ip      = terminal.get("ip_local")
    porta   = terminal.get("porta", 5005)
    timeout = terminal.get("timeout_segundos", SOCKET_TIMEOUT)

    if not terminal.get("monitoramento_ativo", True):
        print(f"  ⏸  {nome}: monitoramento desativado, pulando")
        return

    if not ip:
        print(f"  ⚠️  {nome}: IP local não configurado")
        return

    sucesso, latencia, erro = test_tcp_connection(ip, porta, timeout, TCP_RETRIES)

    if sucesso:
        # Online: zera contador e reporta imediatamente
        falhas_consecutivas[tid] = 0
        ok = update_terminal_status(tid, "online", latencia, None)
        if ok:
            print(f"  ✅ {nome} ({ip}:{porta}): ONLINE - {latencia}ms")
        else:
            print(f"  ⚠️  {nome}: ONLINE localmente mas falha ao enviar para Base44")
    else:
        # Offline: incrementa e verifica threshold
        falhas_consecutivas[tid] = falhas_consecutivas.get(tid, 0) + 1
        contagem = falhas_consecutivas[tid]

        if contagem >= OFFLINE_THRESHOLD:
            # Confirma offline após N falhas seguidas
            ok = update_terminal_status(tid, "offline", None, erro)
            if ok:
                print(f"  ❌ {nome} ({ip}:{porta}): OFFLINE confirmado após {contagem} falhas - {erro}")
            else:
                print(f"  ⚠️  {nome}: OFFLINE localmente mas falha ao enviar para Base44")
        else:
            # Ainda aguardando confirmação - não altera status no servidor
            print(f"  ⚠️  {nome} ({ip}:{porta}): falha #{contagem}/{OFFLINE_THRESHOLD} - aguardando confirmação ({erro})")


def main():
    print("=" * 60)
    print("🚀 Monitor Local - NOC Monitor Base44")
    print("=" * 60)
    print(f"  App ID        : {APP_ID}")
    print(f"  Intervalo     : {CHECK_INTERVAL}s")
    print(f"  Timeout TCP   : {SOCKET_TIMEOUT}s")
    print(f"  Retries TCP   : {TCP_RETRIES}")
    print(f"  Threshold OFF : {OFFLINE_THRESHOLD} falhas seguidas")
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