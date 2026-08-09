# TTDeck Companion Server AI Setup Guide

Send this Markdown link, or the full text of this file, to an AI assistant when you want help deploying or updating TTDeck Companion Server.

Canonical backend repository:

```text
https://github.com/LagomFan/ttdeck-companion-server
```

If the user has not downloaded the backend yet, ask them to clone it on the server or development machine:

```bash
git clone https://github.com/LagomFan/ttdeck-companion-server.git
cd ttdeck-companion-server
```

This document has two jobs:

1. Help a non-expert user deploy TTDeck Companion Server step by step.
2. Tell an AI assistant where to look and what to update when a future backend or deployment change is requested.

Use a full-experience flow. The default target is not a minimal server. First complete the Basic Setup, then force the Basic Validation Gate after the iPhone is bound. After that gate passes, continue into Full Data Setup for MQTT realtime data unless the user explicitly stops. After Full Data Setup passes, ask whether the user wants optional advanced add-ons such as APNs remote push, HTTPS, Tailscale, or VPN. The user may stop after any completed stage, but Basic Setup alone is not the complete TTDeck experience.

## Ground Rules For The AI Assistant

You are helping the user deploy their own TTDeck Companion Server. Follow these rules:

1. Work one layer at a time. Do not give ten steps before verifying the current step.
2. Do not ask for the user's Tesla account password.
3. Do not ask the user to paste database passwords, `TOKEN_SECRET`, `SETUP_SECRET`, APNs private keys, raw read tokens, or Tesla credentials into chat.
4. If a config example is needed, use `<redacted>` or `<generated-locally>` for secrets.
5. Do not tell the user to expose Postgres, TeslaMate, Grafana, MQTT, Docker, or a NAS admin panel to the public internet.
6. The iPhone only needs to reach TTDeck Companion Server. A public HTTPS URL is optional. A LAN/NAS address is valid when the user only needs home-network access.
7. For public access, prefer HTTPS and expose only the Companion Server surface.
8. For LAN-only access, clearly tell the user that TTDeck will not refresh outside that network unless they configure their own VPN, reverse proxy, tunnel, or remote access.
9. Do not use `http://127.0.0.1:4020` as the real iPhone URL. On a real iPhone, `127.0.0.1` means the iPhone itself.
10. If verification fails, debug only the current layer. Do not reinstall TeslaMate, wipe Docker volumes, rotate secrets, or rebuild the whole stack as a first response.
11. Do not publish, push, deploy, expose a new public endpoint, or change production data without explicit user confirmation.
12. Complete basic Postgres-backed data access before enabling MQTT realtime data or discussing APNs remote push, public access, or backend performance optimization.
13. After QR binding or setup-secret binding, you must run the Basic Validation Gate before enabling MQTT.
14. Full Data Setup is the default target. Do not present Basic Setup alone as the complete TTDeck experience. If the user explicitly stops after Basic Setup, summarize the missing realtime coverage.
15. Do not continue from Full Data Setup to optional advanced add-ons unless the user explicitly chooses a specific add-on.
16. APNs, public HTTPS, Tailscale, VPN, reverse proxy, tunnels, Grafana exposure, and TeslaMate public UI access are not required to make TTDeck's in-app data display complete.

## Full Experience Setup Flow

The AI assistant must follow this order:

1. **Version And Package Preflight**: confirm the user's Companion Server package, Docker image, or source checkout supports the endpoints and MQTT fields used by this guide.
2. **Basic Setup**: Postgres-backed Companion Server, iPhone reachability, app binding, and vehicle data loading.
3. **Basic Validation Gate**: mandatory after binding. This is a checkpoint, not the final target.
4. **Full Data Setup**: enable MQTT realtime fields so TTDeck can show all currently supported live app data.
5. **Full Validation Gate**: verify Postgres, MQTT, iPhone binding, and the main app surfaces.
6. **Optional Advanced Add-ons**: APNs remote push, HTTPS, Tailscale, VPN, reverse proxy, or other advanced self-hosted options.

Use this exact transition after Basic Validation passes:

```text
Basic layer is verified. TTDeck can reach Companion Server, diagnostics pass for Postgres and vehicle data, the iPhone is bound, and vehicle data loads.

Continue now to Full Data Setup. This enables MQTT realtime fields such as doors/windows, sentry mode, tire pressure, charge-port details, and live charging state. Without this step, the app may work but it is not the full TTDeck experience.
```

If the user explicitly stops here, summarize that Postgres-backed data works but MQTT realtime is still missing. Do not call that a full setup.

Use this exact stop/optional prompt after Full Validation passes:

```text
Full Data Setup is complete. Postgres-backed history and MQTT realtime fields are configured and verified.

You can stop here, or choose one optional advanced add-on: APNs remote push, HTTPS, Tailscale, VPN, or reverse proxy.

Do you want to stop here or configure one optional add-on?
```

If the user says stop, summarize what is configured and do not continue.

## What Success Means

Version And Package Preflight is complete only when all of these are true:

- The user is using a Companion Server package, Docker image, or source checkout that matches this guide.
- `GET /healthz` exists.
- `GET /api/setup/diagnostics` exists.
- `/api/bind/start` and `/api/bind/complete` exist for QR/setup binding.
- Authenticated `/api/vehicles`, `/api/vehicles/:id/overview`, `/api/vehicles/:id/safety`, `/api/vehicles/:id/charging`, `/api/vehicles/:id/trips`, `/api/vehicles/:id/trends`, and `/api/vehicles/:id/realtime` exist.
- The server supports the documented MQTT env vars if Full Data Setup will be completed.

Basic Setup is complete only when all of these are true:

- Companion Server is running.
- `GET /healthz` returns `ok=true`.
- `GET /api/setup/diagnostics` works with `x-setup-secret`.
- TeslaMate/Postgres/vehicle diagnostics have no blocking `error`.
- The iPhone can reach the same `PUBLIC_BASE_URL`.
- The iPhone app is bound to Companion Server.
- The iPhone app can load vehicle data.

