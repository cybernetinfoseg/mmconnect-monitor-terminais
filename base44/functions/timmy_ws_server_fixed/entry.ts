# timmy_ws_server_v2.py — NOC Monitor: Servidor WebSocket Cloud (Protocolo Timmy/THbio)
# ✅ VERSÃO V2: Marcações automáticas em tempo real + Auto-sync utilizadores + LiveTimeSync
#
# Novas funcionalidades (inspiradas no MbioFace WebSocket Manager):
#   - sendlog: processa marcações e envia automaticamente para o NOC Monitor (Base44)
#   - Auto-sync utilizadores: a cada 60s sincroniza utilizadores do Base44 para os terminais
#   - LiveTimeSync: acerta o relógio de cada terminal a cada 30s
#   - UseCartaoAsEnrollId: se card disponível, usa como enrollid
#
# Config: C:\ProgramData\TimmyWSServer\config.json
# {
#   "API_KEY": "a_sua_api_key_pessoal",
#   "APP_ID":  "697aa46c9998c30665e2e19a",
#   "WS_PORT": 7788,
#   "AUTO_SYNC_USERS": true,
#   "AUTO_SYNC_INTERVAL": 60,
#   "LIVE_TIME_SYNC": true,
#   "LIVE_TIME_SYNC_INTERVAL": 30,
#   "INSERT_MARCACOES": true
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
DEFAULT_CTRL_PORT = 7789
OFFLINE_TIMEOUT   = 15    # segundos sem mensagem → offline
BASE_URL = "https://app.base44.app/api/apps/{app_id}/functions"

# Modos de verificação do terminal → tipo de marcação
MODE_MAP = {
    1: "fp", 3: "fp", 4: "fp",          # impressão digital
    2: "face", 200: "face", 201: "face", # facial
    10: "card", 11: "card",              # cartão
    6: "pw",                             # senha
}

logger = logging.getLogger("timmy_ws")

# Estado em memória
ws_state    = {}
ws_lock     = threading.Lock()
sn_to_terminal = {}
sn_to_nome     = {}
sn_to_local    = {}
sn_to_info     = {}  # SN → dados completos do terminal

ws_connections = {}
ws_conn_lock   = threading.Lock()

pending_commands = {}
pending_lock     = threading.Lock()

# Cache de utilizadores sincronizados: sn → set(enrollid)
synced_users = {}
synced_users_lock = threading.Lock()


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
    url = f"{BASE_URL.format(app_id=app_id)}/nocServerGetTerminals"
    r = requests.post(url, headers=_headers(api_key), json={}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"nocServerGetTerminals erro: {data}")
    return [t for t in data.get("terminals", []) if t.get("tipo_conexao") == "websocket_cloud"]

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

def inserir_marcacao(app_id, api_key, terminal_id, terminal_nome, local, enrollid, timestamp_str, raw_mode):
    """Envia uma marcação para o NOC Monitor via agentReport."""
    modo = MODE_MAP.get(raw_mode, "desconhecido")
    url = f"{BASE_URL.format(app_id=app_id)}/agentReport"
    payload = {
        "terminal_id":    terminal_id,
        "terminal_nome":  terminal_nome,
        "local":          local or "",
        "enrollid":       enrollid,
        "timestamp":      timestamp_str,
        "modo":           modo,
        "raw_mode":       raw_mode,
        "tipo":           "desconhecido",  # o agentReport determina entrada/saida
    }
    try:
        r = requests.post(url, headers=_headers(api_key), json=payload, timeout=8)
        r.raise_for_status()
        logger.debug(f"[MARCACAO] enrollid={enrollid} ts={timestamp_str} modo={modo} → guardado")
        return True
    except Exception as e:
        logger.error(f"[MARCACAO] Erro ao guardar enrollid={enrollid}: {e}")
        return False

