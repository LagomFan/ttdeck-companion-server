# TTDeck Companion Server Manual Setup

This guide helps you deploy TTDeck Companion Server on your own NAS, server, VPS, or computer, then bind the iPhone app.

Companion Server is a read-only bridge. It reads your TeslaMate Postgres database and optional MQTT realtime data, then serves the TTDeck iPhone app. TTDeck's developer does not receive your vehicle data.

## 1. Choose Your Access Mode

TTDeck does not require a public URL. The server URL only needs to be reachable from your iPhone.

| Mode | Example URL | Best for | Note |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | Home Wi-Fi use | It will not work away from that network |
| Public HTTPS | `https://ttdeck.example.com` | Access away from home | Requires HTTPS, DNS, and a public route |
| Local test | `http://127.0.0.1:4020` | Simulator or same-machine test | Do not use this for a real iPhone |

On a real iPhone, `127.0.0.1` means the iPhone itself, not your NAS, Mac, or server.

## 2. Requirements

- A working TeslaMate installation with vehicle data.
- A device that can run Docker Compose.
- The TTDeck Companion Server release package or source folder.
- A server URL reachable from the iPhone.
- HTTPS if you expose the service publicly.

Start with MQTT and remote push disabled. Add them only after basic vehicle data works.

## 3. Generate Secrets

Run this on your server:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value as `TOKEN_SECRET` and the second as `SETUP_SECRET`.

Do not share these values in public posts, screenshots, support tickets, or AI chats.

## 4. Create A Read-Only Database User

Run this inside the TeslaMate Postgres database:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

Do not delete or change the original TeslaMate database user. Add a separate read-only user for TTDeck.

## 5. Configure Companion Server

Inside the release package:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Edit `docker-compose.yml`:

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

`PUBLIC_BASE_URL` must be the URL your iPhone will use, for example `http://192.168.1.20:4020` or `https://ttdeck.example.com`.

## 6. Start And Verify

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

Check health:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

Expected response includes:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Check diagnostics:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Fix any blocking `error` before binding the app. `limited` MQTT is acceptable for the first setup.

## 7. Bind The iPhone App

1. Open TTDeck.
2. Open Settings.
3. In Connect, choose Companion mode.
4. Enter `PUBLIC_BASE_URL` as the server URL.
5. Tap Save and Test.
6. Open Access.
7. Enter `SETUP_SECRET`.
8. Tap Bind With Setup Secret.
9. Return to the main screen and refresh.

## 8. Security Checklist

- `TOKEN_SECRET` and `SETUP_SECRET` are not default values.
- `TOKEN_STORE_PATH` points to persistent storage.
- `DEVICE_SECRET_REQUIRED` is `"true"`.
- Companion Server uses a read-only database user.
- Public access uses HTTPS.
- Only Companion Server is exposed.
- Postgres, TeslaMate, and Grafana are not exposed publicly unless you have separately secured them.

## 9. Common Issues

- `/healthz` works but the app has no data: run `/api/setup/diagnostics`; health only proves the server is alive.
- `setup_forbidden`: the `x-setup-secret` header is missing or wrong.
- LAN URL fails away from home: expected. Use your own remote access or public HTTPS.
- `127.0.0.1` fails on iPhone: expected. Use the NAS/server IP or domain.
