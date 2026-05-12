# timmy_ws_server.py — NOC Monitor: Servidor WebSocket Cloud (Protocolo Timmy/THbio)
# ✅ VERSÃO CORRIGIDA: Sistema de Futures para correlacionar respostas com comandos
# Compatível com: Timmy TM-AI07F, TM-AIFace11F, TFS30, TFS50 e outros modelos THbio
# Protocolo: WebSocket + JSON (RFC 6455) — porta padrão 7788 (configurável)
#
# O terminal conecta-se ao servidor WebSocket e envia:
#   1. cmd:"reg"     — registo inicial com SN, modelo, firmware
#   2. cmd:"sendlog" — logs de presença em tempo real (heartbeat implícito)
#   3. Heartbeat a cada 3s (configurável no terminal)
#
# Config: C:\ProgramData\TimmyWSServer\config.json
# {
#   "API_KEY": "a_sua_api_key_pessoal",
#   "APP_ID":  "697aa46c9998c30665e2e19a",
#   "WS_PORT": 7788
# }
#
# Instalação (Windows):
#   pip install websockets requests
#   nssm install TimmyWSServer "C:\Python311\python.exe" "C:\Program Files\TimmyWSServer\timmy_ws_server.py"
#   nssm start TimmyWSServer
#
# Configuração no terminal Timmy:
#   MENU → Comm Set → Server → Server Req: Yes
#   Use domainNm: Yes → DomainNm: 51.91.219.145
#   SerPortNo: 7788
#   Heartbeat: 3s
#   Server approval: No

import os, sys, json, time, logging, asyncio, threading, uuid
from logging.handlers import RotatingFileHandler
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests

try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("ERRO: instale 'websockets' com: pip install websockets")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────
# Constantes e Paths
# ──────────────────────────────────────────────────────────────
PROGRAMDATA  = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
APP_DIR      = os.path.join(PROGRAMDATA, "TimmyWSServer")
CONFIG_FILE  = os.path.join(APP_DIR, "config.json")
LOG_FILE     = os.path.join(APP_DIR, "timmy_ws.log")

DEFAULT_WS_PORT   = 7788
DEFAULT_CTRL_PORT = 7789  # porta HTTP de controlo (NOC Monitor → servidor → terminal)
OFFLINE_TIMEOUT   = 15    # segundos sem mensagem → offline
BASE_URL = "https://app.base44.app/api/apps/{app_id}/functions"

logger = logging.getLogger("timmy_ws")

# Estado em memória: SN → { terminal_id, nome, last_seen, latencia_ms, connected }
ws_state = {}
ws_lock  = threading.Lock()

# Mapa SN → terminal_id (carregado da API)
sn_to_terminal = {}
sn_to_nome     = {}

# Mapa SN → (websocket_object, loop_asyncio)
ws_connections = {}
ws_conn_lock   = threading.Lock()

# Mapa: (SN, cmd_id) → asyncio.Future (para correlacionar respostas com comandos)
pending_commands = {}
pending_lock     = threading.Lock()


