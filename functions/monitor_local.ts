import requests
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