def listar_utilizadores_noc(app_id, api_key):
    """Busca utilizadores do NOC Monitor (TerminalUser) para sync."""
    url = f"{BASE_URL.format(app_id=app_id)}/agentGetTerminals"
    # Reutiliza o agentGetTerminals que retorna utilizadores por terminal
    # Alternativa: chamar endpoint dedicado se existir
    try:
        r = requests.post(url, headers=_headers(api_key), json={}, timeout=10)
        r.raise_for_status()
        data = r.json()
        return data.get("users", [])
    except Exception as e:
        logger.error(f"[SYNC-USERS] Erro ao listar utilizadores: {e}")
        return []


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

            cmd    = msg.get("cmd", "")
            msg_sn = msg.get("sn", "")
            ret    = msg.get("ret", "")

            # ── REG ──────────────────────────────────────────
            if cmd == "reg":
                sn      = msg_sn
                devinfo = msg.get("devinfo", {})
                nome    = sn_to_nome.get(sn, f"Terminal-{sn}")
                tid     = sn_to_terminal.get(sn)

                logger.info(f"[WS] REG: SN={sn} modelo={devinfo.get('modelname','?')} fw={devinfo.get('firmware','?')}")

                # Guardar devinfo para referência
                with ws_lock:
                    sn_to_info[sn] = devinfo

                if not tid:
                    logger.warning(f"[WS] SN={sn} não mapeado — adicione o número de série no painel NOC Monitor")

                with ws_conn_lock:
                    ws_connections[sn] = (websocket, asyncio.get_event_loop())

                with ws_lock:
                    ws_state[sn] = {
                        "terminal_id": tid,
                        "nome": nome,
                        "connected": True,
                        "last_seen": time.time(),
                        "latencia_ms": None,
                    }

                now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                await websocket.send(json.dumps({
                    "ret":       "reg",
                    "result":    True,
                    "cloudtime": now_str,
                    "nosenduser": True   # não enviar lista de utilizadores no reg
                }))

                if tid:
                    logger.info(f"[WS] ✅ '{nome}' (SN={sn}) registado e ONLINE")
                    # Reportar imediatamente como online
                    _config = _get_config()
                    if _config:
                        try:
                            reportar_status_ws(_config["APP_ID"], _config["API_KEY"], tid, "online")
                        except Exception:
                            pass

            # ── SENDLOG (marcações em tempo real) ────────────
            elif cmd == "sendlog":
                if not sn:
                    sn = msg_sn
                count    = msg.get("count", 0)
                records  = msg.get("record", [])
                logindex = msg.get("logindex", 0)

                tid   = sn_to_terminal.get(sn)
                nome  = sn_to_nome.get(sn, sn)
                local = sn_to_local.get(sn, "")

                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["last_seen"] = time.time()
                        ws_state[sn]["connected"] = True

                logger.info(f"[WS] SENDLOG SN={sn} count={count} logindex={logindex}")

                # ✅ NOVO: Processar e guardar marcações em tempo real
                _config = _get_config()
                if tid and records and _config and _config.get("INSERT_MARCACOES", True):
                    for rec in records:
                        enrollid   = rec.get("enrollid")
                        ts         = rec.get("time", "")      # "YYYY-MM-DD HH:MM:SS"
                        raw_mode   = rec.get("mode", 0)
                        if enrollid is not None and ts:
                            threading.Thread(
                                target=inserir_marcacao,
                                args=(_config["APP_ID"], _config["API_KEY"],
                                      tid, nome, local, enrollid, ts, raw_mode),
                                daemon=True
                            ).start()

                await websocket.send(json.dumps({
                    "ret":       "sendlog",
                    "result":    True,
                    "count":     count,
                    "logindex":  logindex,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "access":    1
                }))

            # ── SENDUSER ─────────────────────────────────────
            elif cmd == "senduser":
                if not sn: sn = msg_sn
                enrollid = msg.get("enrollid")
                logger.debug(f"[WS] SENDUSER SN={sn} enrollid={enrollid}")

                # Registar utilizador como sincronizado neste terminal
                if sn and enrollid is not None:
                    with synced_users_lock:
                        if sn not in synced_users:
                            synced_users[sn] = set()
                        synced_users[sn].add(str(enrollid))

                await websocket.send(json.dumps({
                    "ret":       "senduser",
                    "result":    True,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S")
                }))

            # ── HEARTBEAT / KEEPALIVE ─────────────────────────
            elif cmd in ("heartbeat", "keepalive", "ping"):
                if not sn: sn = msg_sn
                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["last_seen"] = time.time()
                        ws_state[sn]["connected"] = True
                await websocket.send(json.dumps({"ret": cmd, "result": True}))

            # ── RESPOSTAS A COMANDOS ──────────────────────────
            elif ret:
                with pending_lock:
                    for (cmd_sn, cmd_id), future in list(pending_commands.items()):
                        if cmd_sn == (sn or msg_sn) and (msg.get("cmd") == cmd_id or msg.get("ret") == cmd_id):
                            if not future.done():
                                future.set_result(msg)
                            del pending_commands[(cmd_sn, cmd_id)]
                            logger.debug(f"[WS] Resposta ao comando '{cmd_id}' de SN={sn or msg_sn}: {msg}")
                            break

            else:
                logger.debug(f"[WS] MSG desconhecida: {msg}")
                if "ret" not in msg and "cmd" in msg:
                    await websocket.send(json.dumps({"ret": cmd, "result": True}))

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
            # Reportar offline imediatamente
            tid = sn_to_terminal.get(sn)
            _config = _get_config()
            if tid and _config:
                try:
                    reportar_status_ws(_config["APP_ID"], _config["API_KEY"], tid, "offline")
                except Exception:
                    pass
        else:
            logger.info(f"[WS] Ligação encerrada: {peer[0]} (sem registo)")


