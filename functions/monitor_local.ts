# core_agent.py — Agente Local NOC Monitor
# Comunicação protegida por X-Api-Key + X-App-Id obrigatórios
import os
import sys
import json
import time
import socket
import signal
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone, timedelta

import requests

PROGRAMDATA = os.environ.get("PROGRAMDATA", r"C:\\ProgramData")
APP_DIR = os.path.join(PROGRAMDATA, "Base44Agent")
CONFIG_FILE = os.path.join(APP_DIR, "config.json")
LOG_FILE = os.path.join(APP_DIR, "agent.log")
LOCK_FILE = os.path.join(APP_DIR, "agent.lock")

DEFAULT_INTERVAL = 30
TIMEOUT = 3
UPDATE_EVERY = timedelta(hours=6)

logger = logging.getLogger("base44agent")


def setup_logging(level=logging.INFO):
    os.makedirs(APP_DIR, exist_ok=True)
    handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S")
    logger.handlers.clear()
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(level)
    if sys.stdout.isatty() or sys.stderr.isatty():
        sh = logging.StreamHandler()
        sh.setFormatter(formatter)
        sh.setLevel(level)
        logger.addHandler(sh)


class SingleInstance:
    def __init__(self, path):
        self.path = path
        self.fp = None

    def acquire(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.fp = open(self.path, "a+")
        try:
            import msvcrt
            msvcrt.locking(self.fp.fileno(), msvcrt.LK_NBLCK, 1)
            self.fp.seek(0)
            self.fp.truncate()
            self.fp.write(str(os.getpid()))
            self.fp.flush()
            return True
        except Exception:
            if self.fp:
                self.fp.close()
                self.fp = None
            return False

    def release(self):
        try:
            if self.fp:
                try:
                    import msvcrt
                    self.fp.seek(0)
                    self.fp.truncate()
                    msvcrt.locking(self.fp.fileno(), msvcrt.LK_UNLCK, 1)
                finally:
                    self.fp.close()
        except Exception:
            pass


def load_config():
    """
    Carrega configuração: API_KEY e APP_ID.
    Prioridade: variáveis de ambiente → config.json
    """
    api_key = os.environ.get("BASE44_API_KEY", "").strip()
    app_id = os.environ.get("BASE44_APP_ID", "").strip()
    if api_key and app_id:
        return {"API_KEY": api_key, "APP_ID": app_id}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if cfg.get("API_KEY") and cfg.get("APP_ID"):
                return cfg
        except Exception as e:
            logger.error(f"Falha ao ler config.json: {e}")
    return None


def _auth_headers(api_key: str, app_id: str) -> dict:
    """
    Cabeçalhos de autenticação obrigatórios em TODOS os pedidos ao NOC Monitor.
    O servidor rejeita (401/403) qualquer pedido sem estes dois cabeçalhos.
    """
    return {
        "X-Api-Key": api_key,
        "X-App-Id": app_id,
        "Content-Type": "application/json",
    }


def listar_terminais(session, app_id: str, api_key: str) -> list:
    """
    GET agentGetTerminals — devolve lista de terminais atribuídos a este utilizador.
    Requer X-Api-Key + X-App-Id.
    """
    url = f"https://app.base44.app/api/apps/{app_id}/functions/agentGetTerminals"
    r = session.get(url, headers=_auth_headers(api_key, app_id), timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"Resposta inesperada de agentGetTerminals: {data}")
    terminals = data.get("terminals", [])
    if not isinstance(terminals, list):
        raise ValueError("Esperada lista de terminais em data.terminals")
    return terminals


def reportar_terminal(session, app_id: str, api_key: str, terminal_id: str,
                      status: str, latencia_ms, segundos_sem_ping: int = 0):
    """
    POST agentReport — envia o estado actual do terminal ao NOC Monitor.
    Requer X-Api-Key + X-App-Id no cabeçalho + payload JSON no body.
    """
    url = f"https://app.base44.app/api/apps/{app_id}/functions/agentReport"
    payload = {
        "terminal_id": terminal_id,
        "status": status,
        "latencia_ms": latencia_ms,
        "segundos_sem_ping": segundos_sem_ping,
    }
    r = session.post(url, headers=_auth_headers(api_key, app_id), json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def testar_http(session, host, porta):
    inicio = time.time()
    try:
        session.get(f"http://{host}:{porta}", timeout=TIMEOUT)
        return True, int((time.time() - inicio) * 1000)
    except Exception:
        return False, None


def testar_tcp(host, porta):
    inicio = time.time()
    try:
        with socket.create_connection((host, int(porta)), timeout=TIMEOUT):
            return True, int((time.time() - inicio) * 1000)
    except Exception:
        return False, None


def escolher_host(t):
    return t.get("ip_local") or t.get("ip_publico") or t.get("dns")


def run_agent(intervalo=DEFAULT_INTERVAL, enable_update=True, once=False,
              stop_event=None, check_update_safe=None):
    os.makedirs(APP_DIR, exist_ok=True)
    lock = SingleInstance(LOCK_FILE)
    if not lock.acquire():
        logger.error("Outra instância do Base44 Agent já está em execução. Encerrando.")
        return 2

    session = requests.Session()
    last_update_check = datetime.min.replace(tzinfo=timezone.utc)

    try:
        while True:
            if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                logger.info("Stop solicitado. Encerrando loop.")
                return 0

            config = load_config()
            if not config:
                logger.warning("Configuração ausente. Aguardando config.json ou variáveis de ambiente...")
                for _ in range(10):
                    if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                        return 0
                    time.sleep(1)
                if once:
                    break
                continue

            api_key = config["API_KEY"]
            app_id = config["APP_ID"]

            # Validação mínima local antes de fazer qualquer pedido
            if not api_key.startswith("noc_"):
                logger.error("API Key inválida: deve começar com 'noc_'. Verifique a configuração.")
                for _ in range(30):
                    if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                        return 0
                    time.sleep(1)
                if once:
                    break
                continue

            agora = datetime.now(timezone.utc)
            if enable_update and check_update_safe and (agora - last_update_check) >= UPDATE_EVERY:
                try:
                    logger.info("Verificando atualização...")
                    scheduled = check_update_safe()
                    if scheduled:
                        logger.info("Atualização agendada. Encerrando para atualizar...")
                        return 0
                except Exception as e:
                    logger.error(f"Erro ao verificar atualização: {e}")
                finally:
                    last_update_check = agora

            try:
                terminais = listar_terminais(session, app_id, api_key)
            except requests.HTTPError as e:
                status_code = e.response.status_code if e.response is not None else "?"
                if status_code in (401, 403):
                    logger.error(
                        f"Autenticação falhada ({status_code}): verifique API_KEY e APP_ID. "
                        "O servidor exige X-Api-Key e X-App-Id válidos."
                    )
                else:
                    logger.error(f"Falha ao listar terminais (HTTP {status_code}): {e}")
                for _ in range(intervalo):
                    if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                        return 0
                    time.sleep(1)
                if once:
                    break
                continue
            except Exception as e:
                logger.error(f"Falha ao listar terminais: {e}")
                for _ in range(intervalo):
                    if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                        return 0
                    time.sleep(1)
                if once:
                    break
                continue

            for t in terminais:
                if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                    return 0
                try:
                    if not t.get("ativo", True):
                        continue
                    host = escolher_host(t)
                    if not host:
                        logger.debug(f"Terminal {t.get('id')} sem host/ip configurado. Pulando.")
                        continue

                    porta = t.get("porta") or 80
                    sucesso, latencia = testar_http(session, host, porta)
                    if not sucesso:
                        sucesso, latencia = testar_tcp(host, porta)

                    agora_ts = datetime.now(timezone.utc)
                    status = "online" if sucesso else "offline"

                    resp = reportar_terminal(
                        session, app_id, api_key,
                        terminal_id=t["id"],
                        status=status,
                        latencia_ms=latencia,
                        segundos_sem_ping=0 if sucesso else 0,
                    )
                    logger.info(
                        f"Testando {t.get('nome', t.get('id'))} ({host}:{porta})\n"
                        f"→ {status} | latência={latencia} ms"
                    )
                except requests.HTTPError as e:
                    status_code = e.response.status_code if e.response is not None else "?"
                    logger.error(
                        f"Erro ao reportar terminal {t.get('id')} (HTTP {status_code}): "
                        "verifique credenciais."
                    )
                except Exception as e:
                    logger.error(f"Erro ao processar terminal {t.get('id')}: {e}")

            for _ in range(intervalo):
                if stop_event and hasattr(stop_event, "is_set") and stop_event.is_set():
                    return 0
                time.sleep(1)
            if once:
                break
        return 0
    finally:
        lock.release()