# ──────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────
def setup_logging(debug=False):
    os.makedirs(APP_DIR, exist_ok=True)
    h   = RotatingFileHandler(LOG_FILE, maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s", "%Y-%m-%d %H:%M:%S")
    h.setFormatter(fmt)
    logger.addHandler(h)
    logger.setLevel(logging.DEBUG if debug else logging.INFO)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(sh)


# ──────────────────────────────────────────────────────────────
# API Helpers
# ──────────────────────────────────────────────────────────────
def _headers(api_key):
    return {"X-Api-Key": api_key, "Content-Type": "application/json"}

def listar_terminais_ws(app_id, api_key):
    """Busca terminais do tipo websocket_cloud."""
    url = f"{BASE_URL.format(app_id=app_id)}/nocServerGetTerminals"
    r = requests.post(url, headers=_headers(api_key), json={}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"nocServerGetTerminals erro: {data}")
    # Filtrar apenas websocket_cloud
    terminais = [t for t in data.get("terminals", []) if t.get("tipo_conexao") == "websocket_cloud"]
    return terminais

def reportar_status_ws(app_id, api_key, terminal_id, status, latencia_ms=None, segundos_sem_ping=0):
    url = f"{BASE_URL.format(app_id=app_id)}/nocServerReport"
    payload = {
        "terminal_id":       terminal_id,
        "status":            status,
        "latencia_ms":       latencia_ms,
        "segundos_sem_ping": segundos_sem_ping,
    }
    r = requests.post(url, headers=_headers(api_key), json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


# ──────────────────────────────────────────────────────────────
# Handler WebSocket por terminal conectado
# ──────────────────────────────────────────────────────────────
async def handle_terminal(websocket, path=None):
    """Trata uma ligação WebSocket de um terminal Timmy."""
    peer = websocket.remote_address
    sn   = None
    logger.info(f"[WS] Nova ligação de {peer[0]}:{peer[1]}")

    try:
        async for raw_msg in websocket:
            try:
                msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning(f"[WS] Mensagem inválida de {peer[0]}: {raw_msg[:100]}")
                continue

            cmd = msg.get("cmd", "")
            msg_sn = msg.get("sn", "")
            ret = msg.get("ret", "")

            if cmd == "reg":
                # Terminal registou-se: { cmd:"reg", sn:"ZX...", cpusn:"...", devinfo:{...} }
                sn    = msg_sn
                devinfo = msg.get("devinfo", {})
                nome  = sn_to_nome.get(sn, f"Terminal-{sn}")
                tid   = sn_to_terminal.get(sn)

                logger.info(f"[WS] REG: SN={sn} modelo={devinfo.get('modelname','?')} firmware={devinfo.get('firmware','?')}")

                if not tid:
                    logger.warning(f"[WS] SN={sn} não mapeado — adicione o número de série no painel NOC Monitor")
                    await websocket.send(json.dumps({
                        "ret": "reg",
                        "result": True,
                        "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "nosenduser": True
                    }))
                    continue

                # Guardar referência da sessão WS activa para controlo remoto
                with ws_conn_lock:
                    ws_connections[sn] = (websocket, asyncio.get_event_loop())

                # Marcar online
                with ws_lock:
                    ws_state[sn] = {
                        "terminal_id": tid,
                        "nome": nome,
                        "connected": True,
                        "last_seen": time.time(),
                        "latencia_ms": None,
                    }

                # Responder ao terminal com a hora actual do servidor
                await websocket.send(json.dumps({
                    "ret": "reg",
                    "result": True,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "nosenduser": True
                }))
                logger.info(f"[WS] ✅ '{nome}' (SN={sn}) registado e ONLINE")

            elif cmd == "sendlog":
                # Terminal enviou logs de presença: heartbeat implícito
                if not sn:
                    sn = msg_sn
                count   = msg.get("count", 0)
                records = msg.get("record", [])
                logindex = msg.get("logindex", 0)

                if sn and sn in sn_to_terminal:
                    with ws_lock:
                        if sn in ws_state:
                            ws_state[sn]["last_seen"] = time.time()
                            ws_state[sn]["connected"] = True

                logger.info(f"[WS] SENDLOG SN={sn} count={count} logindex={logindex}")

                await websocket.send(json.dumps({
                    "ret": "sendlog",
                    "result": True,
                    "count": count,
                    "logindex": logindex,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "access": 1
                }))

            elif cmd == "senduser":
                if not sn: sn = msg_sn
                logger.debug(f"[WS] SENDUSER SN={sn} enrollid={msg.get('enrollid')}")
                await websocket.send(json.dumps({
                    "ret": "senduser",
                    "result": True,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S")
                }))

            elif ret:
                # Resposta a um comando enviado pelo NOC Monitor
                # Procurar no mapa de comandos pendentes
                with pending_lock:
                    for (cmd_sn, cmd_id), future in list(pending_commands.items()):
                        if cmd_sn == (sn or msg_sn) and (msg.get("cmd") == cmd_id or msg.get("ret") == cmd_id):
                            if not future.done():
                                future.set_result(msg)
                            del pending_commands[(cmd_sn, cmd_id)]
                            logger.debug(f"[WS] Resposta ao comando '{cmd_id}' recebida de SN={sn or msg_sn}: {msg}")
                            break

            else:
                logger.debug(f"[WS] CMD/RET desconhecido: {msg}")
                # Enviar ACK genérico
                if "ret" not in msg and "cmd" in msg:
                    await websocket.send(json.dumps({
                        "ret": cmd,
                        "result": True
                    }))

    except Exception as e:
        if "ConnectionClosed" not in type(e).__name__:
            logger.error(f"[WS] Erro com {peer[0]}: {e}")
    finally:
        if sn:
            with ws_conn_lock:
                if ws_connections.get(sn, (None,))[0] is websocket:
                    del ws_connections[sn]
            with ws_lock:
                if sn in ws_state:
                    ws_state[sn]["connected"] = False
            logger.info(f"[WS] Ligação encerrada: SN={sn} ({peer[0]})")
        else:
            logger.info(f"[WS] Ligação encerrada: {peer[0]} (sem registo)")


# ──────────────────────────────────────────────────────────────
# Servidor HTTP de Controlo (porta 7789)
# NOC Monitor → POST /cmd { sn, command } → WS → Terminal → resposta
# ──────────────────────────────────────────────────────────────

class CtrlHandler(BaseHTTPRequestHandler):
    """Recebe comandos do NOC Monitor e faz relay via WebSocket ao terminal."""

    def log_message(self, fmt, *args):
        pass  # silenciar logs HTTP

    def do_POST(self):
        if self.path != "/cmd":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        body   = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except Exception:
            self._respond(400, {"success": False, "error": "JSON inválido"})
            return

        sn      = (payload.get("sn") or "").strip()
        command = payload.get("command")

        if not sn or not command:
            self._respond(400, {"success": False, "error": "sn e command são obrigatórios"})
            return

        with ws_conn_lock:
            conn_data = ws_connections.get(sn)

        if not conn_data:
            self._respond(503, {"success": False, "error": f"Terminal SN={sn} não está conectado ao servidor WebSocket"})
            return

        ws, loop = conn_data

        # Enviar comando ao terminal via WS e aguardar resposta
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._send_and_wait(ws, sn, command),
                loop
            )
            result = future.result(timeout=12)
            self._respond(200, {"success": True, "result": result})
        except asyncio.TimeoutError:
            self._respond(504, {"success": False, "error": f"Terminal não respondeu em 12s"})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    async def _send_and_wait(self, ws, sn, command):
        """
        Envia comando e aguarda a resposta do terminal.
        Usa o sistema de futures (pending_commands) para correlacionar respostas.
        """
        cmd_id = str(uuid.uuid4())[:8]  # ID único para este comando
        
        # Criar future para aguardar resposta
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        
        with pending_lock:
            pending_commands[(sn, cmd_id)] = future
        
        try:
            # Adicionar cmd_id à mensagem de comando (para correlação)
            msg_to_send = dict(command)
            msg_to_send["cmd_id"] = cmd_id
            
            # Enviar comando ao terminal
            await ws.send(json.dumps(msg_to_send))
            
            # Aguardar resposta (timeout 11 segundos)
            result = await asyncio.wait_for(future, timeout=11)
            return result
        finally:
            with pending_lock:
                pending_commands.pop((sn, cmd_id), None)

    def do_GET(self):
        if self.path == "/status":
            with ws_conn_lock:
                connected_sns = list(ws_connections.keys())
            self._respond(200, {"connected_terminals": connected_sns, "count": len(connected_sns)})
        else:
            self.send_response(404)
            self.end_headers()

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)


