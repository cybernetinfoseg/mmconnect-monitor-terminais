# timmy_ws_server.py — NOC Monitor: Servidor WebSocket Cloud (Protocolo Timmy/THbio v2.0)
# ✅ VERSÃO COMPLETA: Protocolo completo + gravação automática de marcações na BD
# Compatível com: Timmy TM-AI07F, TM-AIFace11F, TFS30, TFS50 e outros modelos THbio
# Protocolo: WebSocket + JSON (RFC 6455) — porta padrão 7788 (configurável)
#
# O terminal conecta-se ao servidor WebSocket e envia:
#   1. cmd:"reg"      — registo inicial com SN, modelo, firmware
#   2. cmd:"sendlog"  — logs de presença (heartbeat implícito) → gravados automaticamente na BD
#   3. cmd:"senduser" — dados de utilizadores (quando solicitado)
#   4. Heartbeat a cada 3s (configurável no terminal)
#
# Servidor ativo em dois portos:
#   - 7788 : WebSocket (terminal → servidor)
#   - 7789 : HTTP de controlo (NOC Monitor → servidor → terminal)
#
# Endpoints HTTP de controlo (porta 7789):
#   POST /cmd          — enviar comando ao terminal (sn, command)
#   GET  /status       — estado de todos os terminais conectados
#   GET  /status/<sn>  — estado de um terminal específico
#
# Config: C:\ProgramData\TimmyWSServer\config.json
# {
#   "API_KEY":           "a_sua_api_key_pessoal",
#   "APP_ID":            "697aa46c9998c30665e2e19a",
#   "WS_PORT":           7788,
#   "CTRL_PORT":         7789,
#   "INTERVALO_REPORT":  30,
#   "ACERTAR_HORA_REG":  true,
#   "TIMEZONE_OFFSET":   0
# }
#
# Instalação (Windows):
#   pip install websockets requests
#   nssm install TimmyWSServer "C:\Python311\python.exe" "C:\Program Files\TimmyWSServer\timmy_ws_server.py"
#   nssm start TimmyWSServer
#
# Configuração no terminal Timmy:
#   MENU → Comm Set → Server → Server Req: Yes
#   Use domainNm: Yes → DomainNm: <IP_DO_SERVIDOR>
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

DEFAULT_WS_PORT    = 7788
DEFAULT_CTRL_PORT  = 7789
OFFLINE_TIMEOUT    = 15    # segundos sem mensagem → considera offline
BASE_URL = "https://app.base44.app/api/apps/{app_id}/functions"

logger = logging.getLogger("timmy_ws")

# Estado em memória: SN → { terminal_id, nome, last_seen, latencia_ms, connected, devinfo }
ws_state = {}
ws_lock  = threading.Lock()

# Mapa SN → terminal_id / nome (carregado da API)
sn_to_terminal = {}
sn_to_nome     = {}

# Mapa SN → (websocket_object, loop_asyncio)
ws_connections = {}
ws_conn_lock   = threading.Lock()

# Mapa: (SN, cmd_id) → asyncio.Future (correlacionar respostas)
pending_commands = {}
pending_lock     = threading.Lock()

# Configuração global (preenchida em run())
_config = {}


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

def _api_url(app_id, func):
    return f"{BASE_URL.format(app_id=app_id)}/{func}"

def listar_terminais_ws(app_id, api_key):
    """Busca terminais do tipo websocket_cloud."""
    r = requests.post(_api_url(app_id, "nocServerGetTerminals"),
                      headers=_headers(api_key), json={}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"nocServerGetTerminals erro: {data}")
    return [t for t in data.get("terminals", []) if t.get("tipo_conexao") == "websocket_cloud"]

def reportar_status_ws(app_id, api_key, terminal_id, status, latencia_ms=None, segundos_sem_ping=0):
    payload = {
        "terminal_id":       terminal_id,
        "status":            status,
        "latencia_ms":       latencia_ms,
        "segundos_sem_ping": segundos_sem_ping,
    }
    r = requests.post(_api_url(app_id, "nocServerReport"),
                      headers=_headers(api_key), json=payload, timeout=10)
    r.raise_for_status()
    return r.json()

def gravar_marcacoes(app_id, api_key, terminal_id, terminal_nome, terminal_local, records):
    """
    Grava marcações recebidas via sendlog directamente na BD através da função admsReport.
    Reutiliza a mesma função que o servidor ADMS usa para evitar duplicação de lógica.
    """
    if not records:
        return
    payload = {
        "terminal_id":    terminal_id,
        "terminal_nome":  terminal_nome,
        "terminal_local": terminal_local,
        "records":        records,
        "source":         "websocket_cloud",
    }
    try:
        r = requests.post(_api_url(app_id, "admsReport"),
                          headers=_headers(api_key), json=payload, timeout=15)
        r.raise_for_status()
        result = r.json()
        logger.info(f"[BD] Gravadas {len(records)} marcações para '{terminal_nome}': {result.get('saved', '?')} novas")
    except Exception as e:
        logger.error(f"[BD] Erro ao gravar marcações: {e}")


