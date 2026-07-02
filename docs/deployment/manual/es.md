# Configuracion manual de TTDeck Companion Server

Esta guia te ayuda a desplegar TTDeck Companion Server en tu NAS, servidor, VPS u ordenador, y despues vincular la app de iPhone.

Companion Server es un puente de solo lectura. Lee tu base de datos TeslaMate Postgres y, opcionalmente, datos en tiempo real MQTT, y ofrece una API a la app TTDeck para iPhone. El desarrollador de TTDeck no recibe tus datos del vehiculo.

## 1. Elegir el modo de acceso

TTDeck no requiere una URL publica. La URL del servidor solo debe ser accesible desde tu iPhone.

| Modo | URL de ejemplo | Ideal para | Nota |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | Uso en Wi-Fi de casa | No funcionara fuera de esa red |
| HTTPS publico | `https://ttdeck.example.com` | Acceso fuera de casa | Requiere HTTPS, DNS y ruta publica |
| Prueba local | `http://127.0.0.1:4020` | Simulador o misma maquina | No lo uses en un iPhone real |

En un iPhone real, `127.0.0.1` significa el propio iPhone, no tu NAS, Mac o servidor.

## 2. Requisitos

- Una instalacion TeslaMate funcionando y con datos del vehiculo.
- Un dispositivo que pueda ejecutar Docker Compose.
- El paquete de TTDeck Companion Server o la carpeta de codigo fuente.
- Una URL de servidor accesible desde el iPhone.
- HTTPS si expones el servicio publicamente.

Empieza con MQTT y push remoto desactivados. Configuralos despues de confirmar que los datos basicos funcionan.

## 3. Generar secretos

Ejecuta en el servidor:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Usa el primer valor como `TOKEN_SECRET` y el segundo como `SETUP_SECRET`.

No compartas estos valores en publicaciones publicas, capturas, tickets de soporte ni chats con AI.

## 4. Crear un usuario de base de datos de solo lectura

Ejecuta en la base Postgres de TeslaMate:

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

No borres ni cambies el usuario original de TeslaMate. Anade un usuario separado de solo lectura para TTDeck.

## 5. Configurar Companion Server

Dentro del paquete:

```bash
cp docker-compose.example.yml docker-compose.yml
```

Edita `docker-compose.yml`:

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

`PUBLIC_BASE_URL` debe ser la URL que usara el iPhone, por ejemplo `http://192.168.1.20:4020` o `https://ttdeck.example.com`.

## 6. Iniciar y verificar

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

Comprobar salud:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

La respuesta esperada contiene:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

Comprobar diagnostico:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

Corrige cualquier `error` bloqueante antes de vincular la app. MQTT en estado `limited` es aceptable para la primera configuracion.

## 7. Vincular la app de iPhone

1. Abre TTDeck.
2. Abre Settings.
3. En Connect, elige modo Companion.
4. Introduce `PUBLIC_BASE_URL` como URL del servidor.
5. Toca Save and Test.
6. Abre Access.
7. Introduce `SETUP_SECRET`.
8. Toca Bind With Setup Secret.
9. Vuelve a la pantalla principal y actualiza.

## 8. Lista de seguridad

- `TOKEN_SECRET` y `SETUP_SECRET` no son valores por defecto.
- `TOKEN_STORE_PATH` apunta a almacenamiento persistente.
- `DEVICE_SECRET_REQUIRED` es `"true"`.
- Companion Server usa un usuario de base de datos de solo lectura.
- El acceso publico usa HTTPS.
- Solo Companion Server esta expuesto.
- Postgres, TeslaMate y Grafana no estan expuestos publicamente salvo que los hayas protegido aparte y entiendas el riesgo.

## 9. Problemas comunes

- `/healthz` funciona pero la app no tiene datos: ejecuta `/api/setup/diagnostics`; health solo prueba que el servidor responde.
- `setup_forbidden`: falta el encabezado `x-setup-secret` o es incorrecto.
- La URL LAN no funciona fuera de casa: es normal. Usa tu acceso remoto o HTTPS publico.
- `127.0.0.1` falla en iPhone: es normal. Usa la IP del NAS/servidor o un dominio.