def start_ctrl_server(port, stop_event):
    """Inicia o servidor HTTP de controlo numa thread dedicada."""
    try:
        server = HTTPServer(("0.0.0.0", port), CtrlHandler)
        server.timeout = 1
        logger.info(f"[CTRL] Servidor HTTP de controlo activo em http://0.0.0.0:{port}/cmd")
        logger.info(f"[CTRL] O NOC Monitor envia comandos via POST /cmd {{sn, command}}")
        while not stop_event.is_set():
            server.handle_request()
        server.server_close()
    except Exception as e:
        logger.error(f"[CTRL] Erro no servidor HTTP de controlo: {e}")


# ──────────────────────────────────────────────────────────────
# Ciclo de Reporte → NOC Monitor
# ──────────────────────────────────────────────────────────────
def ciclo_reporte_ws(app_id, api_key, intervalo=30, stop_event=None):
    """Thread de reporte periódico para o NOC Monitor."""
    logger.info(f"[REPORT-WS] Ciclo de reporte activo — intervalo={intervalo}s")
    while not (stop_event and stop_event.is_set()):
        time.sleep(intervalo)
        with ws_lock:
            snapshot = dict(ws_state)

        for sn, estado in snapshot.items():
            tid       = estado.get("terminal_id")
            nome      = estado.get("nome", sn)
            connected = estado.get("connected", False)
            last_seen = estado.get("last_seen", 0)
            latencia  = estado.get("latencia_ms")

            if not tid:
                continue

            # Verificar timeout de heartbeat
            if connected and last_seen > 0 and (time.time() - last_seen) > OFFLINE_TIMEOUT:
                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["connected"] = False
                connected = False

            seg_offline = int(time.time() - last_seen) if not connected and last_seen > 0 else 0
            status = "online" if connected else "offline"

            try:
                reportar_status_ws(app_id, api_key, tid, status, latencia, seg_offline)
                logger.info(f"[REPORT-WS] '{nome}' (SN={sn}) → {status.upper()}"
                            + (f" offline={seg_offline}s" if seg_offline else ""))
            except Exception as e:
                logger.error(f"[REPORT-WS] Erro ao reportar '{nome}': {e}")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