Full Data Setup is complete only when Basic Setup is complete and all of these are also true:

- `MQTT_ENABLED=true` is configured.
- `GET /api/setup/diagnostics` reports `mqtt` as `ok`.
- MQTT realtime fields are received for at least one vehicle, or the app shows the selected live fields correctly.
- The iPhone app can refresh the selected vehicle and load Overview, Safety, Battery/Charging, Trips, and Trends without a blocking error.
- The user understands that optional APNs and public remote access are separate add-ons and do not add more in-app vehicle data.

Do not call any stage complete if only Docker is running or only `/healthz` works. `/healthz` proves the server is alive; it does not prove TeslaMate data is readable.

## Current App Display Boundary

TTDeck can only show data that the current iPhone app and Companion API already model. Configure the sources needed for these surfaces; do not promise fields outside this boundary.

| App surface | Data TTDeck can currently display | Required source for full experience | Boundary to explain |
| --- | --- | --- | --- |
| Vehicle list and selected vehicle | Display name, VIN suffix, vehicle state, model when available, software version when available, odometer when available | TeslaMate Postgres, plus MQTT for fresher state/version/odometer | Requires at least one TeslaMate `cars` record. Missing model/version is not a setup failure if TeslaMate has not stored it. |
| Overview | Current/last location, battery percent, usable battery percent, estimated/rated/ideal range, range health, model/software/odometer details, inside/outside temperature, climate/preconditioning, destination when available, freshness, summary cards, recent activity, weekly distance/energy/charging/parking drain | Postgres `cars`, latest `positions`, `drives`, `charging_processes`, `states`; MQTT for fresher battery/location/climate/route/state | Place labels depend on TeslaMate addresses/geofences or app-side geocoding. Coordinates or generic labels can still be normal. |
| Safety | Geofence status, abnormal movement status, parking drain, tire pressure, connectivity checks, realtime safety events, locked state, doors/windows/frunk/trunk, sentry mode, user-present state | Postgres `positions`, `states`, `geofences`; MQTT for live lock/doors/windows/trunks/sentry/user-present/tire warnings | Without MQTT, live safety fields are incomplete. Without geofences, geofence labels may show unknown/not configured. |
| Battery and charging | Plugged-in state, charging state, power, charge limit, minutes/time to full, voltage, current, phases, charge energy added, charge-port door, charge-current request/max, scheduled charging, recent charge sessions, energy added, range added, cost, efficiency, average power, charge location | Postgres `charges` and `charging_processes`; MQTT for live plugged/charge state/charge port/electrical details/scheduled charging | Historical sessions depend on TeslaMate records. In-progress or zero-energy sessions may not belong in historical totals. Cost appears only when TeslaMate has cost data. |
| Trips | Trip list, pagination, search/filter/sort, start/end time, start/end place, distance, energy, efficiency, average/max speed, max power, route points, trip telemetry, SOC/range samples, temperatures, tire pressure samples, frequent places | Postgres `drives`, `positions`, `addresses`, `geofences`, `cars` | Only completed drives are historical trips. Route and telemetry require TeslaMate position samples for that drive. TeslaMate does not automatically backfill every pre-TeslaMate trip. |
| Trends | Metrics, daily distance, efficiency, temperature trends, parking drain trend, software update events, health/realtime events | Postgres `drives`, `positions`, `states`, `charging_processes`; MQTT for realtime event overlay | Trends need enough historical samples. Sparse history produces sparse charts and is not a broken setup. |
| Settings, diagnostics, and binding | Server reachability, setup diagnostics, paired devices, QR/setup binding, notification status, latency diagnostics | Companion Server HTTP API and iPhone app storage | Diagnostics are for setup and troubleshooting. They are not extra vehicle data. |

For a full data setup, the AI must configure and verify both layers:

1. **Historical/database layer**: TeslaMate Postgres read-only access works and the app can load vehicles, overview, safety, charging, trips, and trends.
2. **Realtime layer**: TeslaMate MQTT is reachable privately from Companion Server, realtime diagnostics are `ok`, and live fields appear or are confirmed present in the realtime payload.

## Optional Versus Required

Required for the full TTDeck in-app data experience:

- TeslaMate is already collecting vehicle data.
- Companion Server is reachable by the iPhone.
- `PUBLIC_BASE_URL` is correct for the user's chosen access mode.
- Read-only Postgres access is configured.
- MQTT realtime is configured through a private path.
- QR/setup binding is complete.
- The Full Validation Gate passes.

Optional because these do not add more in-app vehicle data:

- APNs remote push. This affects remote notifications, not the visible vehicle data.
- Public HTTPS, reverse proxy, tunnel, Tailscale, or VPN. These affect where the iPhone can reach Companion Server, not which vehicle fields exist.
- Exposing TeslaMate UI, Grafana, Postgres, MQTT, Docker, or NAS admin. These are not needed and should not be public.
- Backend performance optimization. Do it later only if verified endpoints are slow.
- Grafana dashboard customization. TTDeck does not need it.
- APNs Apple Developer setup for normal App Store users. Treat it as advanced self-hosted push only.

Optional enhancements that can improve display quality but are not required for a full setup:

- TeslaMate geofences and address quality. These improve place labels and geofence status.
- TeslaMate charge cost configuration. This improves cost display for charging sessions.
- Historical import/backfill from another system. This can add older trips or charging sessions, but it is not part of normal setup.
- More local caching or backend summary optimization. This can improve speed, but it is not required if validation passes.

## Ask These Questions First

Ask only what is needed. If the user does not know an answer, help them discover it with a read-only command.

