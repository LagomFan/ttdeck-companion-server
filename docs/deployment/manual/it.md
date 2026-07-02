# Configurazione manuale di TTDeck Companion Server

Questa guida ti aiuta a distribuire TTDeck Companion Server sul tuo NAS, server, VPS o computer, e poi ad associarlo all'app iPhone.

Companion Server e un ponte in sola lettura. Legge il database TeslaMate Postgres e, se abilitati, i dati realtime MQTT, poi fornisce una API all'app TTDeck per iPhone. Lo sviluppatore di TTDeck non riceve i dati del veicolo.

## 1. Scegliere la modalita di accesso

TTDeck non richiede per forza un URL pubblico. L'URL del server deve solo essere raggiungibile dal tuo iPhone.

| Modalita | URL di esempio | Ideale per | Nota |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | Uso sul Wi-Fi di casa | Non funziona fuori da quella rete |
| HTTPS pubblico | `https://ttdeck.example.com` | Accesso fuori casa | Richiede HTTPS, DNS e una rotta pubblica |
| Test locale | `http://127.0.0.1:4020` | Simulatore o stessa macchina | Non usarlo su un iPhone reale |

Su un iPhone reale, `127.0.0.1` indica l'iPhone stesso, non il NAS, il Mac o il server.

## 2. Requisiti

- Una installazione TeslaMate funzionante con dati veicolo.
- Un dispositivo che possa eseguire Docker Compose.
- Il pacchetto di rilascio o la cartella sorgente di TTDeck Companion Server.
- Un URL server raggiungibile dall'iPhone.
- HTTPS se esponi il servizio pubblicamente.

Inizia con MQTT e push remoto disattivati. Aggiungili solo dopo che i dati veicolo di base funzionano.

## 3. Generare i segreti

Esegui sul server:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Usa il primo valore come `TOKEN_SECRET` e il secondo come `SETUP_SECRET`.

Non condividere questi valori in post pubblici, screenshot, ticket di supporto o chat AI.

## 4. Creare un utente database in sola lettura

Esegui nel database Postgres di TeslaMate:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

Non eliminare o modificare l'utente database originale di TeslaMate. Aggiungi un utente separato in sola lettura per TTDeck.

## 5. Configurare Companion Server

Dentro il pacchetto:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Modifica `docker-compose.yml`:

```yaml
environment:
  BIND_HOST: 0.0.0.0
  PORT: 4020
  PUBLIC_BASE_URL: <iphone-reachable-companion-url>
  DATA_SOURCE_MODE: teslamate
  TOKEN_SECRET: <generated-secret>
  SETUP_SECRET: <generated-setup-secret>
  TOKEN_STORE_PATH: /data/read-tokens.json
  DEVICE_SECRET_REQUIRED: "true"
  TESLAMATE_DB_HOST: <postgres-host>
  TESLAMATE_DB_PORT: 5432
  TESLAMATE_DB_NAME: teslamate
  TESLAMATE_DB_USER: ttdeck_readonly
  TESLAMATE_DB_PASSWORD: <readonly-password>
  MQTT_ENABLED: "false"
```

`PUBLIC_BASE_URL` deve essere l'URL usato dall'iPhone, ad esempio `http://192.168.1.20:4020` o `https://ttdeck.example.com`.

## 6. Avviare e verificare

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

Controllo salute:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

La risposta attesa contiene:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Diagnostica:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Correggi qualsiasi `error` bloccante prima di associare l'app. MQTT in stato `limited` e accettabile per la prima configurazione.

## 7. Associare l'app iPhone

1. Apri TTDeck.
2. Apri Settings.
3. In Connect scegli la modalita Companion.
4. Inserisci `PUBLIC_BASE_URL` come URL server.
5. Tocca Save and Test.
6. Apri Access.
7. Inserisci `SETUP_SECRET`.
8. Tocca Bind With Setup Secret.
9. Torna alla schermata principale e aggiorna.

## 8. Controllo sicurezza

- `TOKEN_SECRET` e `SETUP_SECRET` non sono valori predefiniti.
- `TOKEN_STORE_PATH` punta a uno storage persistente.
- `DEVICE_SECRET_REQUIRED` e `"true"`.
- Companion Server usa un utente database in sola lettura.
- L'accesso pubblico usa HTTPS.
- Solo Companion Server e esposto.
- Postgres, TeslaMate e Grafana non sono esposti pubblicamente, a meno che tu li abbia protetti separatamente e ne comprenda il rischio.

## 9. Problemi comuni

- `/healthz` funziona ma l'app non ha dati: esegui `/api/setup/diagnostics`; health prova solo che il server risponde.
- `setup_forbidden`: manca l'header `x-setup-secret` oppure e errato.
- L'URL LAN non funziona fuori casa: e normale. Usa accesso remoto o HTTPS pubblico.
- `127.0.0.1` fallisce su iPhone: e normale. Usa IP del NAS/server o un dominio.