async def main_async(app_id, api_key, ws_port, stop_event):
    async with serve(handle_terminal, "0.0.0.0", ws_port) as server:
        logger.info("=" * 65)
        logger.info(f"  Timmy WebSocket Server — NOC Monitor")
        logger.info(f"  Porta WebSocket (terminais): {ws_port}")
        logger.info(f"  Porta HTTP controlo (NOC Monitor): {ws_port + 1}")
        logger.info(f"  Terminais mapeados: {len(sn_to_terminal)}")
        logger.info("=" * 65)
        await asyncio.get_event_loop().run_in_executor(None, stop_event.wait)
        server.close()

def run(config, stop_event=None):
    if stop_event is None:
        stop_event = threading.Event()

    app_id    = config["APP_ID"]
    api_key   = config["API_KEY"]
    ws_port   = config.get("WS_PORT", DEFAULT_WS_PORT)
    ctrl_port = config.get("CTRL_PORT", DEFAULT_CTRL_PORT)
    intervalo = config.get("INTERVALO_REPORT", 30)

    # Carregar terminais websocket_cloud
    global sn_to_terminal, sn_to_nome
    try:
        terminais = listar_terminais_ws(app_id, api_key)
        for t in terminais:
            sn = (t.get("numero_serie") or "").strip()
            if sn:
                sn_to_terminal[sn] = t["id"]
                sn_to_nome[sn]     = t.get("nome", sn)
                logger.info(f"  Mapeado: SN={sn} → '{t['nome']}'")
            else:
                logger.warning(f"  Terminal '{t['nome']}' sem número de série — ignorado")
        logger.info(f"Total: {len(sn_to_terminal)} terminal(is) WebSocket Cloud mapeado(s)")
    except Exception as e:
        logger.error(f"Não foi possível carregar terminais: {e}")

    # Thread de reporte
    t_report = threading.Thread(
        target=ciclo_reporte_ws,
        args=(app_id, api_key, intervalo, stop_event),
        name="ws-report", daemon=True
    )
    t_report.start()

    # Thread do servidor HTTP de controlo (NOC Monitor → terminal)
    t_ctrl = threading.Thread(
        target=start_ctrl_server,
        args=(ctrl_port, stop_event),
        name="ctrl-http", daemon=True
    )
    t_ctrl.start()

    # Servidor WebSocket (asyncio — bloqueia aqui)
    try:
        asyncio.run(main_async(app_id, api_key, ws_port, stop_event))
    except KeyboardInterrupt:
        stop_event.set()


def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            cfg = json.load(open(CONFIG_FILE, encoding="utf-8"))
            api_key = (cfg.get("API_KEY") or "").strip()
            app_id  = (cfg.get("APP_ID")  or "").strip()
            if api_key and app_id and len(api_key) >= 16:
                return cfg
        except Exception as e:
            logger.error(f"Falha ao ler config.json: {e}")
    return None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Timmy WebSocket Server — NOC Monitor")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--port",  type=int, default=DEFAULT_WS_PORT)
    args = parser.parse_args()
    setup_logging(args.debug)

    cfg = load_config()
    if not cfg:
        logger.error("config.json ausente ou inválido. Verifique C:\ProgramData\TimmyWSServer\config.json")
        sys.exit(1)

    if args.port:
        cfg["WS_PORT"] = args.port

    sys.exit(run(cfg) or 0)