# ──────────────────────────────────────────────────────────────
# Servidor HTTP de Controlo (porta 7789)
# ──────────────────────────────────────────────────────────────

class CtrlHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

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
            self._respond(503, {"success": False, "error": f"Terminal SN={sn} não está conectado"})
            return

        ws, loop = conn_data
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._send_and_wait(ws, sn, command), loop
            )
            result = future.result(timeout=22)
            self._respond(200, {"success": True, "result": result})
        except asyncio.TimeoutError:
            self._respond(504, {"success": False, "error": "Terminal não respondeu em 22s"})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    async def _send_and_wait(self, ws, sn, command):
        cmd_id = str(uuid.uuid4())[:8]
        loop   = asyncio.get_event_loop()
        future = loop.create_future()
        with pending_lock:
            pending_commands[(sn, cmd_id)] = future
        try:
            msg_to_send = dict(command)
            msg_to_send["cmd_id"] = cmd_id
            await ws.send(json.dumps(msg_to_send))
            return await asyncio.wait_for(future, timeout=20)
        finally:
            with pending_lock:
                pending_commands.pop((sn, cmd_id), None)

    def do_GET(self):
        if self.path == "/status":
            with ws_conn_lock:
                connected_sns = list(ws_connections.keys())
            self._respond(200, {
                "connected_terminals": connected_sns,
                "count": len(connected_sns),
                "details": {sn: ws_state.get(sn, {}) for sn in connected_sns}
            })
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
    try:
        server = HTTPServer(("0.0.0.0", port), CtrlHandler)
        server.timeout = 1
        logger.info(f"[CTRL] HTTP de controlo activo em http://0.0.0.0:{port}/cmd")
        while not stop_event.is_set():
            server.handle_request()
        server.server_close()
    except Exception as e:
        logger.error(f"[CTRL] Erro: {e}")


