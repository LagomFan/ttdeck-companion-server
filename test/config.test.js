const assert = require("node:assert/strict");
const test = require("node:test");
const { loadConfig } = require("../src/config");

test("loadConfig uses safe defaults", () => {
  const config = loadConfig({});

  assert.deepEqual(config, {
    bindHost: "127.0.0.1",
    port: 4020,
    publicBaseUrl: "http://127.0.0.1:4020",
    dataSourceMode: "fixture",
    tokenSecret: "dev-only-token-secret",
    setupSecret: "",
    tokenStorePath: "",
    requestBodyLimitBytes: 65536,
    bindRateLimit: {
      windowMs: 60000,
      maxAttempts: 20
    },
    productionErrors: false,
    requestLogging: false,
    deviceSecretRequired: false,
    teslamate: {
      databaseUrl: "",
      database: {
        host: "127.0.0.1",
        port: 5432,
        database: "teslamate",
        user: "teslamate",
        password: "",
        ssl: false
      },
      queryTimeoutMs: 5000
    },
    mqtt: {
      enabled: false,
      url: "mqtt://127.0.0.1:1883",
      username: "",
      password: "",
      topicPrefix: "teslamate/cars",
      connectTimeoutMs: 5000,
      reconnectPeriodMs: 5000,
      staleAfterSeconds: 300
    },
    notifications: {
      enabled: false,
      pollIntervalMs: 45000,
      postTripWatchMinutes: 15,
      stateStorePath: "",
      eventHistoryLimit: 500,
      apns: {
        enabled: false,
        environment: "development",
        teamId: "",
        keyId: "",
        bundleId: "com.example.ttdeck",
        privateKey: "",
        privateKeyPath: ""
      }
    }
  });
});

test("loadConfig accepts environment overrides", () => {
  const config = loadConfig({
    BIND_HOST: "0.0.0.0",
    PORT: "5050",
    PUBLIC_BASE_URL: "https://ttdeck.example.test",
    DATA_SOURCE_MODE: "teslamate",
    TOKEN_SECRET: "local-secret",
    SETUP_SECRET: "setup-secret",
    TOKEN_STORE_PATH: "/data/bindings.json",
    REQUEST_BODY_LIMIT_BYTES: "4096",
    BIND_RATE_LIMIT_WINDOW_MS: "30000",
    BIND_RATE_LIMIT_MAX_ATTEMPTS: "5",
    NODE_ENV: "production",
    TESLAMATE_DATABASE_URL: "postgres://db.example.test:5432/teslamate?user=readonly&password=placeholder",
    TESLAMATE_DB_QUERY_TIMEOUT_MS: "2500",
    MQTT_ENABLED: "true",
    MQTT_URL: "mqtt://mosquitto:1883",
    MQTT_USERNAME: "readonly",
    MQTT_PASSWORD: "mqtt-secret",
    MQTT_TOPIC_PREFIX: "/teslamate/cars/",
    MQTT_CONNECT_TIMEOUT_MS: "2000",
    MQTT_RECONNECT_PERIOD_MS: "3000",
    MQTT_STALE_AFTER_SECONDS: "120",
    PUSH_NOTIFICATIONS_ENABLED: "true",
    NOTIFICATION_POLL_INTERVAL_MS: "30000",
    POST_TRIP_WATCH_MINUTES: "10",
    NOTIFICATION_STATE_STORE_PATH: "/data/notification-state.json",
    NOTIFICATION_EVENT_HISTORY_LIMIT: "1000",
    APNS_ENABLED: "true",
    APNS_ENVIRONMENT: "production",
    APNS_TEAM_ID: "TEAM123456",
    APNS_KEY_ID: "KEY1234567",
    APNS_BUNDLE_ID: "com.example.ttdeck",
    APNS_PRIVATE_KEY_PATH: "/run/secrets/apns-test-key.p8",
    DEVICE_SECRET_REQUIRED: "true"
  });

  assert.deepEqual(config, {
    bindHost: "0.0.0.0",
    port: 5050,
    publicBaseUrl: "https://ttdeck.example.test",
    dataSourceMode: "teslamate",
    tokenSecret: "local-secret",
    setupSecret: "setup-secret",
    tokenStorePath: "/data/bindings.json",
    requestBodyLimitBytes: 4096,
    bindRateLimit: {
      windowMs: 30000,
      maxAttempts: 5
    },
    productionErrors: true,
    requestLogging: true,
    deviceSecretRequired: true,
    teslamate: {
      databaseUrl: "postgres://db.example.test:5432/teslamate?user=readonly&password=placeholder",
      database: null,
      queryTimeoutMs: 2500
    },
    mqtt: {
      enabled: true,
      url: "mqtt://mosquitto:1883",
      username: "readonly",
      password: "mqtt-secret",
      topicPrefix: "teslamate/cars",
      connectTimeoutMs: 2000,
      reconnectPeriodMs: 3000,
      staleAfterSeconds: 120
    },
    notifications: {
      enabled: true,
      pollIntervalMs: 30000,
      postTripWatchMinutes: 10,
      stateStorePath: "/data/notification-state.json",
      eventHistoryLimit: 1000,
      apns: {
        enabled: true,
        environment: "production",
        teamId: "TEAM123456",
        keyId: "KEY1234567",
        bundleId: "com.example.ttdeck",
        privateKey: "",
        privateKeyPath: "/run/secrets/apns-test-key.p8"
      }
    }
  });
});