# ──────────────────────────────────────────────────────────────
# Mapeamento de modo de verificação (raw_mode → string)
# Protocolo Timmy v2.0 — campo "mode" no sendlog
# ──────────────────────────────────────────────────────────────
MODE_MAP = {
    1: "fp",      # impressão digital
    3: "card",    # cartão RFID
    4: "pw",      # senha
    8: "face",    # reconhecimento facial
    10: "face",   # face AI
    50: "face",   # foto (AI device)
}

def parse_log_record(rec, terminal_id, terminal_nome, terminal_local):
    """Converte um registo do protocolo Timmy para o formato Marcacao."""
    raw_mode = rec.get("mode", 0)
    modo = MODE_MAP.get(raw_mode, "desconhecido")

    # O timestamp vem como "YYYY-MM-DD HH:MM:SS"
    ts_str = rec.get("time", "")
    try:
        import datetime
        dt = datetime.datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        timestamp = dt.isoformat() + "Z"
    except Exception:
        timestamp = ts_str

    return {
        "terminal_id":    terminal_id,
        "terminal_nome":  terminal_nome,
        "enrollid":       int(rec.get("enrollid", 0)),
        "timestamp":      timestamp,
        "tipo":           "desconhecido",   # Timmy não distingue entrada/saída nativamente
        "modo":           modo,
        "raw_mode":       raw_mode,
        "local":          terminal_local or "",
        "exportado":      False,
    }


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

            cmd     = msg.get("cmd", "")
            msg_sn  = msg.get("sn", "")
            ret     = msg.get("ret", "")

            # ── 1. REGISTO ──────────────────────────────────────────
            if cmd == "reg":
                sn      = msg_sn
                devinfo = msg.get("devinfo", {})
                nome    = sn_to_nome.get(sn, f"Terminal-{sn}")
                tid     = sn_to_terminal.get(sn)

                firmware  = devinfo.get("firmware", "?")
                modelname = devinfo.get("modelname", "?")
                logger.info(f"[WS] REG: SN={sn} modelo={modelname} firmware={firmware} IP={peer[0]}")

                # Terminal não mapeado — responde mas não guarda estado
                if not tid:
                    logger.warning(f"[WS] SN={sn} não mapeado — adicione o número de série no painel NOC Monitor")
                    await websocket.send(json.dumps({
                        "ret":       "reg",
                        "result":    True,
                        "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                        "nosenduser": True
                    }))
                    continue

                # Guardar referência da sessão WS activa
                with ws_conn_lock:
                    ws_connections[sn] = (websocket, asyncio.get_event_loop())

                # Actualizar estado em memória com devinfo
                with ws_lock:
                    ws_state[sn] = {
                        "terminal_id":  tid,
                        "nome":         nome,
                        "connected":    True,
                        "last_seen":    time.time(),
                        "latencia_ms":  None,
                        "devinfo":      devinfo,
                        "ip":           peer[0],
                    }

                # Resposta ao terminal — incluir hora actual se configurado
                acertar_hora = _config.get("ACERTAR_HORA_REG", True)
                resp_reg = {
                    "ret":        "reg",
                    "result":     True,
                    "cloudtime":  time.strftime("%Y-%m-%d %H:%M:%S"),
                    "nosenduser": True,
                }
                if acertar_hora:
                    resp_reg["cloudtime"] = time.strftime("%Y-%m-%d %H:%M:%S")

                await websocket.send(json.dumps(resp_reg))
                logger.info(f"[WS] ✅ '{nome}' (SN={sn}) registado e ONLINE | IP={peer[0]} | modelo={modelname}")

            # ── 2. ENVIO DE LOGS (marcações) ────────────────────────
            elif cmd == "sendlog":
                if not sn:
                    sn = msg_sn

                count    = msg.get("count", 0)
                records  = msg.get("record", [])
                logindex = msg.get("logindex", 0)

                tid   = sn_to_terminal.get(sn)
                nome  = sn_to_nome.get(sn, sn)

                if sn and tid:
                    with ws_lock:
                        if sn in ws_state:
                            ws_state[sn]["last_seen"] = time.time()
                            ws_state[sn]["connected"] = True

                logger.info(f"[WS] SENDLOG SN={sn} count={count} logindex={logindex}")

                # Gravar marcações na BD (em thread separada para não bloquear WS)
                if records and tid:
                    local = ""
                    with ws_lock:
                        estado = ws_state.get(sn, {})
                    # Buscar local do estado em memória (guardado no reg ou carregado)
                    local = estado.get("local", "")

                    parsed = [parse_log_record(r, tid, nome, local) for r in records]
                    app_id  = _config.get("APP_ID", "")
                    api_key = _config.get("API_KEY", "")
                    threading.Thread(
                        target=gravar_marcacoes,
                        args=(app_id, api_key, tid, nome, local, parsed),
                        daemon=True
                    ).start()

                # Resposta obrigatória: access=1 → porta abre; access=0 → porta não abre
                # Por defeito aceitamos todas as marcações (access=1)
                await websocket.send(json.dumps({
                    "ret":       "sendlog",
                    "result":    True,
                    "count":     count,
                    "logindex":  logindex,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "access":    1,
                }))

            # ── 3. ENVIO DE DADOS DE UTILIZADOR ─────────────────────
            elif cmd == "senduser":
                if not sn: sn = msg_sn
                enrollid = msg.get("enrollid")
                backupnum = msg.get("backupnum", -1)
                logger.debug(f"[WS] SENDUSER SN={sn} enrollid={enrollid} backupnum={backupnum}")
                await websocket.send(json.dumps({
                    "ret":       "senduser",
                    "result":    True,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                }))

            # ── 4. HEARTBEAT (keepalive simples) ────────────────────
            elif cmd == "heartbeat" or cmd == "ping":
                if not sn: sn = msg_sn
                if sn:
                    with ws_lock:
                        if sn in ws_state:
                            ws_state[sn]["last_seen"] = time.time()
                            ws_state[sn]["connected"] = True
                await websocket.send(json.dumps({
                    "ret":       cmd,
                    "result":    True,
                    "cloudtime": time.strftime("%Y-%m-%d %H:%M:%S"),
                }))

            # ── 5. RESPOSTAS A COMANDOS ENVIADOS PELO NOC ───────────
            elif ret:
                sn_actual = sn or msg_sn
                with ws_lock:
                    if sn_actual in ws_state:
                        ws_state[sn_actual]["last_seen"] = time.time()

                # Correlacionar com future pendente
                with pending_lock:
                    matched = False
                    for (cmd_sn, cmd_id), future in list(pending_commands.items()):
                        if cmd_sn == sn_actual:
                            if not future.done():
                                future.set_result(msg)
                            del pending_commands[(cmd_sn, cmd_id)]
                            logger.debug(f"[WS] Resposta '{ret}' de SN={sn_actual}: {msg}")
                            matched = True
                            break
                    if not matched:
                        logger.debug(f"[WS] Resposta não correlacionada de SN={sn_actual}: {msg}")

            # ── 6. COMANDO DESCONHECIDO ──────────────────────────────
            else:
                logger.debug(f"[WS] Mensagem desconhecida de {peer[0]}: {msg}")
                # ACK genérico para não deixar o terminal suspenso
                if cmd and "ret" not in msg:
                    await websocket.send(json.dumps({
                        "ret":    cmd,
                        "result": True,
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
            # Verificar se o SN é conhecido mas offline
            tid = sn_to_terminal.get(sn)
            if tid:
                self._respond(503, {"success": False, "error": f"Terminal SN={sn} está offline (não conectado ao servidor WebSocket)"})
            else:
                self._respond(404, {"success": False, "error": f"Terminal SN={sn} não reconhecido. Verifique o número de série no NOC Monitor."})
            return

        ws, loop = conn_data

        try:
            future = asyncio.run_coroutine_threadsafe(
                self._send_and_wait(ws, sn, command),
                loop
            )
            result = future.result(timeout=15)
            self._respond(200, {"success": True, "result": result})
        except asyncio.TimeoutError:
            self._respond(504, {"success": False, "error": "Terminal não respondeu em 15s — pode estar ocupado ou o comando não suporta resposta"})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    async def _send_and_wait(self, ws, sn, command):
        """
        Envia comando e aguarda a resposta do terminal via sistema de futures.
        Alguns comandos (reboot, opendoor) podem não ter resposta — tratado com timeout.
        """
        cmd_id = str(uuid.uuid4())[:8]

        loop = asyncio.get_event_loop()
        future = loop.create_future()

        with pending_lock:
            pending_commands[(sn, cmd_id)] = future

        try:
            msg_to_send = dict(command)
            msg_to_send["sn"] = sn  # sempre incluir SN na mensagem de comando

            await ws.send(json.dumps(msg_to_send))

            result = await asyncio.wait_for(future, timeout=13)
            return result
        finally:
            with pending_lock:
                pending_commands.pop((sn, cmd_id), None)

    def do_GET(self):
        # GET /status → estado de todos os terminais
        if self.path == "/status":
            with ws_conn_lock:
                connected_sns = list(ws_connections.keys())
            with ws_lock:
                state_snapshot = {
                    sn: {
                        "connected": s.get("connected"),
                        "nome": s.get("nome"),
                        "last_seen": s.get("last_seen"),
                        "ip": s.get("ip"),
                        "devinfo": s.get("devinfo", {}),
                    }
                    for sn, s in ws_state.items()
                }
            self._respond(200, {
                "connected_terminals": connected_sns,
                "count": len(connected_sns),
                "state": state_snapshot,
            })

        # GET /status/<sn> → estado de um terminal específico
        elif self.path.startswith("/status/"):
            sn = self.path[len("/status/"):]
            with ws_lock:
                s = ws_state.get(sn)
            with ws_conn_lock:
                is_connected = sn in ws_connections
            if s:
                self._respond(200, {
                    "sn": sn,
                    "connected": is_connected,
                    "nome": s.get("nome"),
                    "last_seen": s.get("last_seen"),
                    "ip": s.get("ip"),
                    "devinfo": s.get("devinfo", {}),
                })
            else:
                self._respond(404, {"success": False, "error": f"SN={sn} não reconhecido"})

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
        logger.info(f"[CTRL] Servidor HTTP de controlo activo em http://0.0.0.0:{port}")
        logger.info(f"[CTRL]   POST /cmd          — enviar comando ao terminal")
        logger.info(f"[CTRL]   GET  /status        — estado de todos os terminais")
        logger.info(f"[CTRL]   GET  /status/<sn>   — estado de um terminal")
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
# Reload periódico de terminais (detecta novos terminais adicionados)
# ──────────────────────────────────────────────────────────────
def ciclo_reload_terminais(app_id, api_key, stop_event=None):
    """Recarrega a lista de terminais a cada 5 minutos para detectar novos."""
    global sn_to_terminal, sn_to_nome
    time.sleep(300)  # aguardar 5 minutos antes do primeiro reload
    while not (stop_event and stop_event.is_set()):
        try:
            terminais = listar_terminais_ws(app_id, api_key)
            new_map = {}
            new_nomes = {}
            for t in terminais:
                sn = (t.get("numero_serie") or "").strip()
                if sn:
                    new_map[sn]   = t["id"]
                    new_nomes[sn] = t.get("nome", sn)
                    # Guardar local no estado em memória
                    with ws_lock:
                        if sn in ws_state:
                            ws_state[sn]["local"] = t.get("local", "")
            sn_to_terminal = new_map
            sn_to_nome     = new_nomes
            logger.info(f"[RELOAD] {len(sn_to_terminal)} terminal(is) WebSocket Cloud mapeado(s)")
        except Exception as e:
            logger.error(f"[RELOAD] Erro ao recarregar terminais: {e}")
        time.sleep(300)


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
async def main_async(app_id, api_key, ws_port, stop_event):
    async with serve(handle_terminal, "0.0.0.0", ws_port) as server:
        logger.info("=" * 65)
        logger.info(f"  Timmy WebSocket Server — NOC Monitor v2.0")
        logger.info(f"  Porta WebSocket (terminais): {ws_port}")
        logger.info(f"  Porta HTTP controlo (NOC Monitor): {ws_port + 1}")
        logger.info(f"  Terminais mapeados: {len(sn_to_terminal)}")
        logger.info(f"  Gravação automática de marcações: ACTIVA")
        logger.info(f"  Acertar hora no registo: {_config.get('ACERTAR_HORA_REG', True)}")
        logger.info("=" * 65)
        await asyncio.get_event_loop().run_in_executor(None, stop_event.wait)
        server.close()

def run(config, stop_event=None):
    global _config
    _config = config

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
                logger.info(f"  Mapeado: SN={sn} → '{t['nome']}' (local: {t.get('local', '-')})")
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

    # Thread de reload periódico de terminais
    threading.Thread(
        target=ciclo_reload_terminais,
        args=(app_id, api_key, stop_event),
        name="ws-reload", daemon=True
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
    parser = argparse.ArgumentParser(description="Timmy WebSocket Server — NOC Monitor v2.0")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--port",  type=int, default=DEFAULT_WS_PORT)
    args = parser.parse_args()
    setup_logging(args.debug)

    cfg = load_config()
    if not cfg:
        logger.error(f"config.json ausente ou inválido. Verifique {CONFIG_FILE}")
        sys.exit(1)

    if args.port:
        cfg["WS_PORT"] = args.port

    sys.exit(run(cfg) or 0)