1. Where will Companion Server run: NAS, VPS, Linux server, Mac, or another device?
2. How will the iPhone access it: home LAN only, VPN/private network, or public HTTPS?
3. Is TeslaMate already running and showing vehicle data?
4. Can the user run `docker compose` on the device that will host Companion Server?
5. Does the user have the TTDeck Companion Server release package or source folder?
6. Is Companion Server running in the same Docker Compose/network as TeslaMate, or on a different device?
7. What is the Postgres host name from Companion Server's point of view? Examples: `database`, `postgres`, a LAN IP, or a Docker service name.
8. Does a read-only Postgres user already exist for TTDeck?

If the user is unsure about LAN vs public access:

- Home Wi-Fi only: use a LAN address such as `http://192.168.1.20:4020`.
- Away from home: use the user's own VPN, reverse proxy, tunnel, NAS remote access, or public HTTPS URL, such as `https://ttdeck.example.com`.
- Simulator or same-machine development only: `http://127.0.0.1:4020` is acceptable for the simulator, not for a real iPhone.

## Access Modes

| Mode | Example `PUBLIC_BASE_URL` | Works away from home? | Notes |
| --- | --- | --- | --- |
| Home LAN / NAS | `http://192.168.1.20:4020` | No | Good access mode if the user only uses TTDeck on home Wi-Fi. |
| Private VPN / mesh network | `http://100.x.y.z:4020` | Yes, when VPN is connected | The user owns the remote access setup. Do not require it. |
| Public HTTPS | `https://ttdeck.example.com` | Yes | Recommended for public access. Use HTTPS and expose only Companion Server. |
| Local simulator test | `http://127.0.0.1:4020` | No | Simulator or same-machine test only. Never use this for a real iPhone. |

`PUBLIC_BASE_URL` is important because the iPhone uses it as the server URL, and QR binding payloads include it as `serverUrl`.

## Network Exposure Matrix

Only expose what the iPhone must reach.

| Surface | Who needs access | Public internet? | Required for full in-app data? | Guidance |
| --- | --- | --- | --- | --- |
| Companion Server HTTP/API | iPhone | Optional | Yes | LAN `4020` is enough for home use. Public access should go through HTTPS, usually port `443`. |
| `/healthz` | User and iPhone network check | Same as Companion Server | Yes | Public and unauthenticated liveness check. |
| `/api/setup/diagnostics` | Setup operator | Same as Companion Server, guarded by `SETUP_SECRET` | Yes | Requires `x-setup-secret`. Do not paste the secret into chat. |
| `/api/bind/start` | Setup operator or app binding flow | Same as Companion Server, guarded by `SETUP_SECRET` | Yes for binding | Creates a short-lived pairing token and optional QR payload. |
| `/api/bind/complete` | iPhone app | Same as Companion Server | Yes for binding | Exchanges pairing token for read-only device token. |
| Authenticated `/api/vehicles...` routes | Bound iPhone app | Same as Companion Server | Yes | Requires read token stored by the app. |
| TeslaMate Postgres | Companion Server only | No | Yes | Keep private. Use a read-only user. |
| TeslaMate web UI | User/admin only | No by default | No | Do not expose just to make TTDeck work. |
| Grafana | User/admin only | No by default | No | Do not expose just to make TTDeck work. |
| MQTT broker | Companion Server only | No | Yes, private only | Enable only after Basic Validation passes. Never expose MQTT publicly. |
| APNs credentials | Companion Server outbound only | No inbound port | No | Configure later only if remote push is requested. |
| Docker socket / NAS admin | Admin only | Never | No | Never expose publicly. |

## Basic Checkpoint Configuration

For the Basic Setup checkpoint, configure the minimum stable Postgres-backed setup. Keep MQTT and push notifications disabled until Basic Validation passes.

### Required

| Variable | Example | Why it matters |
| --- | --- | --- |
| `BIND_HOST` | `0.0.0.0` | Allows the container to listen on the Docker/NAS network. |
| `PORT` | `4020` | Companion Server HTTP port. |
| `PUBLIC_BASE_URL` | `http://192.168.1.20:4020` or `https://ttdeck.example.com` | The exact URL the iPhone can reach. |
| `DATA_SOURCE_MODE` | `teslamate` | Enables TeslaMate/Postgres-backed data. |
| `TOKEN_SECRET` | `<generated-locally>` | Used to hash read-only device tokens. Generate locally. |
| `SETUP_SECRET` | `<generated-locally>` | Used for setup diagnostics, binding start, and device management. Generate locally. |
| `TOKEN_STORE_PATH` | `/data/read-tokens.json` | Keeps bound devices after container restart. |
| `DEVICE_SECRET_REQUIRED` | `"true"` | Binds read tokens to a per-device secret. |
| `TESLAMATE_DB_HOST` | `database` | Postgres host reachable from Companion Server. |
| `TESLAMATE_DB_PORT` | `5432` | Postgres port. |
| `TESLAMATE_DB_NAME` | `teslamate` | TeslaMate database name. |
| `TESLAMATE_DB_USER` | `ttdeck_readonly` | Dedicated read-only DB user. |
| `TESLAMATE_DB_PASSWORD` | `<readonly-password>` | Password for the read-only DB user. Do not paste into chat. |

### Optional Alternatives

- `TESLAMATE_DATABASE_URL` may replace the split `TESLAMATE_DB_*` fields if the user already uses a single Postgres URL.
- `TESLAMATE_DB_SSL=true` only when the Postgres endpoint requires SSL.

### Keep Disabled Until Basic Validation Passes

```yaml
MQTT_ENABLED: "false"
PUSH_NOTIFICATIONS_ENABLED: "false"
APNS_ENABLED: "false"
```

Do not enable these until basic vehicle data is visible in the app. After Basic Validation passes, MQTT must be enabled for the full TTDeck in-app data experience. Push/APNs should remain disabled unless the user chooses the optional APNs add-on later.

## Step 0: Version And Package Preflight

Before changing server config, confirm the user's Companion Server package matches this guide.

If the user does not have a Companion Server package yet, use the canonical backend repository above. Do not invent another source, Docker image, or download URL.

If the user deploys from source, inspect the source folder:

```bash
test -f src/router.js
test -f src/config.js
rg -n "/api/setup/diagnostics|/api/bind/start|/api/vehicles.*realtime" src/router.js
rg -n "MQTT_ENABLED|MQTT_URL|MQTT_TOPIC_PREFIX" src/config.js
```

If `rg` is not installed, use `grep -R` for the same strings.

Expected:

- The files exist.
- The setup diagnostics and binding routes exist.
- The authenticated vehicle routes include `realtime`.
- MQTT env vars are supported by `config.js`.

If the user deploys from a prebuilt Docker image or release bundle and cannot inspect source, verify after the container starts:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
curl -sS \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Expected:

- `/healthz` returns `ok=true`.
- `/api/setup/diagnostics` returns `ok=true`.
- Diagnostics includes `postgres`, `vehicles`, and `mqtt` checks after config is loaded.

If the package does not support these routes or env vars, stop and ask the user to deploy the matching Companion Server version before continuing. Do not try to force this guide onto an older server.

## Step 1: Confirm TeslaMate Has Data

Ask the user to confirm that TeslaMate is already running and showing vehicle data.

Do not reinstall TeslaMate just because TTDeck Companion configuration is failing.

If the user does not know the TeslaMate Postgres container name, help them discover it with read-only commands:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker ps --format '{{.Names}}' | grep -Ei 'postgres|database|db|teslamate'
```

If a likely Postgres container is found, identify its database name, admin user, and Docker network without showing any password:

```bash
docker inspect <postgres-container> --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(POSTGRES_DB|POSTGRES_USER)='

docker inspect <postgres-container> \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Do not ask the user to paste `POSTGRES_PASSWORD` into chat.

Then list tables:

```bash
docker exec -it <postgres-container> \
  psql -U <postgres-admin-user> -d <postgres-db-name> -c "\dt"
```

Expected result: tables are listed. If the command cannot run, do not guess. Identify the Postgres container/service name first.

## Step 2: Create A Read-Only Database User

Open a Postgres shell inside the TeslaMate Postgres container:

```bash
docker exec -it <postgres-container> \
  psql -U <postgres-admin-user> -d <postgres-db-name>
```

If the previous discovery command showed `POSTGRES_USER=teslamate` and `POSTGRES_DB=teslamate`, then `<postgres-admin-user>` is usually `teslamate` and `<postgres-db-name>` is usually `teslamate`.

Inside `psql`, run:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

If the discovered database name is not `teslamate`, replace `teslamate` in the `GRANT CONNECT` line with the actual database name.

If the user already has a read-only user, verify permissions instead of creating another user.

Never ask the user to paste the real `<readonly-password>` into chat. If they need help reviewing a command, ask for a redacted version.

Verify the user exists:

```bash
docker exec -it <postgres-container> \
  psql -U <postgres-admin-user> -d <postgres-db-name> -c "\du ttdeck_readonly"
```

Verify the read-only user can read vehicle rows. Run this locally on the user's server and do not paste the password into chat:

```bash
docker exec -it -e PGPASSWORD='<readonly-password>' <postgres-container> \
  psql -U ttdeck_readonly -d <postgres-db-name> -c "SELECT COUNT(*) FROM cars;"
```

Expected result: the command returns a count. For the Basic Setup checkpoint to be complete, the count must be greater than `0`.

## Step 3: Generate Secrets Locally

Ask the user to run these on the server:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value as `TOKEN_SECRET` and the second value as `SETUP_SECRET`.

The user should paste these values into their local `docker-compose.yml` or environment file only. They should not paste the values into chat, screenshots, support tickets, or public logs.

## Step 4: Configure Docker Compose

Inside the release package:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Edit `docker-compose.yml`.

Minimum first-pass environment:

```yaml
environment:
  BIND_HOST: 0.0.0.0
  PORT: 4020
  PUBLIC_BASE_URL: <iphone-reachable-companion-url>
  DATA_SOURCE_MODE: teslamate
  TOKEN_SECRET: <generated-locally>
  SETUP_SECRET: <generated-locally>
  TOKEN_STORE_PATH: /data/read-tokens.json
  DEVICE_SECRET_REQUIRED: "true"
  TESLAMATE_DB_HOST: <postgres-host-reachable-from-companion>
  TESLAMATE_DB_PORT: 5432
  TESLAMATE_DB_NAME: teslamate
  TESLAMATE_DB_USER: ttdeck_readonly
  TESLAMATE_DB_PASSWORD: <readonly-password>
  MQTT_ENABLED: "false"
  PUSH_NOTIFICATIONS_ENABLED: "false"
  APNS_ENABLED: "false"
```

Before finalizing `TESLAMATE_DB_HOST`, choose the deployment branch.

### Branch A: Companion Server Is Added To The Same Compose/Network As TeslaMate

Use this if the user is editing the same `docker-compose.yml` that already runs TeslaMate and Postgres, or if Companion is attached to the same Docker network.

- `TESLAMATE_DB_HOST` should be the Postgres service/container name visible on that Docker network, often `database`, `postgres`, or the service name shown by `docker compose ps`.
- Do not publish Postgres with `ports:` just to make TTDeck work.
- Companion Server should publish only its own HTTP port, such as `4020:4020`, or sit behind the user's HTTPS reverse proxy.

Verify from inside the Companion container after it starts:

```bash
docker compose exec companion node -e "const net=require('node:net'); const s=net.connect({host:'<TESLAMATE_DB_HOST>',port:5432,timeout:5000}); s.on('connect',()=>{console.log('tcp ok'); s.end();}); s.on('timeout',()=>{console.error('tcp timeout'); process.exit(1);}); s.on('error',e=>{console.error(e.message); process.exit(1);});"
```

Expected result: `tcp ok`.

### Branch B: Companion Server Is A Separate Compose Project On The Same Docker Host

Use this if the TTDeck release package has its own `docker-compose.yml`, but TeslaMate is already running in another Compose project on the same NAS/server.

First find the TeslaMate/Postgres network:

