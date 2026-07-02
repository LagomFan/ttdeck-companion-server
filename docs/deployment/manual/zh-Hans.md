# TTDeck Companion Server 手动配置教程

本教程帮助你把 TTDeck Companion Server 部署到自己的 NAS、服务器、VPS 或电脑上，然后在 iPhone App 中完成绑定。

Companion Server 是只读中间层：它读取你自己的 TeslaMate Postgres 数据库和可选 MQTT 实时数据，再给 TTDeck iPhone App 提供 API。TTDeck 开发者不会接收你的车辆数据。

## 1. 选择访问方式

TTDeck 不要求必须公网部署。服务器地址只需要能被你的 iPhone 访问到。

| 方式 | 示例地址 | 适合谁 | 注意事项 |
| --- | --- | --- | --- |
| NAS / 局域网 | `http://192.168.1.20:4020` | 只在家里 Wi-Fi 使用 | 离开该网络后无法刷新 |
| 公网 HTTPS | `https://ttdeck.example.com` | 外出也要访问 | 需要 HTTPS、DNS 和公网访问路径 |
| 本机测试 | `http://127.0.0.1:4020` | 模拟器或同机测试 | 不要用于 iPhone 真机 |

在 iPhone 真机上，`127.0.0.1` 指 iPhone 自己，不是你的 NAS、Mac 或服务器。

## 2. 准备条件

- 已运行的 TeslaMate，并且能看到车辆数据。
- 一台可以运行 Docker Compose 的设备。
- TTDeck Companion Server 发布包或源码目录。
- 一个 iPhone 能访问到的服务器地址。
- 如果对公网开放，建议使用 HTTPS。

先关闭 MQTT 和远程推送，等基础车辆数据可用后再单独配置。

## 3. 生成密钥

在服务器上运行：

```bash
openssl rand -hex 32
openssl rand -hex 32
```

第一条作为 `TOKEN_SECRET`，第二条作为 `SETUP_SECRET`。

不要把这些值发到公开帖子、截图、客服工单或 AI 对话里。

## 4. 创建只读数据库用户

在 TeslaMate Postgres 数据库中执行：

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

不要删除或修改 TeslaMate 原有数据库用户。给 TTDeck 单独新增只读用户即可。

## 5. 配置 Companion Server

进入发布包目录：

```bash
cp docker-compose.example.yml docker-compose.yml
```

编辑 `docker-compose.yml`：

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

`PUBLIC_BASE_URL` 必须是 iPhone 使用的地址，例如 `http://192.168.1.20:4020` 或 `https://ttdeck.example.com`。

## 6. 启动并验证

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

检查健康状态：

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

正常返回应包含：

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

检查数据源诊断：

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

绑定 App 前先修复阻断性的 `error`。MQTT 显示 `limited` 可以先继续。

## 7. 绑定 iPhone App

1. 打开 TTDeck。
2. 进入设置。
3. 在连接中选择 Companion 模式。
4. 服务器地址填写 `PUBLIC_BASE_URL`。
5. 点击保存并测试。
6. 进入访问。
7. 输入 `SETUP_SECRET`。
8. 点击使用设置密钥绑定。
9. 回到主界面刷新。

## 8. 安全检查

- `TOKEN_SECRET` 和 `SETUP_SECRET` 不是默认值。
- `TOKEN_STORE_PATH` 指向持久化存储。
- `DEVICE_SECRET_REQUIRED` 是 `"true"`。
- Companion Server 使用只读数据库用户。
- 公网访问使用 HTTPS。
- 只公开 Companion Server。
- 不公开 Postgres、TeslaMate、Grafana，除非你已单独加固并理解风险。

## 9. 常见问题

- `/healthz` 正常但 App 没数据：运行 `/api/setup/diagnostics`，健康检查只证明服务器活着。
- `setup_forbidden`：`x-setup-secret` 缺失或错误。
- 局域网地址离家后不可用：这是正常现象，需要自己的远程访问或公网 HTTPS。
- iPhone 上 `127.0.0.1` 不通：这是正常现象，请使用 NAS/服务器 IP 或域名。
