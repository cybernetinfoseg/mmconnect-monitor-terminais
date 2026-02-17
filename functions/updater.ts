import os
import requests
import subprocess
import sys
import tempfile

VERSION = "1.0.0"
SERVICE_NAME = "Base44Agent"
APP_ID_DEFAULT = "697aa46c9998c30665e2e19a"


def get_check_url(app_id):
    return f"https://app.base44.com/api/apps/{app_id}/functions/agentVersion/invoke"


def get_latest(app_id, api_key):
    try:
        url = get_check_url(app_id)
        r = requests.post(url, headers={"api_key": api_key}, json={}, timeout=10)
        r.raise_for_status()
        return r.json()
    except:
        return None


def download_file(url):
    try:
        r = requests.get(url, stream=True, timeout=30)
        r.raise_for_status()

        temp_path = os.path.join(tempfile.gettempdir(), "agent_new.exe")

        with open(temp_path, "wb") as f:
            for chunk in r.iter_content(8192):
                f.write(chunk)

        return temp_path
    except:
        return None


def replace_and_restart(new_exe):
    try:
        current_exe = sys.executable

        # parar serviço
        subprocess.run(["sc", "stop", SERVICE_NAME], capture_output=True)

        # copiar por cima
        subprocess.run(["cmd", "/c", "copy", "/Y", new_exe, current_exe], capture_output=True)

        # iniciar serviço novamente
        subprocess.run(["sc", "start", SERVICE_NAME], capture_output=True)
    except:
        pass


def check_update(app_id=APP_ID_DEFAULT, api_key=None):
    data = get_latest(app_id, api_key)
    if not data:
        return

    if data.get("version") == VERSION:
        return

    new_file = download_file(data["url"])
    if not new_file:
        return

    replace_and_restart(new_file)