test("loadConfig accepts split TeslaMate database fields", () => {
  const config = loadConfig({
    TESLAMATE_DB_HOST: "postgres",
    TESLAMATE_DB_PORT: "6543",
    TESLAMATE_DB_NAME: "teslamate_prod",
    TESLAMATE_DB_USER: "readonly",
    TESLAMATE_DB_PASSWORD: "secret",
    TESLAMATE_DB_SSL: "true"
  });

  assert.deepEqual(config.teslamate.database, {
    host: "postgres",
    port: 6543,
    database: "teslamate_prod",
    user: "readonly",
    password: "secret",
    ssl: true
  });
});

test("loadConfig rejects invalid port", () => {
  assert.throws(
    () => loadConfig({ PORT: "abc" }),
    /PORT must be an integer/
  );
});

test("loadConfig rejects non-decimal port formats", () => {
  for (const port of ["1e3", "0x10", "4020.0", " 4020"]) {
    assert.throws(
      () => loadConfig({ PORT: port }),
      /PORT must be an integer/
    );
  }
});

test("loadConfig rejects unsupported data source mode", () => {
  assert.throws(
    () => loadConfig({ DATA_SOURCE_MODE: "grafana" }),
    /DATA_SOURCE_MODE must be fixture or teslamate/
  );
});

test("loadConfig rejects invalid TeslaMate database settings", () => {
  assert.throws(
    () => loadConfig({ TESLAMATE_DB_PORT: "5432.0" }),
    /TESLAMATE_DB_PORT must be a positive integer/
  );
  assert.throws(
    () => loadConfig({ TESLAMATE_DB_SSL: "maybe" }),
    /TESLAMATE_DB_SSL must be true or false/
  );
  assert.throws(
    () => loadConfig({ REQUEST_BODY_LIMIT_BYTES: "0" }),
    /REQUEST_BODY_LIMIT_BYTES must be a positive integer/
  );
  assert.throws(
    () => loadConfig({ BIND_RATE_LIMIT_MAX_ATTEMPTS: "many" }),
    /BIND_RATE_LIMIT_MAX_ATTEMPTS must be a positive integer/
  );
  assert.throws(
    () => loadConfig({ MQTT_ENABLED: "maybe" }),
    /MQTT_ENABLED must be true or false/
  );
  assert.throws(
    () => loadConfig({ MQTT_STALE_AFTER_SECONDS: "0" }),
    /MQTT_STALE_AFTER_SECONDS must be a positive integer/
  );
  assert.throws(
    () => loadConfig({ PUSH_NOTIFICATIONS_ENABLED: "maybe" }),
    /PUSH_NOTIFICATIONS_ENABLED must be true or false/
  );
  assert.throws(
    () => loadConfig({ NOTIFICATION_POLL_INTERVAL_MS: "0" }),
    /NOTIFICATION_POLL_INTERVAL_MS must be a positive integer/
  );
  assert.throws(
    () => loadConfig({ APNS_ENVIRONMENT: "staging" }),
    /APNS_ENVIRONMENT must be one of/
  );
});