```bash
docker inspect <postgres-container> \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}'
```

Then attach the Companion service to that external network:

```yaml
services:
  companion:
    networks:
      - teslamate_network

networks:
  teslamate_network:
    external: true
    name: <teslamate-network-name>
```

In this branch, `TESLAMATE_DB_HOST` should be the Postgres service/container name reachable on `<teslamate-network-name>`, not `127.0.0.1`.

Verify from inside the Companion container after it starts:

```bash
docker compose exec companion node -e "const net=require('node:net'); const s=net.connect({host:'<TESLAMATE_DB_HOST>',port:5432,timeout:5000}); s.on('connect',()=>{console.log('tcp ok'); s.end();}); s.on('timeout',()=>{console.error('tcp timeout'); process.exit(1);}); s.on('error',e=>{console.error(e.message); process.exit(1);});"
```

Expected result: `tcp ok`.

### Branch C: Companion Server Runs On A Different Device

Use this only if the user intentionally runs Companion Server on a different machine than TeslaMate/Postgres.

- `TESLAMATE_DB_HOST` must be a private LAN/VPN address or private DNS name for the TeslaMate Postgres host.
- Postgres must be reachable from the Companion Server over that private network.
- Do not expose Postgres to the public internet.
- If the user is not comfortable securing private database access, recommend running Companion Server on the same host/network as TeslaMate instead.

If the user needs a review, ask for a redacted version only:

```yaml
PUBLIC_BASE_URL: https://ttdeck.example.com
DATA_SOURCE_MODE: teslamate
TOKEN_SECRET: <redacted>
SETUP_SECRET: <redacted>
TESLAMATE_DB_HOST: database
TESLAMATE_DB_USER: ttdeck_readonly
TESLAMATE_DB_PASSWORD: <redacted>
```

Important checks:

- `PUBLIC_BASE_URL` must be the URL the iPhone will actually use.
- `TESLAMATE_DB_HOST` must be reachable from the Companion container, not just from the user's laptop.
- `TOKEN_STORE_PATH` must point to persistent storage so binding survives restarts.
- `TOKEN_SECRET` and `SETUP_SECRET` must not be default placeholder values.

## Step 5: Start Companion Server

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 companion
```

Expected:

- The `companion` service is running.
- Logs include:

```text
TTDeck Companion Server listening on <PUBLIC_BASE_URL>
```

If the service exits, inspect logs. Do not move to iPhone binding yet.

## Step 6: Check Server Health

From the server or another device on the same network:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

Expected response includes:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

If this fails:

1. Check the container:

```bash
docker compose ps
```

2. Check logs:

```bash
docker compose logs --tail=100 companion
```

3. From the server itself, test the local listener:

```bash
curl -sS http://127.0.0.1:4020/healthz
```

4. If local health works but `PUBLIC_BASE_URL` fails, debug only the access layer: LAN IP, port mapping, firewall, DNS, TLS, reverse proxy, VPN, or tunnel.

## Step 7: Check Data Source Diagnostics

```bash
curl -sS \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Expected:

- Response has `ok=true`.
- `postgres` has status `ok`.
- `vehicles` has status `ok` and reports at least one TeslaMate vehicle record.
- `mqtt` may be disabled or limited during the Basic Setup checkpoint. That is allowed only before Full Data Setup starts.

Interpretation:

- `setup_forbidden`: wrong or missing `SETUP_SECRET`.
- Postgres `error`: check `TESLAMATE_DB_HOST`, port, database name, user, password, SSL, and container reachability.
- Vehicle data `error`: TeslaMate may not have vehicle records yet, or the read-only user may lack permission.
- Vehicle data `warning` with a message like `No TeslaMate vehicles found`: Basic Setup is not complete. Confirm TeslaMate has at least one car record before continuing.
- MQTT `limited` or disabled: Basic Setup can continue, but Full Data Setup cannot be called complete.

Do not bind the app until Postgres is `ok` and vehicle data is `ok`. A vehicle warning is not acceptable for the Basic Setup checkpoint because the app cannot load vehicle data without at least one vehicle record.

## Step 8: Verify The iPhone Can Reach Companion Server

On the iPhone, open Safari and visit:

```text
<PUBLIC_BASE_URL>/healthz
```

Expected: the page shows JSON with `ok=true`.

If it works on the server but not on the iPhone, debug access mode only:

- Same Wi-Fi or LAN?
- Correct LAN IP?
- Firewall allows the port?
- Reverse proxy points to the Companion container?
- HTTPS certificate is valid?
- VPN or private network connected?

Do not debug Postgres until the iPhone can reach `/healthz`.

## Step 9: Bind The iPhone App

There are two binding paths. Use the setup-secret path first unless the user specifically wants QR binding.

### Option A: Bind With Setup Secret

Tell the user:

1. Open TTDeck.
2. Open Settings.
3. In Settings Group, choose Connect.
4. In Data Source, set Mode to Companion.
5. Enter `PUBLIC_BASE_URL` as the server URL.
6. Tap Save and Test.
7. In Settings Group, choose Access.
8. In Bound Devices And Security, enter `SETUP_SECRET`.
9. Tap Bind With Setup Secret.
10. Return to the main screen and refresh vehicle data.

Expected:

- This device changes from not bound to bound.
- Vehicle data loads after refresh.

After binding, do not ask the user to export or paste the read token. Use in-app diagnostics and `/api/setup/diagnostics` for troubleshooting.

### Option B: QR Binding

QR binding is supported by the app and backend pairing API, but do not assume every release exposes a setup web page at `/`. Some releases intentionally return 404 at `/`.

Use QR binding only if the user can display the generated QR code on a trusted screen visible to the iPhone.

Generate a short-lived pairing payload:

```bash
curl -sS \
  -X POST \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/bind/start
```

Expected response includes:

```json
{
  "ok": true,
  "data": {
    "pairingToken": "pair_...",
    "expiresAt": 1234567890,
    "qrPayload": "{\"type\":\"tesla-monitor-companion\",\"version\":1,\"serverUrl\":\"...\",\"pairingToken\":\"pair_...\"}",
    "qrCodeDataUrl": "data:image/png;base64,..."
  }
}
```

The QR payload contains a one-time pairing token, not the setup secret. The default pairing lifetime is about 10 minutes, and the token can be used only once.

To display the QR code from a trusted terminal, save the response and convert `qrCodeDataUrl` into an image:

```bash
curl -sS \
  -X POST \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/bind/start > /tmp/ttdeck-bind.json

python3 - <<'PY'
import base64
import json

with open("/tmp/ttdeck-bind.json", "r", encoding="utf-8") as handle:
    body = json.load(handle)

data_url = body["data"]["qrCodeDataUrl"]
image_data = data_url.split(",", 1)[1]
with open("/tmp/ttdeck-pairing.png", "wb") as handle:
    handle.write(base64.b64decode(image_data))

print("/tmp/ttdeck-pairing.png")
PY
```

Display the image on a trusted screen:

```bash
open /tmp/ttdeck-pairing.png
```

If `open` is not available, use the server or desktop's normal image viewer. On many Linux desktops this works:

```bash
xdg-open /tmp/ttdeck-pairing.png
```

Then tell the user:

1. Open TTDeck.
2. Open Settings.
3. In Settings Group, choose Access.
4. In Bound Devices And Security, tap Scan Pairing QR Code.
5. Scan the generated QR image from the trusted screen.
6. Return to the main screen and refresh vehicle data.

If the scan fails, the token expires, or the code was already used, generate a new pairing payload and scan again. If QR generation or display is confusing, fall back to Option A. Do not block setup on QR.

## Step 10: Mandatory Basic Validation Gate

Run this gate immediately after QR binding or setup-secret binding. The AI assistant must not enable MQTT or continue to Full Data Setup until this gate passes.

### Server Checks

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

Expected:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Then run diagnostics:

```bash
curl -sS \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Expected:

- `ok=true`
- `postgres` status is `ok`
- `vehicles` status is `ok`
- Vehicle diagnostics report at least one TeslaMate vehicle record
- `mqtt` may be disabled or limited at this stage

### iPhone Checks

Tell the user to check the app:

1. TTDeck is in Companion mode.
2. This Device shows Bound.
3. The main screen loads at least one vehicle.
4. Refresh vehicle data succeeds.
5. Basic pages such as overview, battery/charging, trips, and trends show data where TeslaMate has records.

If any Basic Validation item fails, stay in Basic Setup troubleshooting. Do not continue to Full Data Setup.

If Basic Validation passes, say exactly:

```text
Basic layer is verified. TTDeck can reach Companion Server, diagnostics pass for Postgres and vehicle data, the iPhone is bound, and vehicle data loads.

Continue now to Full Data Setup. This enables MQTT realtime fields such as doors/windows, sentry mode, tire pressure, charge-port details, and live charging state. Without this step, the app may work but it is not the full TTDeck experience.
```

Do not ask whether to continue. Continue to Full Data Setup unless the user explicitly tells you to stop. If the user stops here, summarize:

- Companion Server is running
- Postgres-backed vehicle data works
- iPhone is bound
- MQTT realtime remains disabled
- This is not the full TTDeck in-app data experience
- APNs and remote access add-ons were not configured

## Full Data Setup: MQTT Realtime Fields

Start this section after Basic Validation passes. This is the default target for user setup unless the user explicitly stops.

Full Data Setup is for realtime fields that make the user's setup closer to the maintainer setup. This includes live lock, doors, windows, trunks, sentry mode, tire pressure, plugged-in state, charging state, charge-port door, charging power, voltage, current, charge limit, requested current, time to full, and scheduled charging start time.

Do not expose MQTT publicly. Companion Server should reach MQTT privately through Docker network, LAN, VPN, or another private path.

### Step F1: Identify MQTT Reachability

Ask where TeslaMate MQTT is running:

- Same Docker Compose/network as Companion
- Separate Compose project on the same Docker host
- Different private LAN/VPN host

Use the same network reasoning as Postgres:

- Same network: `MQTT_URL` is often `mqtt://mosquitto:1883`
- Same host but separate Compose: attach Companion to the TeslaMate/MQTT Docker network
- Different device: use a private LAN/VPN address, not public internet

If MQTT requires credentials, use `MQTT_USERNAME` and `MQTT_PASSWORD`. Do not paste the real password into chat.

### Step F2: Configure MQTT Env Vars

Update `docker-compose.yml`:

```yaml
MQTT_ENABLED: "true"
MQTT_URL: mqtt://<private-mqtt-host>:1883
MQTT_USERNAME: <optional-username>
MQTT_PASSWORD: <optional-password>
MQTT_TOPIC_PREFIX: teslamate/cars
MQTT_CONNECT_TIMEOUT_MS: 5000
MQTT_RECONNECT_PERIOD_MS: 5000
MQTT_STALE_AFTER_SECONDS: 300
```

If there is no MQTT username or password, leave those values empty or omit them according to the user's compose style.

Recreate Companion Server:

```bash
docker compose up -d --force-recreate
docker compose logs --tail=100 companion
```

Expected logs include:

```text
TeslaMate MQTT realtime adapter started.
```

### Step F3: Full Validation Gate

Run diagnostics:

```bash
curl -sS \
  -H "x-setup-secret: <SETUP_SECRET>" \
  <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Expected:

- `postgres` status is still `ok`
- `vehicles` status is still `ok`
- `mqtt` status is `ok`
- MQTT message says realtime fields were received for at least one vehicle, or the app confirms live fields after refresh

If `mqtt` is `limited` or `error`, do not proceed to optional advanced add-ons yet. Debug only MQTT reachability, topic prefix, credentials, and whether TeslaMate is publishing car topics.

Tell the user to refresh TTDeck and inspect live fields:

1. Overview still loads the vehicle.
2. Charging state reflects the current vehicle state more accurately.
3. Safety/live fields such as doors/windows, sentry mode, tire pressure, charge-port details, or live charging values appear when TeslaMate publishes them.

If Full Validation passes, say exactly:

```text
Full Data Setup is complete. Postgres-backed history and MQTT realtime fields are configured and verified.

