# TTDeck Companion Server 手動設定教學

本教學協助你把 TTDeck Companion Server 部署到自己的 NAS、伺服器、VPS 或電腦上，然後在 iPhone App 中完成綁定。

Companion Server 是唯讀中介層：它讀取你自己的 TeslaMate Postgres 資料庫和可選的 MQTT 即時資料，再提供 API 給 TTDeck iPhone App。TTDeck 開發者不會接收你的車輛資料。

## 1. 選擇存取方式

TTDeck 不要求一定要公網部署。伺服器位址只需要能被你的 iPhone 存取。

| 方式 | 範例位址 | 適合對象 | 注意事項 |
| --- | --- | --- | --- |
| NAS / 區域網路 | `http://192.168.1.20:4020` | 只在家中 Wi-Fi 使用 | 離開該網路後無法更新 |
| 公網 HTTPS | `https://ttdeck.example.com` | 外出也需要存取 | 需要 HTTPS、DNS 和公網路徑 |
| 本機測試 | `http://127.0.0.1:4020` | 模擬器或同機測試 | 不要用於 iPhone 真機 |

在 iPhone 真機上，`127.0.0.1` 指的是 iPhone 自己，不是你的 NAS、Mac 或伺服器。

## 2. 準備條件

- 已運行的 TeslaMate，且能看到車輛資料。
- 一台可運行 Docker Compose 的設備。
- TTDeck Companion Server 發布包或原始碼目錄。
- 一個 iPhone 能存取的伺服器位址。
- 如果對公網開放，建議使用 HTTPS。

先關閉 MQTT 和遠端推播，等基礎車輛資料可用後再個別設定。

## 3. 產生密鑰

在伺服器上執行：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

第一個值作為 `TOKEN_SECRET`，第二個值作為 `SETUP_SECRET`。

不要把這些值發到公開貼文、截圖、客服工單或 AI 對話中。

## 4. 建立唯讀資料庫使用者

在 TeslaMate Postgres 資料庫中執行：

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

不要刪除或修改 TeslaMate 原有資料庫使用者。請為 TTDeck 另外新增唯讀使用者。

## 5. 設定 Companion Server

進入發布包目錄：

```bash
cp docker-compose.example.yml docker-compose.yml
```

編輯 `docker-compose.yml`：

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

`PUBLIC_BASE_URL` 必須是 iPhone 使用的位址，例如 `http://192.168.1.20:4020` 或 `https://ttdeck.example.com`。

## 6. 啟動並驗證

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

檢查健康狀態：

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

正常回應應包含：

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

檢查資料來源診斷：

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

綁定 App 前先修復阻斷性的 `error`。MQTT 顯示 `limited` 可以先繼續。

## 7. 綁定 iPhone App

1. 開啟 TTDeck。
2. 進入設定。
3. 在連線中選擇 Companion 模式。
4. 伺服器位址填寫 `PUBLIC_BASE_URL`。
5. 點選儲存並測試。
6. 進入存取。
7. 輸入 `SETUP_SECRET`。
8. 點選使用設定密鑰綁定。
9. 回到主畫面並更新。

## 8. 安全檢查

- `TOKEN_SECRET` 和 `SETUP_SECRET` 不是預設值。
- `TOKEN_STORE_PATH` 指向持久化儲存。
- `DEVICE_SECRET_REQUIRED` 是 `"true"`。
- Companion Server 使用唯讀資料庫使用者。
- 公網存取使用 HTTPS。
- 只公開 Companion Server。
- 不公開 Postgres、TeslaMate、Grafana，除非你已另外加固並理解風險。

## 9. 常見問題

- `/healthz` 正常但 App 沒有資料：執行 `/api/setup/diagnostics`，健康檢查只證明伺服器仍在運行。
- `setup_forbidden`：`x-setup-secret` 缺失或錯誤。
- 區域網路位址離家後不可用：這是正常現象，需要自己的遠端存取或公網 HTTPS。
- iPhone 上 `127.0.0.1` 不通：這是正常現象，請使用 NAS/伺服器 IP 或網域。
