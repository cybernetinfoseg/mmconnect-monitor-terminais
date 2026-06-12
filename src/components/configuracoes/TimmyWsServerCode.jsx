import React, { useState } from 'react';
import { Copy, Check, Download, Server, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const TIMMY_WS_CODE = `# timmy_ws_server.py — NOC Monitor: Servidor WebSocket Cloud Ultimate (Protocolo Timmy/THbio)
# ✅ VERSÃO DINÂMICA v3.1: Sincronização de Timezone + Fix seg_offline inflado após timezone change
# Compatível com: Timmy TM-AI07F, TM-AIFace11F, TFS30, TFS50 e outros modelos THbio
# Protocolo: WebSocket + JSON (RFC 6455) — porta padrão 7788 (configurável)
#
# O terminal conecta-se ao servidor WebSocket e envia:
#   1. cmd:"reg"      — registo inicial com SN, modelo, firmware → hora atualizada com timezone do NOC
#   2. cmd:"sendlog"  — logs de presença → gravados automaticamente na BD
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
# Config: C:\\ProgramData\\TimmyWSServer\\config.json
# {
#   "API_KEY":           "a_sua_api_key_pessoal",
#   "APP_ID":            "697aa46c9998c30665e2e19a",
#   "WS_PORT":           7788,
#   "CTRL_PORT":         7789,
#   "INTERVALO_REPORT":  30
# }
#
# Instalação (Windows):
#   pip install websockets requests
#   nssm install TimmyWSServer "C:\\Python311\\python.exe" "C:\\Program Files\\TimmyWSServer\\timmy_ws_server.py"
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
from datetime import datetime
from zoneinfo import ZoneInfo  # Python 3.9+ nativo
import requests

try:
    import websockets
    from websockets.asyncio.server import serve
except ImportError:
    print("ERRO: instale 'websockets>=12' com: pip install websockets")
    sys.exit(1)

# ──────────────────────────────────────────────────────────────
# Constantes, Paths e Estados em Memória
# ──────────────────────────────────────────────────────────────
PROGRAMDATA  = os.environ.get("PROGRAMDATA", r"C:\\ProgramData")
APP_DIR      = os.path.join(PROGRAMDATA, "TimmyWSServer")
CONFIG_FILE  = os.path.join(APP_DIR, "config.json")
LOG_FILE     = os.path.join(APP_DIR, "timmy_ws.log")

DEFAULT_WS_PORT   = 7788
DEFAULT_CTRL_PORT = 7789
OFFLINE_TIMEOUT   = 90    # segundos sem mensagem → considera offline
RECONNECT_GRACE   = 30    # segundos de graça após desconexão antes de reportar offline
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
USER_TIMEZONE = "Europe/Lisbon"  # Fuso de fallback — atualizado via API na nuvem


# ──────────────────────────────────────────────────────────────
# Helper: Hora sincronizada com timezone da conta NOC Monitor
# ──────────────────────────────────────────────────────────────
def obter_hora_sincronizada():
    """Retorna hora formatada no fuso horário configurado pelo utilizador no NOC Monitor."""
    global USER_TIMEZONE
    try:
        tz = ZoneInfo(USER_TIMEZONE)
        return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        logger.warning(f"[TIMEZONE] Erro com tz '{USER_TIMEZONE}', usando UTC: {e}")
        from datetime import timezone as _tz
        return datetime.now(_tz.utc).strftime("%Y-%m-%d %H:%M:%S")


# ──────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────
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


# ──────────────────────────────────────────────────────────────
# API Helpers (usam _config global — sem passar parâmetros)
# ──────────────────────────────────────────────────────────────
def _headers():
    return {"X-Api-Key": _config.get("API_KEY", ""), "Content-Type": "application/json"}

def _api_url(func):
    app_id = _config.get("APP_ID", "")
    return f"{BASE_URL.format(app_id=app_id)}/{func}"

def listar_terminais_ws():
    """Busca terminais websocket_cloud e sincroniza o timezone do utilizador NOC Monitor."""
    global USER_TIMEZONE
    r = requests.post(_api_url("nocServerGetTerminals"), headers=_headers(), json={}, timeout=10)
    r.raise_for_status()
    data = r.json()
    if not data.get("success"):
        raise ValueError(f"nocServerGetTerminals erro: {data}")
    # Sincronizar timezone da conta do utilizador NOC Monitor
    cloud_tz = data.get("user_timezone") or data.get("timezone")
    if cloud_tz:
        USER_TIMEZONE = cloud_tz
        logger.info(f"[TIMEZONE] Fuso horário sincronizado: {USER_TIMEZONE}")
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
    try:
        enrollid = int(rec.get("enrollid", 0))
    except Exception:
        enrollid = 0

    if enrollid <= 0 or enrollid >= 99999999:
        logger.warning(f"[FILTRO] enrollid inválido ignorado no terminal '{terminal_nome}' (enrollid={enrollid}).")
        return None

    raw_mode = rec.get("mode", 0)
    modo = MODE_MAP.get(raw_mode, "desconhecido")

    ts_str = rec.get("time", "")
    try:
        dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
        timestamp = dt.isoformat() + "Z"
    except Exception:
        timestamp = ts_str

    # Tentar extrair tipo entrada/saída
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


# ──────────────────────────────────────────────────────────────
# Handler WebSocket (Conexão Física do Hardware)
# ──────────────────────────────────────────────────────────────
async def handle_terminal(websocket):
    peer = websocket.remote_address
    sn   = None
    logger.info(f"[WS] Nova ligação de {peer[0]}:{peer[1]}")

    try:
        async for raw_msg in websocket:
            try:
                data = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning(f"[WS] Mensagem inválida de {peer[0]}: {raw_msg[:100]}")
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

            # ── 1. REGISTO ──────────────────────────────────────────
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
                    logger.warning(f"[WS] SN={sn} não mapeado — adicione o número de série no painel NOC Monitor")
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
                logger.info(f"[WS] ✅ '{nome}' (SN={sn}) ONLINE | IP={peer[0]} | hora→terminal: {hora_enviada} | tz: {USER_TIMEZONE}")

            # ── 2. ENVIO DE LOGS (marcações) ────────────────────────
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

            # ── 3. ENVIO DE DADOS DE UTILIZADOR ─────────────────────
            elif cmd == "senduser":
                enrollid  = data.get("enrollid")
                backupnum = data.get("backupnum", -1)
                logger.debug(f"[WS] SENDUSER SN={sn} enrollid={enrollid} backupnum={backupnum}")
                await websocket.send(json.dumps({
                    "ret": "senduser", "result": True,
                    "cloudtime": obter_hora_sincronizada(),
                }))

            # ── 4. HEARTBEAT ────────────────────────────────────────
            elif cmd in {"heartbeat", "ping"}:
                await websocket.send(json.dumps({
                    "ret": cmd, "result": True,
                    "cloudtime": obter_hora_sincronizada(),
                }))

            # ── 5. RESPOSTAS A COMANDOS ENVIADOS PELO NOC ───────────
            elif ret:
                with pending_lock:
                    matched = False
                    for (cmd_sn, cmd_id), future in list(pending_commands.items()):
                        if cmd_sn == sn:
                            if not future.done():
                                future.set_result(data)
                            del pending_commands[(cmd_sn, cmd_id)]
                            logger.debug(f"[WS] Resposta correlacionada '{ret}' de SN={sn}")
                            matched = True
                            break
                    if not matched:
                        logger.debug(f"[WS] Resposta não correlacionada de SN={sn}: {data}")

            # ── 6. COMANDO DESCONHECIDO ──────────────────────────────
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
        Envia comando e aguarda a resposta do terminal via sistema de futures (UUID por comando).
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
        self.send_header("Content-Length", str(len(body)))
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
def ciclo_reporte_ws(intervalo=30, stop_event=None):
    """Thread de reporte periódico para o NOC Monitor."""
    logger.info(f"[REPORT-WS] Ciclo de reporte activo — intervalo={intervalo}s")
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

            # Período de graça após desconexão — evita falso offline em reconexão
            if not connected and disconnected_at and (time.time() - disconnected_at) < RECONNECT_GRACE:
                continue

            # Calcular segundos offline usando disconnected_at (mais preciso que last_seen)
            # Evita valores inflados quando o servidor reiniciou ou last_seen é muito antigo
            if not connected and last_seen > 0:
                ref_time = disconnected_at if disconnected_at and disconnected_at > last_seen else last_seen
                seg_offline = int(time.time() - ref_time)
            else:
                seg_offline = 0
            status = "online" if connected else "offline"

            try:
                reportar_status_ws(tid, status, None, seg_offline)
                logger.info(f"[REPORT-WS] '{nome}' (SN={sn}) → {status.upper()}"
                            + (f" offline={seg_offline}s" if seg_offline else ""))
            except Exception as e:
                logger.error(f"[REPORT-WS] Erro ao reportar '{nome}': {e}")


# ──────────────────────────────────────────────────────────────
# Reload periódico de terminais + timezone (a cada 60s)
# ──────────────────────────────────────────────────────────────
def ciclo_reload_terminais(stop_event=None):
    """Sincroniza terminais e timezone da nuvem a cada 60 segundos."""
    global sn_to_terminal, sn_to_nome
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
            # Garantir que terminais offline sem disconnected_at o tenham definido agora
            # (evita seg_offline inflado após restart do servidor)
            now = time.time()
            with ws_lock:
                for sn_k, st in ws_state.items():
                    if not st.get("connected") and not st.get("disconnected_at"):
                        ws_state[sn_k]["disconnected_at"] = now
            logger.info(f"[RELOAD] {len(sn_to_terminal)} terminais sincronizados | tz={USER_TIMEZONE}")
        except Exception as e:
            logger.error(f"[RELOAD] Erro ao recarregar: {e}")


# ──────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────
async def main_async(ws_port, stop_event):
    async with serve(handle_terminal, "0.0.0.0", ws_port, ping_interval=None) as server:
        logger.info("=" * 65)
        logger.info(f"  Timmy WebSocket Server — NOC Monitor v3.0 (Timezone Dinâmico)")
        logger.info(f"  Porta WebSocket (terminais): {ws_port}")
        logger.info(f"  Porta HTTP controlo (NOC Monitor): {_config.get('CTRL_PORT', DEFAULT_CTRL_PORT)}")
        logger.info(f"  Terminais mapeados: {len(sn_to_terminal)}")
        logger.info(f"  Fuso horário activo: {USER_TIMEZONE}")
        logger.info(f"  Gravação automática de marcações: ACTIVA")
        logger.info(f"  Reload terminais + timezone: cada 60s")
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

    # Carregar terminais e timezone no arranque
    try:
        terminais = listar_terminais_ws()
        for t in terminais:
            sn = (t.get("numero_serie") or "").strip()
            if sn:
                sn_to_terminal[sn] = t["id"]
                sn_to_nome[sn]     = t.get("nome", sn)
                logger.info(f"  Mapeado: SN={sn} → '{t['nome']}' (local: {t.get('local', '-')})")
            else:
                logger.warning(f"  Terminal '{t['nome']}' sem número de série — ignorado")
        logger.info(f"Total: {len(sn_to_terminal)} terminal(is) | Timezone: {USER_TIMEZONE}")
    except Exception as e:
        logger.error(f"Não foi possível carregar terminais: {e}")

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
            logger.error(f"Falha ao ler config.json: {e}")
    return None


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Timmy WebSocket Server — NOC Monitor v3.0")
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
`;

const SECTIONS = [
  {
    key: 'ws',
    label: 'WebSocket Persistente',
    color: 'violet',
    badge: 'WS',
    desc: 'Terminal conecta via WebSocket e mantém ligação permanente. Heartbeat explícito + via sendlog.',
  },
  {
    key: 'log',
    label: 'Marcações Automáticas',
    color: 'emerald',
    badge: 'BD',
    desc: 'cmd:"sendlog" grava marcações via admsReport. Deduplicação por janela de 30s no servidor.',
  },
  {
    key: 'ctrl',
    label: 'Controlo Remoto',
    color: 'blue',
    badge: 'CMD',
    desc: 'POST /cmd envia comandos (opendoor, lockctrl, reboot…) ao terminal via WS com resposta.',
  },
  {
    key: 'reload',
    label: 'Reload Automático',
    color: 'orange',
    badge: 'AUTO',
    desc: 'Novos terminais adicionados ao NOC são detectados automaticamente a cada 5 minutos.',
  },
];

const MODELS = [
  'TM-AI07F', 'TM-AIFace11F', 'TM-AI08', 'TFS30', 'TFS50', 'TM3800', 'TM20',
];

const MODE_TABLE = [
  { mode: '1',  label: 'fp',   desc: 'Impressão Digital' },
  { mode: '3',  label: 'card', desc: 'Cartão RFID' },
  { mode: '4',  label: 'pw',   desc: 'Senha' },
  { mode: '8',  label: 'face', desc: 'Reconhecimento Facial' },
  { mode: '10', label: 'face', desc: 'Face AI' },
  { mode: '50', label: 'face', desc: 'Foto (AI device)' },
];

export default function TimmyWsServerCode() {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(TIMMY_WS_CODE);
    setCopied(true);
    toast.success('Código copiado!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownload = () => {
    const blob = new Blob([TIMMY_WS_CODE], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'timmy_ws_server.py';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('timmy_ws_server.py descarregado!');
  };

  return (
    <div className="space-y-4">

      {/* Versão e modelos */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold bg-violet-100 text-violet-800 px-2 py-1 rounded-full">v3.1</span>
          <span className="text-xs text-slate-500">Timezone dinâmico + fix seg_offline inflado após mudança de região</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {MODELS.map(m => (
            <span key={m} className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono">{m}</span>
          ))}
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">e outros THbio...</span>
        </div>
      </div>

      {/* Funcionalidades */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SECTIONS.map(s => (
          <div key={s.key} className={`p-3 rounded-xl border bg-${s.color}-50 border-${s.color}-200 space-y-1`}>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-${s.color}-200 text-${s.color}-800`}>{s.badge}</span>
              <span className={`font-semibold text-sm text-${s.color}-900`}>{s.label}</span>
            </div>
            <p className={`text-xs text-${s.color}-700`}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Config JSON */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono space-y-0.5">
        <p className="text-slate-500 font-sans font-semibold mb-2 text-xs">📄 C:\ProgramData\TimmyWSServer\config.json</p>
        <p className="text-slate-700">{`{`}</p>
        <p className="text-slate-700 pl-4">{`"API_KEY":          "a_sua_api_key_pessoal",`}</p>
        <p className="text-slate-700 pl-4">{`"APP_ID":           "697aa46c9998c30665e2e19a",`}</p>
        <p className="text-slate-700 pl-4 text-violet-700">{`"WS_PORT":          7788,`}</p>
        <p className="text-slate-700 pl-4 text-blue-700">{`"CTRL_PORT":        7789,`}</p>
        <p className="text-slate-700 pl-4">{`"INTERVALO_REPORT": 30`}</p>
        <p className="text-slate-700">{`}`}</p>
      </div>

      {/* Endpoints HTTP */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1.5">
        <p className="font-semibold text-slate-800">🔌 Endpoints HTTP do servidor (porta 7789)</p>
        <div className="space-y-1">
          <div className="flex gap-2 items-start">
            <code className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded shrink-0">POST /cmd</code>
            <span>Envia comando remoto ao terminal <em>(opendoor, lockctrl, reboot, settime, getuserlist…)</em></span>
          </div>
          <div className="flex gap-2 items-start">
            <code className="bg-slate-100 px-1.5 py-0.5 rounded shrink-0">GET /status</code>
            <span>Lista todos os terminais conectados com estado, IP e devinfo</span>
          </div>
          <div className="flex gap-2 items-start">
            <code className="bg-slate-100 px-1.5 py-0.5 rounded shrink-0">GET /status/&lt;sn&gt;</code>
            <span>Estado detalhado de um terminal específico pelo número de série</span>
          </div>
        </div>
      </div>

      {/* Modos de verificação */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
        <p className="font-semibold text-slate-800">🔢 Modos de verificação (campo "mode" no sendlog)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {MODE_TABLE.map(m => (
            <div key={m.mode} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded px-2 py-1">
              <code className="font-mono text-slate-500 w-5 text-right shrink-0">{m.mode}</code>
              <span className="text-slate-400">→</span>
              <span className="font-medium text-slate-700">{m.label}</span>
              <span className="text-slate-400 truncate">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Firewall */}
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
        <p className="font-semibold">🔥 Portas a abrir no Firewall Windows</p>
        <p>• <strong>7788 TCP</strong> — WebSocket: entrada dos terminais Timmy (WS_PORT)</p>
        <p>• <strong>7789 TCP</strong> — HTTP: controlo remoto NOC Monitor (CTRL_PORT) — <em>apenas acessível pelo Base44</em></p>
        <p className="text-amber-700 mt-1">Configure em: <em>Windows Defender Firewall → Regras de Entrada → Nova Regra → Porta TCP → 7788, 7789</em></p>
      </div>

      {/* Configuração no terminal */}
      <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg text-xs text-violet-800 space-y-2">
        <p className="font-semibold">⚙️ Configuração no terminal Timmy</p>
        <p>Aceda ao terminal: <strong>MENU → Comm Set → Server</strong></p>
        <div className="font-mono bg-violet-100 px-2 py-2 rounded space-y-0.5">
          <p>Server Req: <strong>Yes</strong></p>
          <p>Use domainNm: <strong>Yes</strong> (ou No se usar IP)</p>
          <p>DomainNm: <strong>SEU_IP_OU_DOMINIO</strong></p>
          <p>SerPortNo: <strong>7788</strong></p>
          <p>Heartbeat: <strong>3s</strong></p>
          <p>Server approval: <strong>No</strong></p>
        </div>
        <p className="text-violet-700">⚠️ O <strong>número de série (SN)</strong> deve ser registado no NOC Monitor ao criar o terminal. Obtenha-o via: <em>MENU → Sys Info → Info → SN</em></p>
      </div>

      {/* Passos instalação */}
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
        <p className="font-semibold">⚡ Instalação no Windows Server</p>
        <p>1. Python 3.9+ → <code className="bg-emerald-100 px-1 rounded">pip install websockets requests</code></p>
        <p>2. Copiar <code className="bg-emerald-100 px-1 rounded">timmy_ws_server.py</code> para <code className="bg-emerald-100 px-1 rounded">C:\Program Files\TimmyWSServer\</code></p>
        <p>3. Criar <code className="bg-emerald-100 px-1 rounded">C:\ProgramData\TimmyWSServer\config.json</code> com as suas credenciais</p>
        <p>4. Instalar como serviço Windows com NSSM:</p>
        <code className="bg-emerald-100 px-2 py-1 rounded block mt-1">
          nssm install TimmyWSServer "C:\Python311\python.exe" "C:\Program Files\TimmyWSServer\timmy_ws_server.py"
        </code>
        <code className="bg-emerald-100 px-2 py-1 rounded block mt-1">
          nssm start TimmyWSServer
        </code>
        <p className="mt-1">5. Verificar: <code className="bg-emerald-100 px-1 rounded">curl http://localhost:7789/status</code></p>
      </div>

      {/* Adicionar terminal */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
        <p className="font-semibold">📋 Como adicionar um terminal Timmy no NOC Monitor</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Ir a <strong>Terminais → Adicionar Terminal</strong></li>
          <li>Seleccionar <strong>Fabricante: Timmy</strong></li>
          <li>Seleccionar <strong>Tipo de Conexão: WebSocket Cloud</strong></li>
          <li>Inserir o <strong>Número de Série (SN)</strong> do terminal</li>
          <li>O servidor recarrega automaticamente novos terminais + timezone a cada <strong>60 segundos</strong></li>
          <li>Ou forçar reload imediato via: <code className="bg-blue-100 px-1 rounded">curl http://&lt;servidor&gt;:7789/status</code></li>
        </ol>
      </div>

      {/* Novidades v3 */}
      <div className="p-3 bg-slate-800 rounded-lg text-xs text-slate-300 space-y-1.5">
        <p className="font-semibold text-white">🆕 Novidades v3.1 — Fix seg_offline inflado</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {[
            ['Timezone', 'Sincronizado da conta NOC Monitor (Configurações → Conta)'],
            ['cloudtime', 'Hora correta enviada ao terminal no reg, sendlog, heartbeat'],
            ['ZoneInfo', 'Python nativo — DST (horário verão) automático'],
            ['Reload 60s', 'Terminais e timezone sincronizados a cada 60 segundos'],
            ['RECONNECT_GRACE', 'Período de graça 30s evita falso offline em reconexão'],
            ['seg_offline fix', 'Usa disconnected_at em vez de last_seen — evita valores inflados após restart ou timezone change'],
            ['reload fix', 'Reload define disconnected_at em terminais offline sem referência temporal'],
            ['Filtro enrollid', 'IDs inválidos/sistema ignorados automaticamente'],
            ['inout/InOutStatus', 'Suporte nativo a tipo entrada/saída'],
            ['websockets v12+', 'API asyncio moderna (from websockets.asyncio.server)'],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <span className="text-emerald-400 shrink-0">✓</span>
              <span><strong className="text-white">{k}</strong>: {v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Botões download */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Server className="h-4 w-4 text-slate-500" />
          timmy_ws_server.py — v3.1
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setExpanded(v => !v)}>
            {expanded ? <><ChevronUp className="h-4 w-4 mr-1" />Ocultar</> : <><ChevronDown className="h-4 w-4 mr-1" />Ver código</>}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </Button>
        </div>
      </div>

      {expanded && (
        <pre className="bg-slate-900 text-emerald-400 p-4 rounded-lg text-xs overflow-x-auto max-h-[600px] overflow-y-auto font-mono leading-relaxed whitespace-pre">
          {TIMMY_WS_CODE}
        </pre>
      )}
    </div>
  );
}