You can stop here, or choose one optional advanced add-on: APNs remote push, HTTPS, Tailscale, VPN, or reverse proxy.

Do you want to stop here or configure one optional add-on?
```

If the user stops here, summarize:

- Basic Postgres-backed data works
- MQTT realtime is enabled and verified
- APNs remote push was not configured
- HTTPS/Tailscale/VPN/reverse proxy was not configured unless already present

## Optional Advanced Add-ons

Only start this section if Full Validation passed and the user explicitly chooses a specific add-on. Configure one add-on at a time.

### Optional: HTTPS / Public Reverse Proxy

Use this only if the user wants access away from the home network without relying on a private VPN.

Rules:

- Expose only Companion Server, not Postgres, TeslaMate, Grafana, MQTT, Docker, or NAS admin.
- Prefer public `443` -> reverse proxy -> Companion Server private port `4020`.
- Set `PUBLIC_BASE_URL` to the final HTTPS URL.
- Recreate Companion after changing `PUBLIC_BASE_URL`.

Verification:

```bash
curl -sS https://<ttdeck-domain>/healthz
```

Then verify on iPhone Safari:

```text
https://<ttdeck-domain>/healthz
```

If the URL changes after binding, tell the user to update TTDeck Settings and re-test. If QR payloads were generated with the old URL, generate a fresh QR code.

### Optional: Tailscale Or VPN

Use this if the user wants away-from-home access without making Companion public.

Rules:

- Install and enable the VPN according to the user's own provider instructions.
- Keep Postgres, TeslaMate, Grafana, MQTT, Docker, and NAS admin private.
- `PUBLIC_BASE_URL` should be the iPhone-reachable private VPN URL, such as `http://100.x.y.z:4020`.
- The iPhone must have the same VPN connected when using TTDeck.

Verification from iPhone Safari:

```text
<vpn-private-public-base-url>/healthz
```

If the VPN URL changes after binding, update TTDeck Settings and re-test.

### Optional: APNs Remote Push

APNs remote push is an advanced self-hosted option. Do not present it as a normal App Store user requirement.

Only continue if the user has all of these:

- Apple Developer account
- Push Notifications capability for the app build they use
- APNs Auth Key `.p8`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- Correct `APNS_BUNDLE_ID`
- A server location where the APNs key can be stored securely

Configure:

```yaml
PUSH_NOTIFICATIONS_ENABLED: "true"
NOTIFICATION_STATE_STORE_PATH: /data/notification-state.json
NOTIFICATION_POLL_INTERVAL_MS: 45000
POST_TRIP_WATCH_MINUTES: 15
POST_TRIP_SAFETY_GRACE_SECONDS: 90
APNS_ENABLED: "true"
APNS_ENVIRONMENT: development
APNS_TEAM_ID: <team-id>
APNS_KEY_ID: <key-id>
APNS_BUNDLE_ID: com.example.ttdeck
APNS_PRIVATE_KEY_PATH: /run/secrets/apns-auth-key.p8
```

Do not ask the user to paste the `.p8` private key into chat. Prefer a file path or Docker secret.

Verification must be reported in layers:

- Server env configured
- Companion restarted
- iPhone registered a push token
- A real event or manual test push was triggered
- The iPhone actually received a notification

Do not call APNs complete at the "device registered" layer.

## What May Still Look Incomplete After A Successful Full Setup

A successful Full Data Setup means TTDeck can connect to Companion Server, diagnostics pass for Postgres, vehicle data, and MQTT, and the app can load the supported vehicle surfaces. It does not mean TeslaMate has recorded every possible historical item or that Tesla has published every live field.

Set this expectation before the user thinks the deployment is broken:

| What the user may see | Is full setup broken? | Why it can happen | What to do |
| --- | --- | --- | --- |
| Some live fields are still missing even after MQTT is `ok` | Usually no | TeslaMate/Tesla may not publish every field for every model, state, or moment. Some values are naturally null until the vehicle reports them. | Inspect `/api/vehicles/<id>/realtime` and explain the missing field. Do not blame APNs or HTTPS. |
| Location shows coordinates, a generic place, or place not recorded | No | TeslaMate may not have a matching geofence or resolved place name for that point. | Confirm vehicle data works first. Geofence/place-name polish is optional. |
| Historical trips or charging sessions do not include the vehicle's entire lifetime history | No | TeslaMate records what it has collected. It usually does not backfill all history from before TeslaMate was running. | Explain recorder coverage. Do not promise full lifetime history without an import/backfill feature. |
| Charging history excludes a currently open session or a zero-energy session | No | Historical charging cards should use completed sessions with real added energy. An in-progress session belongs in current charging status, not historical totals. | Treat this as expected display filtering. |
| Diagnostics show schema checks as `limited` but `postgres`, `vehicles`, and `mqtt` are `ok` | Usually no | Some optional TeslaMate columns or optional feature tables may be missing. | Continue if the app loads all main surfaces. Only block full setup on Postgres error, vehicle error, zero vehicles, or MQTT error. |
| App shows no vehicles | Yes | Companion can reach the server, but TeslaMate has no car records or the read-only user cannot read them. | Return to Step 7 and confirm `vehicles` is `ok` with at least one vehicle record. |

For full setup support, do not turn optional missing fields into a forced backend optimization task. Only update backend/docs immediately if setup, env vars, diagnostics interpretation, or the supported vehicle-loading path changed.

## Troubleshooting Layers

### Layer 1: Companion Server Is Not Running

Check:

```bash
docker compose ps
docker compose logs --tail=100 companion
```

Expected: the service is running and logs show the listening URL.

### Layer 2: Server Runs But URL Is Unreachable

