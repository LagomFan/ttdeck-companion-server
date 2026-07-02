# TTDeck Companion Server 수동 설정

이 문서는 TTDeck Companion Server를 사용자의 NAS, 서버, VPS 또는 컴퓨터에 배포하고 iPhone 앱과 연결하는 방법을 설명합니다.

Companion Server는 읽기 전용 중간 서버입니다. 사용자의 TeslaMate Postgres 데이터베이스와 선택적인 MQTT 실시간 데이터를 읽고 TTDeck iPhone 앱에 API를 제공합니다. TTDeck 개발자는 차량 데이터를 받지 않습니다.

## 1. 접속 방식을 선택하세요

TTDeck은 반드시 공개 URL이 필요하지 않습니다. iPhone에서 Companion Server에 접속할 수 있으면 됩니다.

| 방식 | 예시 URL | 적합한 경우 | 참고 |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | 집 Wi-Fi에서만 사용 | 해당 네트워크를 벗어나면 새로고침할 수 없습니다 |
| 공개 HTTPS | `https://ttdeck.example.com` | 외부에서도 사용 | HTTPS, DNS, 공개 접속 경로가 필요합니다 |
| 로컬 테스트 | `http://127.0.0.1:4020` | 시뮬레이터 또는 같은 컴퓨터 테스트 | 실제 iPhone에는 사용하지 마세요 |

실제 iPhone에서 `127.0.0.1`은 iPhone 자신을 의미합니다. NAS, Mac, 서버가 아닙니다.

## 2. 준비물

- 차량 데이터를 볼 수 있는 TeslaMate.
- Docker Compose를 실행할 수 있는 장치.
- TTDeck Companion Server 릴리스 패키지 또는 소스 폴더.
- iPhone에서 접속 가능한 서버 URL.
- 공개 접속을 제공하는 경우 HTTPS.

처음에는 MQTT와 원격 푸시를 꺼두고, 기본 차량 데이터가 작동한 뒤에 추가 설정하세요.

## 3. 비밀값 생성

서버에서 실행합니다.

```bash
openssl rand -hex 32
openssl rand -hex 32
```

첫 번째 값은 `TOKEN_SECRET`, 두 번째 값은 `SETUP_SECRET`으로 사용합니다.

이 값을 공개 게시물, 스크린샷, 지원 티켓, AI 채팅에 붙여넣지 마세요.

## 4. 읽기 전용 데이터베이스 사용자 만들기

TeslaMate Postgres 데이터베이스에서 실행합니다.

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

기존 TeslaMate 데이터베이스 사용자를 삭제하거나 변경하지 마세요. TTDeck용 읽기 전용 사용자를 따로 추가하세요.

## 5. Companion Server 설정

릴리스 패키지 안에서 실행합니다.

```bash
cp docker-compose.example.yml docker-compose.yml
```

`docker-compose.yml`을 편집합니다.

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

`PUBLIC_BASE_URL`은 iPhone이 사용할 URL입니다. 예: `http://192.168.1.20:4020` 또는 `https://ttdeck.example.com`.

## 6. 시작 및 확인

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

상태 확인:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

정상 응답에는 다음이 포함됩니다.

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

데이터 소스 진단:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

앱을 연결하기 전에 차단성 `error`를 수정하세요. MQTT가 `limited`이면 첫 설정은 계속 진행할 수 있습니다.

## 7. iPhone 앱 연결

1. TTDeck을 엽니다.
2. Settings를 엽니다.
3. Connect에서 Companion 모드를 선택합니다.
4. 서버 URL에 `PUBLIC_BASE_URL`을 입력합니다.
5. Save and Test를 누릅니다.
6. Access를 엽니다.
7. `SETUP_SECRET`을 입력합니다.
8. Bind With Setup Secret을 누릅니다.
9. 메인 화면으로 돌아가 새로고침합니다.

## 8. 보안 확인

- `TOKEN_SECRET`과 `SETUP_SECRET`이 기본값이 아닙니다.
- `TOKEN_STORE_PATH`가 영구 저장소를 가리킵니다.
- `DEVICE_SECRET_REQUIRED`가 `"true"`입니다.
- Companion Server가 읽기 전용 데이터베이스 사용자를 사용합니다.
- 공개 접속은 HTTPS를 사용합니다.
- 공개하는 것은 Companion Server뿐입니다.
- Postgres, TeslaMate, Grafana는 별도로 보호하고 위험을 이해하지 않았다면 공개하지 마세요.

## 9. 자주 있는 문제

- `/healthz`는 성공하지만 앱에 데이터가 없음: `/api/setup/diagnostics`를 실행하세요. health는 서버가 살아 있다는 뜻일 뿐입니다.
- `setup_forbidden`: `x-setup-secret` 헤더가 없거나 잘못되었습니다.
- LAN URL이 집 밖에서 작동하지 않음: 정상입니다. 별도의 원격 접속 또는 공개 HTTPS가 필요합니다.
- iPhone에서 `127.0.0.1` 실패: 정상입니다. NAS/서버 IP 또는 도메인을 사용하세요.
