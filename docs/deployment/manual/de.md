# TTDeck Companion Server Manuelle Einrichtung

Diese Anleitung hilft dir, TTDeck Companion Server auf deinem eigenen NAS, Server, VPS oder Computer bereitzustellen und die iPhone-App zu verbinden.

Companion Server ist eine schreibgeschuetzte Bruecke. Er liest deine TeslaMate-Postgres-Datenbank und optional MQTT-Echtzeitdaten und stellt sie der TTDeck iPhone-App bereit. Der TTDeck-Entwickler erhaelt keine Fahrzeugdaten.

## 1. Zugriffsart waehlen

TTDeck benoetigt keine oeffentliche URL. Die Server-URL muss nur von deinem iPhone erreichbar sein.

| Modus | Beispiel-URL | Geeignet fuer | Hinweis |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | Nutzung im Heim-WLAN | Funktioniert ausserhalb dieses Netzwerks nicht |
| Oeffentliches HTTPS | `https://ttdeck.example.com` | Zugriff unterwegs | Benoetigt HTTPS, DNS und eine oeffentliche Route |
| Lokaler Test | `http://127.0.0.1:4020` | Simulator oder gleicher Rechner | Nicht fuer ein echtes iPhone verwenden |

Auf einem echten iPhone bedeutet `127.0.0.1` das iPhone selbst, nicht dein NAS, deinen Mac oder Server.

## 2. Voraussetzungen

- Eine funktionierende TeslaMate-Installation mit Fahrzeugdaten.
- Ein Geraet, das Docker Compose ausfuehren kann.
- Das TTDeck Companion Server Release-Paket oder den Quellordner.
- Eine vom iPhone erreichbare Server-URL.
- HTTPS, wenn der Dienst oeffentlich erreichbar ist.

Starte mit deaktiviertem MQTT und deaktivierten Remote-Pushs. Richte beides erst ein, wenn die Basisdaten funktionieren.

## 3. Secrets erzeugen

Auf dem Server ausfuehren:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Der erste Wert ist `TOKEN_SECRET`, der zweite `SETUP_SECRET`.

Teile diese Werte nicht in oeffentlichen Beitraegen, Screenshots, Support-Tickets oder AI-Chats.

## 4. Schreibgeschuetzten Datenbankbenutzer erstellen

In der TeslaMate-Postgres-Datenbank ausfuehren:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

Loesche oder aendere den urspruenglichen TeslaMate-Datenbankbenutzer nicht. Fuege fuer TTDeck einen separaten schreibgeschuetzten Benutzer hinzu.

## 5. Companion Server konfigurieren

Im Release-Paket:

```bash
cp docker-compose.example.yml docker-compose.yml
```

`docker-compose.yml` bearbeiten:

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

`PUBLIC_BASE_URL` ist die URL, die dein iPhone verwendet, zum Beispiel `http://192.168.1.20:4020` oder `https://ttdeck.example.com`.

## 6. Starten und pruefen

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

Healthcheck:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

Die Antwort sollte enthalten:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Diagnose:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Behebe blockierende `error`-Eintraege, bevor du die App verbindest. `limited` bei MQTT ist fuer die Ersteinrichtung akzeptabel.

## 7. iPhone-App verbinden

1. TTDeck oeffnen.
2. Settings oeffnen.
3. Unter Connect den Companion-Modus waehlen.
4. `PUBLIC_BASE_URL` als Server-URL eingeben.
5. Save and Test antippen.
6. Access oeffnen.
7. `SETUP_SECRET` eingeben.
8. Bind With Setup Secret antippen.
9. Zur Hauptansicht zurueckkehren und aktualisieren.

## 8. Sicherheitscheck

- `TOKEN_SECRET` und `SETUP_SECRET` sind keine Standardwerte.
- `TOKEN_STORE_PATH` zeigt auf persistenten Speicher.
- `DEVICE_SECRET_REQUIRED` ist `"true"`.
- Companion Server verwendet einen schreibgeschuetzten Datenbankbenutzer.
- Oeffentlicher Zugriff nutzt HTTPS.
- Nur Companion Server ist erreichbar.
- Postgres, TeslaMate und Grafana sind nicht oeffentlich erreichbar, ausser du hast sie separat abgesichert und verstehst das Risiko.

## 9. Haeufige Probleme

- `/healthz` funktioniert, aber die App zeigt keine Daten: `/api/setup/diagnostics` ausfuehren. Health prueft nur, ob der Server laeuft.
- `setup_forbidden`: Der Header `x-setup-secret` fehlt oder ist falsch.
- LAN-URL funktioniert unterwegs nicht: Erwartet. Nutze eigenen Remote-Zugriff oder oeffentliches HTTPS.
- `127.0.0.1` funktioniert auf dem iPhone nicht: Erwartet. Nutze NAS/Server-IP oder Domain.
