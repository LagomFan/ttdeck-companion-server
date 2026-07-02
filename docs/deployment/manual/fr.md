# Configuration manuelle de TTDeck Companion Server

Ce guide vous aide a deployer TTDeck Companion Server sur votre NAS, serveur, VPS ou ordinateur, puis a le connecter a l'app iPhone.

Companion Server est une passerelle en lecture seule. Il lit votre base TeslaMate Postgres et, si vous l'activez, les donnees temps reel MQTT, puis fournit une API a l'app iPhone TTDeck. Le developpeur de TTDeck ne recoit pas vos donnees vehicule.

## 1. Choisir le mode d'acces

TTDeck n'exige pas d'URL publique. L'URL du serveur doit simplement etre accessible depuis votre iPhone.

| Mode | URL exemple | Usage | Note |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | Utilisation sur le Wi-Fi domestique | Ne fonctionne pas hors de ce reseau |
| HTTPS public | `https://ttdeck.example.com` | Acces hors domicile | Necessite HTTPS, DNS et une route publique |
| Test local | `http://127.0.0.1:4020` | Simulateur ou meme machine | Ne pas utiliser sur un vrai iPhone |

Sur un vrai iPhone, `127.0.0.1` designe l'iPhone lui-meme, pas votre NAS, Mac ou serveur.

## 2. Prerequis

- Une installation TeslaMate fonctionnelle avec des donnees vehicule.
- Un appareil capable d'executer Docker Compose.
- Le paquet de publication ou le dossier source de TTDeck Companion Server.
- Une URL de serveur accessible depuis l'iPhone.
- HTTPS si le service est expose publiquement.

Commencez avec MQTT et les notifications push distantes desactives. Ajoutez-les seulement apres validation des donnees vehicule de base.

## 3. Generer les secrets

Executez sur le serveur:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Utilisez la premiere valeur comme `TOKEN_SECRET` et la seconde comme `SETUP_SECRET`.

Ne partagez pas ces valeurs dans des publications publiques, captures d'ecran, tickets support ou conversations AI.

## 4. Creer un utilisateur de base en lecture seule

Executez dans la base Postgres de TeslaMate:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

Ne supprimez pas et ne modifiez pas l'utilisateur de base TeslaMate existant. Ajoutez un utilisateur separe en lecture seule pour TTDeck.

## 5. Configurer Companion Server

Dans le paquet de publication:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Modifiez `docker-compose.yml`:

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

`PUBLIC_BASE_URL` doit etre l'URL utilisee par l'iPhone, par exemple `http://192.168.1.20:4020` ou `https://ttdeck.example.com`.

## 6. Demarrer et verifier

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

Verifier l'etat:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

La reponse attendue contient:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Verifier les diagnostics:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Corrigez toute erreur bloquante `error` avant de connecter l'app. MQTT en etat `limited` est acceptable pour la premiere configuration.

## 7. Connecter l'app iPhone

1. Ouvrez TTDeck.
2. Ouvrez Settings.
3. Dans Connect, choisissez le mode Companion.
4. Saisissez `PUBLIC_BASE_URL` comme URL serveur.
5. Touchez Save and Test.
6. Ouvrez Access.
7. Saisissez `SETUP_SECRET`.
8. Touchez Bind With Setup Secret.
9. Revenez a l'ecran principal et actualisez.

## 8. Verification de securite

- `TOKEN_SECRET` et `SETUP_SECRET` ne sont pas les valeurs par defaut.
- `TOKEN_STORE_PATH` pointe vers un stockage persistant.
- `DEVICE_SECRET_REQUIRED` vaut `"true"`.
- Companion Server utilise un utilisateur de base en lecture seule.
- L'acces public utilise HTTPS.
- Seul Companion Server est expose.
- Postgres, TeslaMate et Grafana ne sont pas exposes publiquement, sauf si vous les avez securises separement et comprenez le risque.

## 9. Problemes courants

- `/healthz` fonctionne mais l'app n'a pas de donnees: lancez `/api/setup/diagnostics`; health prouve seulement que le serveur repond.
- `setup_forbidden`: l'en-tete `x-setup-secret` est absent ou incorrect.
- L'URL LAN ne fonctionne pas hors domicile: c'est normal. Utilisez votre acces distant ou une URL HTTPS publique.
- `127.0.0.1` echoue sur iPhone: c'est normal. Utilisez l'IP du NAS/serveur ou un domaine.