# ──────────────────────────────────────────────────────────────
# ✅ NOVO: Auto-Sync de Utilizadores → Terminais (AutoSyncEmployees)
# ──────────────────────────────────────────────────────────────
def ciclo_sync_utilizadores(app_id, api_key, intervalo=60, max_por_tick=25, stop_event=None):
    """
    A cada `intervalo` segundos, busca utilizadores do NOC Monitor e envia
    'setuserinfo' a cada terminal WebSocket conectado que ainda não tem o utilizador.
    """
    logger.info(f"[SYNC-USERS] Auto-sync activo — intervalo={intervalo}s max_por_tick={max_por_tick}")
    time.sleep(15)  # aguardar estabilização inicial

    while not (stop_event and stop_event.is_set()):
        try:
            # Buscar utilizadores do NOC Monitor
            url = f"{BASE_URL.format(app_id=app_id)}/agentGetTerminals"
            r = requests.post(url, headers=_headers(api_key), json={}, timeout=15)
            r.raise_for_status()
            data = r.json()
            users = data.get("users", [])

            if not users:
                logger.debug("[SYNC-USERS] Nenhum utilizador encontrado no NOC Monitor")
            else:
                logger.info(f"[SYNC-USERS] {len(users)} utilizadores encontrados — sincronizando...")

                with ws_conn_lock:
                    connected_sns = list(ws_connections.keys())

                for sn in connected_sns:
                    ws, loop = ws_connections.get(sn, (None, None))
                    if not ws or not loop:
                        continue

                    tid = sn_to_terminal.get(sn)
                    sent = 0

                    # Filtrar utilizadores ainda não sincronizados neste terminal
                    with synced_users_lock:
                        already = synced_users.get(sn, set())

                    to_sync = [u for u in users if str(u.get("enrollid", "")) not in already]
                    to_sync = to_sync[:max_por_tick]  # limitar por tick

                    for user in to_sync:
                        enrollid = user.get("enrollid")
                        name     = user.get("nome", f"User{enrollid}")
                        card     = str(user.get("card", "")) if user.get("card") else ""
                        password = str(user.get("password", "")) if user.get("password") else ""
                        privilege = user.get("privilege", 0)

                        # Usar cartão como enrollid se disponível (UseCartaoAsEnrollId)
                        backupnum = 10  # senha por defeito
                        record    = int(password) if password.isdigit() else 0
                        if card and card.isdigit():
                            backupnum = 11
                            record    = int(card)

                        msg = {
                            "cmd":      "setuserinfo",
                            "enrollid": int(enrollid),
                            "name":     name,
                            "backupnum": backupnum,
                            "admin":    int(privilege),
                            "record":   record,
                        }

                        try:
                            asyncio.run_coroutine_threadsafe(
                                ws.send(json.dumps(msg)), loop
                            ).result(timeout=5)
                            sent += 1
                            with synced_users_lock:
                                if sn not in synced_users:
                                    synced_users[sn] = set()
                                synced_users[sn].add(str(enrollid))
                        except Exception as e:
                            logger.warning(f"[SYNC-USERS] Erro ao enviar enrollid={enrollid} para SN={sn}: {e}")

                    if sent > 0:
                        logger.info(f"[SYNC-USERS] SN={sn}: {sent} utilizadores sincronizados")

        except Exception as e:
            logger.error(f"[SYNC-USERS] Erro no ciclo: {e}")

        time.sleep(intervalo)


# ──────────────────────────────────────────────────────────────
# ✅ NOVO: LiveTimeSync — Acerto automático do relógio dos terminais
# ──────────────────────────────────────────────────────────────
def ciclo_live_time_sync(intervalo=30, stop_event=None):
    """
    A cada `intervalo` segundos, envia 'settime' a todos os terminais conectados.
    Equivalente ao LiveTimeSync do MbioFace Manager.
    """
    logger.info(f"[TIMESYNC] LiveTimeSync activo — intervalo={intervalo}s")
    time.sleep(20)  # aguardar estabilização inicial

    while not (stop_event and stop_event.is_set()):
        try:
            with ws_conn_lock:
                connected_sns = list(ws_connections.keys())

            now_str = time.strftime("%Y-%m-%d %H:%M:%S")

            for sn in connected_sns:
                ws, loop = ws_connections.get(sn, (None, None))
                if not ws or not loop:
                    continue
                try:
                    asyncio.run_coroutine_threadsafe(
                        ws.send(json.dumps({"cmd": "settime", "cloudtime": now_str})),
                        loop
                    ).result(timeout=5)
                    logger.debug(f"[TIMESYNC] SN={sn} → hora acertada para {now_str}")
                except Exception as e:
                    logger.warning(f"[TIMESYNC] Erro ao acertar hora SN={sn}: {e}")

        except Exception as e:
            logger.error(f"[TIMESYNC] Erro no ciclo: {e}")

        time.sleep(intervalo)


# ──────────────────────────────────────────────────────────────
# Ciclo de Reporte → NOC Monitor
# ──────────────────────────────────────────────────────────────
def ciclo_reporte_ws(app_id, api_key, intervalo=30, stop_event=None):
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
# Config helper (para acesso dentro de coroutines)
# ──────────────────────────────────────────────────────────────
_global_config = {}

