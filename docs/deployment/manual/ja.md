# TTDeck Companion Server 手動セットアップ

このガイドでは、TTDeck Companion Server を自分の NAS、サーバー、VPS、またはコンピューターに配置し、iPhone アプリと接続する手順を説明します。

Companion Server は読み取り専用の中継サーバーです。自分の TeslaMate Postgres データベースと任意の MQTT リアルタイムデータを読み取り、TTDeck iPhone アプリに API を提供します。TTDeck の開発者が車両データを受け取ることはありません。

## 1. アクセス方法を選ぶ

TTDeck に公開 URL は必須ではありません。iPhone から Companion Server に到達できれば十分です。

| 方法 | URL 例 | 向いている用途 | 注意 |
| --- | --- | --- | --- |
| NAS / LAN | `http://192.168.1.20:4020` | 自宅 Wi-Fi のみ | そのネットワーク外では更新できません |
| 公開 HTTPS | `https://ttdeck.example.com` | 外出先でもアクセス | HTTPS、DNS、公開経路が必要です |
| ローカルテスト | `http://127.0.0.1:4020` | シミュレーターまたは同一マシン | 実機 iPhone には使わないでください |

実機 iPhone での `127.0.0.1` は iPhone 自身を指します。NAS、Mac、サーバーではありません。

## 2. 必要なもの

- 車両データが表示できる TeslaMate。
- Docker Compose を実行できるデバイス。
- TTDeck Companion Server のリリースパッケージまたはソースフォルダー。
- iPhone から到達できるサーバー URL。
- 公開アクセスを使う場合は HTTPS。

最初は MQTT とリモートプッシュを無効にして、基本の車両データが動作してから追加設定してください。

## 3. シークレットを生成する

サーバーで実行します。

```bash
openssl rand -hex 32
openssl rand -hex 32
```

1 つ目を `TOKEN_SECRET`、2 つ目を `SETUP_SECRET` として使います。

これらの値を公開投稿、スクリーンショット、サポートチケット、AI チャットに貼り付けないでください。

## 4. 読み取り専用データベースユーザーを作成する

TeslaMate の Postgres データベース内で実行します。

```sql
CREATE USER ttdeck_readonly WITH PASSWORD '<readonly-password>';
GRANT CONNECT ON DATABASE teslamate TO ttdeck_readonly;
GRANT USAGE ON SCHEMA public TO ttdeck_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ttdeck_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ttdeck_readonly;
```

TeslaMate の既存データベースユーザーを削除または変更しないでください。TTDeck 用に別の読み取り専用ユーザーを追加します。

## 5. Companion Server を設定する

リリースパッケージ内で実行します。

```bash
cp docker-compose.example.yml docker-compose.yml
```

`docker-compose.yml` を編集します。

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

`PUBLIC_BASE_URL` は iPhone が使う URL です。例: `http://192.168.1.20:4020` または `https://ttdeck.example.com`。

## 6. 起動して確認する

```bash
docker compose up -d --build
docker compose logs --tail=100 companion
```

ヘルスチェック:

```bash
curl -sS <PUBLIC_BASE_URL>/healthz
```

期待される応答:

```json
{"ok":true,"data":{"status":"ok","service":"api"}}
```

データソース診断:

```bash
curl -sS -H "x-setup-secret: <SETUP_SECRET>" <PUBLIC_BASE_URL>/api/setup/diagnostics
```

アプリを接続する前に、ブロックする `error` を修正してください。MQTT が `limited` の場合は初回設定を続けられます。

## 7. iPhone アプリを接続する

1. TTDeck を開きます。
2. Settings を開きます。
3. Connect で Companion モードを選びます。
4. サーバー URL に `PUBLIC_BASE_URL` を入力します。
5. Save and Test をタップします。
6. Access を開きます。
7. `SETUP_SECRET` を入力します。
8. Bind With Setup Secret をタップします。
9. メイン画面に戻って更新します。

## 8. セキュリティチェック

- `TOKEN_SECRET` と `SETUP_SECRET` がデフォルト値ではない。
- `TOKEN_STORE_PATH` が永続ストレージを指している。
- `DEVICE_SECRET_REQUIRED` が `"true"`。
- Companion Server が読み取り専用データベースユーザーを使っている。
- 公開アクセスには HTTPS を使う。
- 公開するのは Companion Server のみ。
- Postgres、TeslaMate、Grafana は、別途保護してリスクを理解していない限り公開しない。

## 9. よくある問題

- `/healthz` は成功するがアプリにデータがない: `/api/setup/diagnostics` を実行してください。ヘルスチェックはサーバーの稼働だけを示します。
- `setup_forbidden`: `x-setup-secret` ヘッダーがない、または間違っています。
- LAN URL が外出先で使えない: 正常です。自分のリモートアクセスまたは公開 HTTPS が必要です。
- iPhone で `127.0.0.1` が失敗する: 正常です。NAS/サーバーの IP またはドメインを使ってください。
