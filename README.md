# TTDeck Companion Server

Self-hosted read-only backend for the TTDeck iPhone app.

TTDeck Companion Server can run with fixture data for local demos, or read from
a user's own TeslaMate Postgres database and TeslaMate MQTT realtime topics. It
is designed for monitoring only. It must not control vehicles.

## Product Boundary

TTDeck Companion Server is open source. The official TTDeck iOS app is released
separately. This repository does not grant rights to reuse the TTDeck name,
icon, App Store assets, screenshots, startup media, or official app
implementation.

The iPhone app connects only to the Companion Server URL configured by the user.
The developer's server is not involved in the vehicle data flow.

## Deployment Guides

- Manual setup: [docs/deployment/manual-setup.md](docs/deployment/manual-setup.md)
- AI-assisted setup guide: [docs/deployment/ai-setup-guide.md](docs/deployment/ai-setup-guide.md)
- Release boundary: [docs/open-source-release-boundary.md](docs/open-source-release-boundary.md)

Public repository:

```bash
git clone https://github.com/LagomFan/ttdeck-companion-server.git
cd ttdeck-companion-server
```

## Run Locally

```bash
npm install
npm test
npm start
```

`GET /healthz` should return `{"ok":true,"data":{"status":"ok","service":"api"}}`.
The root route intentionally returns 404 so a public deployment does not expose
a setup page.

## Run With Docker

Copy `.env.example` to `.env`, edit the values locally, then run:

```bash
docker compose -f docker-compose.example.yml up --build
```

Do not commit `.env`, private docker compose files, database passwords, Tesla
tokens, APNs keys, VINs, exact home coordinates, or full route payloads.

## Data Boundary

The Companion Server is read-only. It reads from the user's TeslaMate,
Postgres, and MQTT environment and exposes summarized API responses to the
user's configured app client.

Public deployments should expose only this Companion Server. Do not expose
TeslaMate, Grafana, Postgres, MQTT, Tesla credentials, or Docker admin surfaces
directly to the internet.

## Environment

See [.env.example](.env.example) for a safe template.

Important variables:

- `BIND_HOST`: HTTP bind host. Defaults to `127.0.0.1`.
- `PORT`: HTTP port. Defaults to `4020`.
- `PUBLIC_BASE_URL`: URL encoded into pairing payloads. This must be reachable
  from the iPhone.
- `DATA_SOURCE_MODE`: `fixture` or `teslamate`.
- `TOKEN_SECRET`: HMAC secret used to hash read-only device tokens.
- `SETUP_SECRET`: Secret for setup-gated requests.
- `TOKEN_STORE_PATH`: JSON file path for persisted read-only device token
  hashes.
- `DEVICE_SECRET_REQUIRED`: When true, each read token must also bind to a
  per-device secret.
- `TESLAMATE_DATABASE_URL`: Optional Postgres URL for TeslaMate. Prefer a
  read-only database user.
- `TESLAMATE_DB_*`: Split TeslaMate Postgres connection fields.
- `MQTT_*`: Optional TeslaMate MQTT realtime ingestion settings.
- `PUSH_NOTIFICATIONS_ENABLED`: Enables the trip push monitor. Defaults to
  false.
- `APNS_*`: Optional advanced remote push settings. Disabled by default.

For production, create a read-only Postgres user for the Companion Server. The
server only issues `SELECT` queries, but database permissions should enforce
that boundary too.

## TeslaMate Mode

```bash
DATA_SOURCE_MODE=teslamate \
TESLAMATE_DATABASE_URL=postgres://readonly:<password>@127.0.0.1:5432/teslamate \
MQTT_ENABLED=true \
MQTT_URL=mqtt://127.0.0.1:1883 \
TOKEN_SECRET=<generated-long-random-secret> \
npm start
```

Postgres mode reads vehicles, latest position, battery, range, climate samples,
drive history, trip detail telemetry, recent charging sessions, and trends.

MQTT realtime mode reads live fields including lock, doors, windows, trunks,
sentry mode, tire pressure, plugged-in state, charging state, charge port door,
power, voltage, current, charge limit, requested current, time to full, and
scheduled charging start time.

## Remote Push Notifications

Remote APNs push is optional and disabled by default.

APNs is an advanced custom-build path. It requires an Apple Developer account,
Push Notifications capability, Team ID, Key ID, private key, bundle ID, and a
matching signed app. Users of the official App Store build should not enable
native APNs unless TTDeck later provides an official push relay.

Basic setup and complete backend data display do not require APNs.

## API

Public:

- `GET /healthz`
- `POST /api/bind/complete`

Setup-gated:

- `POST /api/bind/start`
- `GET /api/setup/diagnostics`
- `GET /api/bind/devices`
- `DELETE /api/bind/devices/:tokenHash`

Authenticated:

- `GET /api/vehicles`
- `GET /api/vehicles/:vehicleId/overview`
- `GET /api/vehicles/:vehicleId/safety`
- `GET /api/vehicles/:vehicleId/charging`
- `GET /api/vehicles/:vehicleId/trips?limit=30&cursor=...&query=...&from=...&to=...&filter=...&sort=...`
- `GET /api/vehicles/:vehicleId/trips/:tripId`
- `GET /api/vehicles/:vehicleId/trends`
- `GET /api/vehicles/:vehicleId/realtime`
- `GET /api/notifications/status`
- `POST /api/notifications/device-token`
- `DELETE /api/notifications/device-token`

## Binding Flow

```bash
PAIRING=$(curl -s -X POST http://127.0.0.1:4020/api/bind/start | node -e 'let input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>console.log(JSON.parse(input).data.pairingToken))')
TOKEN=$(curl -s -X POST http://127.0.0.1:4020/api/bind/complete -H 'content-type: application/json' -d "{\"pairingToken\":\"$PAIRING\",\"deviceName\":\"curl\"}" | node -e 'let input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>console.log(JSON.parse(input).data.readToken))')
curl -s -H "authorization: Bearer $TOKEN" http://127.0.0.1:4020/api/vehicles
```

Read tokens are returned only once during binding. The server stores token
hashes, not raw tokens. Use `GET /api/bind/devices` to list paired device token
hashes and `DELETE /api/bind/devices/:tokenHash` to revoke one.

## Security

See [SECURITY.md](SECURITY.md). Do not paste raw tokens, setup secrets, Tesla
tokens, database passwords, APNs private keys, VINs, exact home coordinates, or
full route payloads into public issues, logs, support requests, or AI chats.

## License

Companion Server code is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).
TTDeck brand assets and product identity are not licensed for reuse. See
[TRADEMARKS.md](TRADEMARKS.md).