Check:

```bash
curl -sS http://127.0.0.1:4020/healthz
curl -sS <PUBLIC_BASE_URL>/healthz
```

If local works and public/LAN fails, debug access URL, Docker port mapping, firewall, DNS, TLS, reverse proxy, VPN, or tunnel.

### Layer 3: Diagnostics Is Forbidden

Expected error:

```json
{"ok":false,"error":{"code":"setup_forbidden"}}
```

Fix:

- Confirm the request header is `x-setup-secret`.
- Confirm the user entered `SETUP_SECRET`, not `TOKEN_SECRET`.
- After changing env vars, recreate the container:

```bash
docker compose up -d --force-recreate
```

### Layer 4: Postgres Fails

Check:

- `TESLAMATE_DB_HOST` is reachable from the Companion container.
- `TESLAMATE_DB_PORT` is correct.
- Database name is usually `teslamate`.
- User is the read-only user, such as `ttdeck_readonly`.
- The read-only user has `CONNECT`, `USAGE`, and `SELECT`.
- `TESLAMATE_DB_SSL` matches the Postgres endpoint.

Do not expose Postgres publicly to solve this.

### Layer 5: App Binds But Shows No Vehicle

Check `/api/setup/diagnostics` first.

`/healthz` only proves the server is alive; it does not prove TeslaMate data is readable.

### Layer 6: LAN Address Stops Working Away From Home

This is expected. A LAN address only works on that network. For outside access, the user needs their own VPN, reverse proxy, tunnel, NAS remote access, or public HTTPS URL.

## Response Format For The AI

Use this format when guiding the user:

```text
Current layer: <server startup / access URL / database / diagnostics / app binding>
What we know:
<facts already verified>
Run this:
<one command or one app action>
Expected result:
<specific response or screen state>
If it fails:
<next check for this layer only>
```

Do not skip the "What we know" section. It prevents guessing.

## Future Updates And Backend Optimization

This section is for future AI assistants when the user asks to update the Companion Server, optimize backend behavior, add a deployment option, or revise the setup flow.

For the first deployment, do not perform these update tasks unless the user explicitly asks.

### Update Rules

1. First identify whether the user wants docs only, code changes, server deployment, or app compatibility guidance.
2. Inspect the current local files before suggesting changes. Do not rely on old memory or generic assumptions.
3. Keep deployment docs, examples, tests, and public app-facing compatibility notes consistent.
4. Do not change secrets, ports, public exposure, APNs credentials, database permissions, or production deployment without explicit confirmation.
5. If the update changes setup steps, update this AI guide and all localized manual guides in `docs/deployment/manual/*.md` in the same work.
6. If the update changes runtime behavior, add or update targeted tests before calling it done.
7. If a server must be restarted or redeployed, report that separately from "code changed".

### Source-Of-Truth Map

Use this map to find the right files.

| Area | Inspect first | Usually update |
| --- | --- | --- |
| Runtime config/env vars | `src/config.js` | `README.md`, `docker-compose.example.yml`, `docs/deployment/ai-setup-guide.md`, `docs/deployment/manual/*.md`, config tests |
| Docker deployment | `docker-compose.example.yml`, `Dockerfile` | Deployment docs and README |
| API routes/auth/binding | `src/router.js`, `src/binding/` | `README.md`, HTTP tests, deployment docs |
| QR binding/setup page | `src/router.js`, `src/views/setupPage.js` | AI guide, manual guides, HTTP tests |
| TeslaMate Postgres data | `src/data/teslamateDataSource.js` | Data-source tests, README, diagnostics docs |
| MQTT realtime | `src/realtime/`, config MQTT fields | README, compose example, deployment docs, tests |
| Remote push/APNs | `src/notifications/` | README, compose example, deployment docs, tests |
| Official app compatibility | Public API shape and binding payloads | README, API docs, deployment docs |
| Public hosted docs | `docs/deployment/README.md`, hosted copy process | Do not publish without confirmation |

### Common Update Types

#### Config-Only Update

Examples: new env var, renamed env var, different default.

Minimum work:

- Update config loading.
- Update Docker example.
- Update `README.md`.
- Update this AI guide.
- Update manual deployment guides.
- Add or update config tests.

Verification:

```bash
npm test
```

#### API Or Binding Update

Examples: new setup endpoint, QR setup page, changed binding payload.

Minimum work:

- Update router and binding store.
- If the public API or binding payload changes, document compatibility impact for the official app separately.
- Update HTTP tests.
- Update API docs and deployment guides.
- Verify that no raw read token or setup secret is exposed in logs or screenshots.

Verification:

```bash
npm test
```

Then verify binding compatibility separately if the public API changed.

#### TeslaMate Data Optimization

Examples: query performance, new summary field, diagnostics improvement.

Minimum work:

- Inspect current TeslaMate schema assumptions.
- Keep queries read-only.
- Add tests for missing fields and partial data.
- Update docs only if setup, env vars, or diagnostics interpretation changed.

Verification:

```bash
npm test
```

If production deployment is requested, verify deployed `/healthz`, `/api/setup/diagnostics`, and authenticated vehicle data separately.

#### Public Access Or Reverse Proxy Update

Examples: HTTPS, domain, NAS proxy, tunnel.

Minimum work:

- Do not require a public URL for users who only need LAN.
- Keep Postgres, TeslaMate, Grafana, MQTT, Docker, and NAS admin private.
- Document exact exposed surface.
- Verify from the iPhone network, not only from the server.

Verification:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

And from iPhone Safari:

```text
<PUBLIC_BASE_URL>/healthz
```

### Update Completion Checklist

Before saying an update is complete, report each layer separately:

- Code changed: yes/no
- Docs changed: yes/no
- Tests run: command and result
- Local server run: yes/no
- Deployed server updated: yes/no
- iPhone app built/installed/launched: yes/no
- Manual iPhone verification: yes/no

If any layer was not verified, say exactly what was not verified and why.
