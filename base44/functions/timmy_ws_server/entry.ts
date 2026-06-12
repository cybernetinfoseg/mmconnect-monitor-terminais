import os, sys, json, time, logging, asyncio, threading, uuid
from logging.handlers import RotatingFileHandler
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from zoneinfo import ZoneInfo
import requests

try:
    import websockets
    from websockets.asyncio.server import serve
except ImportError:
    print("ERRO: instale 'websockets>=12' com: pip install websockets")
    sys.exit(1)

PROGRAMDATA  = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
APP_DIR      = os.path.join(PROGRAMDATA, "TimmyWSServer")
CONFIG_FILE  = os.path.join(APP_DIR, "config.json")
LOG_FILE     = os.path.join(APP_DIR, "timmy_ws.log")

DEFAULT_WS_PORT   = 7788
DEFAULT_CTRL_PORT = 7789
OFFLINE_TIMEOUT   = 90
RECONNECT_GRACE   = 30
BASE_URL = "https://app.base44.app/api/apps/{app_id}/functions"

logger = logging.getLogger("timmy_ws")

ws_state = {}
ws_lock  = threading.Lock()

sn_to_terminal = {}
sn_to_nome     = {}

ws_connections = {}
ws_conn_lock   = threading.Lock()

pending_commands = {}
pending_lock     = threading.Lock()

_config = {}
USER_TIMEZONE = "Europe/Lisbon"


def obter_hora_sincronizada():
    global USER_TIMEZONE
    try:
        tz = ZoneInfo(USER_TIMEZONE)
        return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        logger.warning(f"[TIMEZONE] Erro com tz '{USER_TIMEZONE}', usando UTC: {e}")
        from datetime import timezone as _tz
        return datetime.now(_tz.utc).strftime("%Y-%m-%d %H:%M:%S")