def _get_config():
    return _global_config if _global_config.get("APP_ID") else None


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
async def main_async(app_id, api_key, ws_port, stop_event):
    async with serve(handle_terminal, "0.0.0.0", ws_port) as server:
        logger.info("=" * 65)
        logger.info(f"  Timmy WebSocket Server V2 — NOC Monitor")
        logger.info(f"  Porta WebSocket (terminais):  {ws_port}")
        logger.info(f"  Porta HTTP controlo:          {ws_port + 1}")
        logger.info(f"  Terminais mapeados:           {len(sn_to_terminal)}")
        logger.info(f"  Insert Marcações:             {_global_config.get('INSERT_MARCACOES', True)}")
        logger.info(f"  Auto-Sync Utilizadores:       {_global_config.get('AUTO_SYNC_USERS', True)}")
        logger.info(f"  LiveTimeSync:                 {_global_config.get('LIVE_TIME_SYNC', True)}")
        logger.info("=" * 65)
        await asyncio.get_event_loop().run_in_executor(None, stop_event.wait)
        server.close()

def run(config, stop_event=None):
    global _global_config
    if stop_event is None:
        stop_event = threading.Event()

    _global_config = config

    app_id    = config["APP_ID"]
    api_key   = config["API_KEY"]
    ws_port   = config.get("WS_PORT", DEFAULT_WS_PORT)
    ctrl_port = config.get("CTRL_PORT", DEFAULT_CTRL_PORT)
    intervalo = config.get("INTERVALO_REPORT", 30)

    auto_sync_users     = config.get("AUTO_SYNC_USERS", True)
    auto_sync_interval  = config.get("AUTO_SYNC_INTERVAL", 60)
    max_per_tick        = config.get("MAX_AUTO_SYNC_PER_TICK", 25)
    live_time_sync      = config.get("LIVE_TIME_SYNC", True)
    live_time_interval  = config.get("LIVE_TIME_SYNC_INTERVAL", 30)

    # Carregar terminais websocket_cloud
    global sn_to_terminal, sn_to_nome, sn_to_local
    try:
        terminais = listar_terminais_ws(app_id, api_key)
        for t in terminais:
            sn = (t.get("numero_serie") or "").strip()
            if sn:
                sn_to_terminal[sn] = t["id"]
                sn_to_nome[sn]     = t.get("nome", sn)
                sn_to_local[sn]    = t.get("local", "")
                logger.info(f"  Mapeado: SN={sn} → '{t['nome']}' ({t.get('local','')})")
            else:
                logger.warning(f"  Terminal '{t['nome']}' sem número de série — ignorado")
        logger.info(f"Total: {len(sn_to_terminal)} terminal(is) WebSocket Cloud mapeado(s)")
    except Exception as e:
        logger.error(f"Não foi possível carregar terminais: {e}")

    # Thread de reporte de status
    threading.Thread(
        target=ciclo_reporte_ws,
        args=(app_id, api_key, intervalo, stop_event),
        name="ws-report", daemon=True
    ).start()

    # Thread do servidor HTTP de controlo
    threading.Thread(
        target=start_ctrl_server,
        args=(ctrl_port, stop_event),
        name="ctrl-http", daemon=True
    ).start()

    # ✅ NOVO: Thread de auto-sync de utilizadores
    if auto_sync_users:
        threading.Thread(
            target=ciclo_sync_utilizadores,
            args=(app_id, api_key, auto_sync_interval, max_per_tick, stop_event),
            name="sync-users", daemon=True
        ).start()

    # ✅ NOVO: Thread de LiveTimeSync
    if live_time_sync:
        threading.Thread(
            target=ciclo_live_time_sync,
            args=(live_time_interval, stop_event),
            name="timesync", daemon=True
        ).start()

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
    parser = argparse.ArgumentParser(description="Timmy WebSocket Server V2 — NOC Monitor")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--port",  type=int, default=DEFAULT_WS_PORT)
    args = parser.parse_args()
    setup_logging(args.debug)

    cfg = load_config()
    if not cfg:
        logger.error("config.json ausente ou inválido.")
        logger.error(f"Verifique: {CONFIG_FILE}")
        logger.error('Conteúdo esperado: {"API_KEY":"...","APP_ID":"697aa46c9998c30665e2e19a","WS_PORT":7788}')
        sys.exit(1)

    if args.port:
        cfg["WS_PORT"] = args.port

    sys.exit(run(cfg) or 0)