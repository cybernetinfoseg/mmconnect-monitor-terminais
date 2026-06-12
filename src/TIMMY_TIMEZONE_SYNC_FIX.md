# Correcao: Sincronizacao Dinamica de Timezone para Timmy WebSocket Server

## Problema
Ao alterar o timezone no NOC Monitor (ex: America/Sao_Paulo para Europe/Lisbon), o servidor sincroniza internamente mas NAO envia comando `settime` aos terminais conectados. O terminal continua com a hora anterior.

## Solucao
Adicione a deteccao de mudanca de timezone no ciclo de reload e envie comando `settime` automaticamente.

## Mudancas Necessarias no timmy_ws_server.py

### 1. No inicio da funcao `ciclo_reload_terminais()`, adicione uma variavel global para rastrear o timezone anterior:

```python
def ciclo_reload_terminais(stop_event=None):
    global sn_to_terminal, sn_to_nome, USER_TIMEZONE
    last_timezone = USER_TIMEZONE  # <-- ADICIONE ESTA LINHA
    while not (stop_event and stop_event.is_set()):
```

### 2. Dentro do loop `while`, APOS atualizar os mapas de terminais, adicione a verificacao de mudanca de timezone:

```python
            sn_to_terminal = new_map
            sn_to_nome     = new_nomes
            
            # ADICIONE ESTE BLOCO INTEIRO:
            if USER_TIMEZONE != last_timezone:
                logger.info(f"[RELOAD] Timezone alterado: {last_timezone} -> {USER_TIMEZONE}")
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
            
            logger.info(f"[RELOAD] {len(sn_to_terminal)} terminais sincronizados | tz={USER_TIMEZONE}")
```

## Resultado
Quando alterar o timezone no NOC Monitor:
1. Sistema detecta mudanca em 60 segundos (ciclo de reload)
2. Automaticamente envia comando `settime` a TODOS os terminais conectados
3. Log mostra: `[RELOAD-SYNC] settime para 'Terminal Casa' (SN=AYSK02012617) tz=Europe/Lisbon`
4. Terminal recebe e aplica nova hora com novo timezone

## Teste
1. Reinicie timmy_ws_server.py
2. Altere timezone no NOC Monitor (ex: Europe/Lisbon -> America/Sao_Paulo)
3. Aguarde max 60 segundos
4. Verificar logs para confirmar que comando settime foi enviado
5. Conferir hora no terminal