def setup_logging(debug=False):
    os.makedirs(APP_DIR, exist_ok=True)
    h   = RotatingFileHandler(LOG_FILE, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8")
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | [%(threadName)s] %(message)s", "%Y-%m-%d %H:%M:%S")
    h.setFormatter(fmt)
    logger.addHandler(h)
    logger.setLevel(logging.DEBUG if debug else logging.INFO)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    logger.addHandler(sh)


def _headers():
    return {"X-Api-Key": _config.get("API_KEY", ""), "Content-Type": "application/json"}

def _api_url(func):
    app_id = _config.get("APP_ID", "")
    return f"{BASE_URL.format(app_id=app_id)}/{func}"

def listar_terminais_ws():
    global USER_TIMEZONE
    r = requests.post(_api_url("nocServerGetTerminals"), headers=_headers(), json={}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"nocServerGetTerminals erro: {data}")
    cloud_tz = data.get("user_timezone") or data.get("timezone")
    if cloud_tz:
        USER_TIMEZONE = cloud_tz
        logger.info(f"[TIMEZONE] Fuso horario sincronizado: {USER_TIMEZONE}")
    return [t for t in data.get("terminals", []) if t.get("tipo_conexao") == "websocket_cloud"]

def reportar_status_ws(terminal_id, status, latencia_ms=None, segundos_sem_ping=0):
    payload = {
        "terminal_id":       terminal_id,
        "status":            status,
        "latencia_ms":       latencia_ms,
        "segundos_sem_ping": segundos_sem_ping,
    }
    try:
        r = requests.post(_api_url("nocServerReport"), headers=_headers(), json=payload, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.error(f"[NUVEM] Falha ao reportar {status} para {terminal_id}: {e}")
        return None

def gravar_marcacoes(terminal_id, terminal_nome, terminal_local, records):
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
        r = requests.post(_api_url("admsReport"), headers=_headers(), json=payload, timeout=15)
        r.raise_for_status()
        result = r.json()
        logger.info(f"[BD] Gravadas {len(records)} marcacoes para '{terminal_nome}': {result.get('saved', '?')} novas")
    except Exception as e:
        logger.error(f"[BD] Erro ao gravar marcacoes: {e}")


MODE_MAP = {
    1: "fp",
    3: "card",
    4: "pw",
    8: "face",
    10: "face",
    50: "face",
}

def parse_log_record(rec, terminal_id, terminal_nome, terminal_local):
    try:
        enrollid = int(rec.get("enrollid", 0))
    except Exception:
        enrollid = 0

    if enrollid <= 0 or enrollid >= 99999999:
        logger.warning(f"[FILTRO] enrollid invalido ignorado no terminal '{terminal_nome}' (enrollid={enrollid}).")
        return None

    raw_mode = rec.get("mode", 0)
    modo = MODE_MAP.get(raw_mode, "desconhecido")

    ts_str = rec.get("time", "")
    try:
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        timestamp = dt.isoformat() + "Z"
    except Exception:
        timestamp = ts_str

    tipo = "desconhecido"
    inout_val = rec.get("inout") or rec.get("InOutStatus") or rec.get("inoutStatus")
    if inout_val is not None:
        if inout_val in (0, "0", "entrada"):
            tipo = "entrada"
        elif inout_val in (1, "1", "saida"):
            tipo = "saida"
    elif timestamp:
        try:
            dt_parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            hora = dt_parsed.hour
            if 7 <= hora <= 12:
                tipo = "entrada"
            elif 16 <= hora <= 19:
                tipo = "saida"
        except Exception:
            pass

    return {
        "terminal_id":    terminal_id,
        "terminal_nome":  terminal_nome,
        "enrollid":       enrollid,
        "timestamp":      timestamp,
        "tipo":           tipo,
        "modo":           modo,
        "raw_mode":       raw_mode,
        "local":          terminal_local or "",
        "exportado":      False,
    }


async def handle_terminal(websocket):
    peer = websocket.remote_address
    sn   = None
    logger.info(f"[WS] Nova ligacao de {peer[0]}:{peer[1]}")

    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning(f"[WS] Mensagem invalida de {peer[0]}: {raw_msg[:100]}")
                continue

            cmd     = data.get("cmd", "")
            msg_sn  = data.get("sn", "")
            ret     = data.get("ret", "")

            if msg_sn and not sn:
                sn = msg_sn

            if sn:
                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["last_seen"] = time.time()
                        ws_state[sn]["connected"] = True

            if cmd == "reg":
                sn      = msg_sn
                devinfo = data.get("devinfo", {})
                nome    = sn_to_nome.get(sn, f"Terminal-{sn}")
                tid     = sn_to_terminal.get(sn)

                firmware  = devinfo.get("firmware", "?")
                modelname = devinfo.get("modelname", "?")
                hora_enviada = obter_hora_sincronizada()
                logger.info(f"[WS] REG: SN={sn} modelo={modelname} firmware={firmware} IP={peer[0]}")

                if not tid:
                    logger.warning(f"[WS] SN={sn} nao mapeado - adicione no painel NOC Monitor")
                    await websocket.send(json.dumps({
                        "ret": "reg", "result": True,
                        "cloudtime": hora_enviada, "nosenduser": True
                    }))
                    continue

                with ws_conn_lock:
                    ws_connections[sn] = (websocket, asyncio.get_event_loop())

                with ws_lock:
                    ws_state[sn] = {
                        "terminal_id":     tid,
                        "nome":            nome,
                        "connected":       True,
                        "last_seen":       time.time(),
                        "disconnected_at": None,
                        "devinfo":         devinfo,
                        "ip":              peer[0],
                        "local":           "",
                    }

                asyncio.create_task(asyncio.to_thread(reportar_status_ws, tid, "online"))

                await websocket.send(json.dumps({
                    "ret": "reg", "result": True,
                    "cloudtime": hora_enviada, "nosenduser": True,
                }))
                logger.info(f"[WS] OK '{nome}' (SN={sn}) ONLINE | IP={peer[0]} | tz: {USER_TIMEZONE}")

            elif cmd == "sendlog":
                count    = data.get("count", 0)
                records  = data.get("record", [])
                logindex = data.get("logindex", 0)

                tid  = sn_to_terminal.get(sn)
                nome = sn_to_nome.get(sn, sn)

                logger.info(f"[WS] SENDLOG SN={sn} count={count} logindex={logindex}")

                if records and tid:
                    with ws_lock:
                        estado = ws_state.get(sn, {})
                    local = estado.get("local", "")

                    parsed = []
                    for r in records:
                        p = parse_log_record(r, tid, nome, local)
                        if p is not None:
                            parsed.append(p)

                    if parsed:
                        threading.Thread(
                            target=gravar_marcacoes,
                            args=(tid, nome, local, parsed),
                            daemon=True
                        ).start()

                await websocket.send(json.dumps({
                    "ret": "sendlog", "result": True,
                    "count": count, "logindex": logindex,
                    "cloudtime": obter_hora_sincronizada(), "access": 1,
                }))

            elif cmd == "senduser":
                enrollid  = data.get("enrollid")
                backupnum = data.get("backupnum", -1)
                logger.debug(f"[WS] SENDUSER SN={sn} enrollid={enrollid} backupnum={backupnum}")
                await websocket.send(json.dumps({
                    "ret": "senduser", "result": True,
                    "cloudtime": obter_hora_sincronizada(),
                }))

            elif cmd in {"heartbeat", "ping"}:
                await websocket.send(json.dumps({
                    "ret": cmd, "result": True,
                    "cloudtime": obter_hora_sincronizada(),
                }))

            elif ret:
                with pending_lock:
                    matched = False
                    for (cmd_sn, cmd_id), future in list(pending_commands.items()):
                        if cmd_sn == sn:
                            if not future.done():
                                future.set_result(data)
                            del pending_commands[(cmd_sn, cmd_id)]
                            logger.debug(f"[WS] Resposta '{ret}' de SN={sn}")
                            matched = True
                            break
                    if not matched:
                        logger.debug(f"[WS] Resposta nao correlacionada de SN={sn}: {data}")

            else:
                logger.debug(f"[WS] Mensagem desconhecida de {peer[0]}: {data}")
                if cmd and "ret" not in data:
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
                    ws_state[sn]["disconnected_at"] = time.time()
            logger.info(f"[WS] Desconectado: SN={sn} ({peer[0]})")
        else:
            logger.info(f"[WS] Desconectado: {peer[0]} (sem registo)")


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
            self._respond(400, {"success": False, "error": "JSON invalido"})
            return

        sn      = (payload.get("sn") or "").strip()
        command = payload.get("command")

        if not sn or not command:
            self._respond(400, {"success": False, "error": "Campos sn e command obrigatorios"})
            return

        with ws_conn_lock:
            conn_data = ws_connections.get(sn)

        if not conn_data:
            tid = sn_to_terminal.get(sn)
            if tid:
                self._respond(503, {"success": False, "error": f"Terminal SN={sn} esta offline."})
            else:
                self._respond(404, {"success": False, "error": f"Terminal SN={sn} nao reconhecido."})
            return

        ws, loop = conn_data

        try:
            future = asyncio.run_coroutine_threadsafe(self._send_and_wait(ws, sn, command), loop)
            result = future.result(timeout=15)
            self._respond(200, {"success": True, "result": result})
        except asyncio.TimeoutError:
            self._respond(504, {"success": False, "error": "Terminal nao respondeu (Timeout)."})
        except Exception as e:
            self._respond(500, {"success": False, "error": str(e)})

    async def _send_and_wait(self, ws, sn, command):
        cmd_id = str(uuid.uuid4())[:8]
        loop = asyncio.get_event_loop()
        future = loop.create_future()

        with pending_lock:
            pending_commands[(sn, cmd_id)] = future

        try:
            msg_to_send = dict(command)
            msg_to_send["sn"] = sn

            await ws.send(json.dumps(msg_to_send))

            return await asyncio.wait_for(future, timeout=13)
        finally:
            with pending_lock:
                pending_commands.pop((sn, cmd_id), None)

    def do_GET(self):
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
                self._respond(404, {"success": False, "error": f"SN={sn} nao reconhecido"})

        else:
            self.send_response(404)
            self.end_headers()

    def _respond(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_ctrl_server(port, stop_event):
    try:
        server = HTTPServer(("0.0.0.0", port), CtrlHandler)
        server.timeout = 1
        logger.info(f"[CTRL] Servidor HTTP activo em http://0.0.0.0:{port}")
        logger.info(f"[CTRL]   POST /cmd")
        logger.info(f"[CTRL]   GET  /status")
        logger.info(f"[CTRL]   GET  /status/<sn>")
        while not stop_event.is_set():
            server.handle_request()
        server.server_close()
    except Exception as e:
        logger.error(f"[CTRL] Erro: {e}")


def ciclo_reporte_ws(intervalo=30, stop_event=None):
    logger.info(f"[REPORT-WS] Ativo - intervalo={intervalo}s")
    while not (stop_event and stop_event.is_set()):
        time.sleep(intervalo)
        with ws_lock:
            snapshot = dict(ws_state)

        for sn, estado in snapshot.items():
            tid             = estado.get("terminal_id")
            nome            = estado.get("nome", sn)
            connected       = estado.get("connected", False)
            last_seen       = estado.get("last_seen", 0)
            disconnected_at = estado.get("disconnected_at")

            if not tid:
                continue

            with ws_conn_lock:
                existe_socket_ativo = sn in ws_connections

            if connected and (time.time() - last_seen) > OFFLINE_TIMEOUT and not existe_socket_ativo:
                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["connected"] = False
                connected = False

            if existe_socket_ativo:
                connected = True
                with ws_lock:
                    if sn in ws_state:
                        ws_state[sn]["connected"] = True

            if not connected and disconnected_at and (time.time() - disconnected_at) < RECONNECT_GRACE:
                continue

            if not connected and last_seen > 0:
                ref_time = disconnected_at if disconnected_at and disconnected_at > last_seen else last_seen
                seg_offline = int(time.time() - ref_time)
            else:
                seg_offline = 0
            status = "online" if connected else "offline"

            try:
                reportar_status_ws(tid, status, None, seg_offline)
                logger.info(f"[REPORT-WS] '{nome}' (SN={sn}) - {status.upper()}" + (f" offline={seg_offline}s" if seg_offline else ""))
            except Exception as e:
                logger.error(f"[REPORT-WS] Erro: {e}")


def ciclo_reload_terminais(stop_event=None):
    global sn_to_terminal, sn_to_nome, USER_TIMEZONE
    last_timezone = USER_TIMEZONE
    while not (stop_event and stop_event.is_set()):
        time.sleep(60)
        try:
            terminais = listar_terminais_ws()
            new_map, new_nomes = {}, {}
            for t in terminais:
                sn = (t.get("numero_serie") or "").strip()
                if sn:
                    new_map[sn]   = t["id"]
                    new_nomes[sn] = t.get("nome", sn)
                    with ws_lock:
                        if sn in ws_state:
                            ws_state[sn]["local"] = t.get("local", "")
            sn_to_terminal = new_map
            sn_to_nome     = new_nomes

            if USER_TIMEZONE != last_timezone:
                logger.info(f"[RELOAD] Timezone alterado: {last_timezone} - {USER_TIMEZONE}")
                last_timezone = USER_TIMEZONE

                with ws_conn_lock:
                    sns_conectados = list(ws_connections.keys())

                for sn in sns_conectados:
                    try:
                        ws, loop = ws_connections.get(sn, (None, None))
                        if ws:
                            cmd = {
                                "cmd": "settime",
                                "sn": sn,
                                "cloudtime": obter_hora_sincronizada()
                            }
                            asyncio.run_coroutine_threadsafe(
                                ws.send(json.dumps(cmd)),
                                loop
                            )
                            nome = sn_to_nome.get(sn, sn)
                            logger.info(f"[RELOAD-SYNC] settime para '{nome}' (SN={sn}) tz={USER_TIMEZONE}")
                    except Exception as e:
                        logger.error(f"[RELOAD-SYNC] Erro SN={sn}: {e}")

            now = time.time()
            with ws_lock:
                for sn_k, st in ws_state.items():
                    if not st.get("connected") and not st.get("disconnected_at"):
                        ws_state[sn_k]["disconnected_at"] = now
            logger.info(f"[RELOAD] {len(sn_to_terminal)} terminais sincronizados | tz={USER_TIMEZONE}")
        except Exception as e:
            logger.error(f"[RELOAD] Erro: {e}")


async def main_async(ws_port, stop_event):
    async with serve(handle_terminal, "0.0.0.0", ws_port, ping_interval=None) as server:
        logger.info("=" * 65)
        logger.info(f"  Timmy WebSocket Server - NOC Monitor v3.1")
        logger.info(f"  Porta WebSocket: {ws_port}")
        logger.info(f"  Porta HTTP controlo: {_config.get('CTRL_PORT', DEFAULT_CTRL_PORT)}")
        logger.info(f"  Terminais mapeados: {len(sn_to_terminal)}")
        logger.info(f"  Timezone: {USER_TIMEZONE}")
        logger.info("=" * 65)
        await asyncio.get_event_loop().run_in_executor(None, stop_event.wait)
        server.close()

def run(config, stop_event=None):
    global _config, sn_to_terminal, sn_to_nome
    _config = config

    if stop_event is None:
        stop_event = threading.Event()

    ws_port   = config.get("WS_PORT", DEFAULT_WS_PORT)
    ctrl_port = config.get("CTRL_PORT", DEFAULT_CTRL_PORT)
    intervalo = config.get("INTERVALO_REPORT", 30)

    try:
        terminais = listar_terminais_ws()
        for t in terminais:
            sn = (t.get("numero_serie") or "").strip()
            if sn:
                sn_to_terminal[sn] = t["id"]
                sn_to_nome[sn]     = t.get("nome", sn)
                logger.info(f"  Mapeado: SN={sn} - '{t['nome']}'")
        logger.info(f"Total: {len(sn_to_terminal)} terminais")
    except Exception as e:
        logger.error(f"Erro ao carregar: {e}")

    threading.Thread(target=ciclo_reporte_ws, args=(intervalo, stop_event), name="ws-report", daemon=True).start()
    threading.Thread(target=start_ctrl_server, args=(ctrl_port, stop_event), name="ctrl-http", daemon=True).start()
    threading.Thread(target=ciclo_reload_terminais, args=(stop_event,), name="ws-reload", daemon=True).start()

    try:
        asyncio.run(main_async(ws_port, stop_event))
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
            logger.error(f"Erro: {e}")
    return None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Timmy WebSocket Server")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--port",  type=int, default=DEFAULT_WS_PORT)
    args = parser.parse_args()
    setup_logging(args.debug)

    cfg = load_config()
    if not cfg:
        logger.error(f"config.json ausente")
        sys.exit(1)

    if args.port:
        cfg["WS_PORT"] = args.port

    sys.exit(run(cfg) or 0)