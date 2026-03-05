# Base44 Agent — Instalação & Configuração

O **Base44 Agent** corre na rede local do cliente e atualiza o status dos terminais do tipo **IP Local** diretamente na plataforma.

---

## Como funciona

1. O agent lista todos os terminais via API da plataforma.
2. Para cada terminal `ip_local` (ou `p2s`), testa conectividade HTTP e depois TCP.
3. Atualiza `status`, `latencia_ms`, `ultimo_ping` e `ultimo_check` via API.
4. Repete a cada 30 segundos (configurável).

---

## Pré-requisitos

- Python 3.8+
- `pip install requests`

---

## Ficheiros

- `core_agent.py` — lógica principal (loop, testes, atualização)
- `agent_config.py` — assistente de configuração (grava `config.json`)
- `agent_cli.py` — entry point para correr como serviço (NSSM)
- `updater.py` — verificação e aplicação de atualizações automáticas

---

## Configuração rápida

```bash
python agent_config.py --api-key <API_KEY_DO_UTILIZADOR> --app-id <APP_ID> --yes
```

O `APP_ID` está disponível na URL da app: `https://app.base44.com/api/apps/<APP_ID>/...`

A `API_KEY` é gerada/definida na página de **Administração** da plataforma, na coluna "API Key" de cada utilizador.

O ficheiro de configuração é guardado em:
- **Windows:** `C:\ProgramData\Base44Agent\config.json`

---

## Correr manualmente (teste)

```bash
python agent_cli.py --once --log-level DEBUG
```

---

## Instalar como serviço Windows (NSSM)

```bash
nssm install Base44Agent python "C:\caminho\agent_cli.py" --interval 30
nssm set Base44Agent AppDirectory C:\caminho
nssm start Base44Agent
```

---

## Notas importantes

- Terminais **IP Local** só podem ser monitorizados pelo Agente Local — o servidor cloud não consegue alcançar IPs privados (`192.168.x.x`).
- O botão "Verificar" na plataforma retorna o último estado conhecido para terminais IP Local (geridos pelo agent).
- O agent atualiza automaticamente a plataforma a cada ciclo, sem necessidade de interação manual.