function parsePort(value) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

function parseBoolean(value, name, fallback = false) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(String(value).toLowerCase())) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(String(value).toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
}

function parsePositiveInteger(value, name, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Number(value);
}

function parseEnum(value, name, allowedValues, fallback) {
  if (value === undefined || value === "") {
    return fallback;
  }

  const normalized = String(value).toLowerCase();
  if (!allowedValues.includes(normalized)) {
    throw new Error(`${name} must be one of: ${allowedValues.join(", ")}.`);
  }
  return normalized;
}

function normalizeTopicPrefix(value) {
  return String(value || "teslamate/cars").replace(/^\/+|\/+$/g, "");
}

function loadConfig(env = process.env) {
  const bindHost = env.BIND_HOST || "127.0.0.1";
  const port = parsePort(env.PORT || "4020");
  const publicBaseUrl = env.PUBLIC_BASE_URL || `http://${bindHost}:${port}`;
  const dataSourceMode = env.DATA_SOURCE_MODE || "fixture";
  const tokenSecret = env.TOKEN_SECRET || "dev-only-token-secret";
  const setupSecret = env.SETUP_SECRET || "";
  const tokenStorePath = env.TOKEN_STORE_PATH || "";
  const teslamateDatabaseUrl = env.TESLAMATE_DATABASE_URL || "";

  if (!["fixture", "teslamate"].includes(dataSourceMode)) {
    throw new Error("DATA_SOURCE_MODE must be fixture or teslamate.");
  }

  return {
    bindHost,
    port,
    publicBaseUrl,
    dataSourceMode,
    tokenSecret,
    setupSecret,
    tokenStorePath,
    requestBodyLimitBytes: parsePositiveInteger(
      env.REQUEST_BODY_LIMIT_BYTES,
      "REQUEST_BODY_LIMIT_BYTES",
      64 * 1024
    ),
    bindRateLimit: {
      windowMs: parsePositiveInteger(
        env.BIND_RATE_LIMIT_WINDOW_MS,
        "BIND_RATE_LIMIT_WINDOW_MS",
        60 * 1000
      ),
      maxAttempts: parsePositiveInteger(
        env.BIND_RATE_LIMIT_MAX_ATTEMPTS,
        "BIND_RATE_LIMIT_MAX_ATTEMPTS",
        20
      )
    },
    productionErrors: env.NODE_ENV === "production",
    requestLogging: parseBoolean(
      env.REQUEST_LOGGING,
      "REQUEST_LOGGING",
      env.NODE_ENV === "production"
    ),
    deviceSecretRequired: parseBoolean(
      env.DEVICE_SECRET_REQUIRED,
      "DEVICE_SECRET_REQUIRED",
      false
    ),
    teslamate: {
      databaseUrl: teslamateDatabaseUrl,
      database: teslamateDatabaseUrl
        ? null
        : {
            host: env.TESLAMATE_DB_HOST || "127.0.0.1",
            port: parsePositiveInteger(env.TESLAMATE_DB_PORT, "TESLAMATE_DB_PORT", 5432),
            database: env.TESLAMATE_DB_NAME || "teslamate",
            user: env.TESLAMATE_DB_USER || "teslamate",
            password: env.TESLAMATE_DB_PASSWORD || "",
            ssl: parseBoolean(env.TESLAMATE_DB_SSL, "TESLAMATE_DB_SSL", false)
          },
      queryTimeoutMs: parsePositiveInteger(
        env.TESLAMATE_DB_QUERY_TIMEOUT_MS,
        "TESLAMATE_DB_QUERY_TIMEOUT_MS",
        5000
      )
    },
    mqtt: {
      enabled: parseBoolean(env.MQTT_ENABLED, "MQTT_ENABLED", false),
      url: env.MQTT_URL || "mqtt://127.0.0.1:1883",
      username: env.MQTT_USERNAME || "",
      password: env.MQTT_PASSWORD || "",
      topicPrefix: normalizeTopicPrefix(env.MQTT_TOPIC_PREFIX),
      connectTimeoutMs: parsePositiveInteger(
        env.MQTT_CONNECT_TIMEOUT_MS,
        "MQTT_CONNECT_TIMEOUT_MS",
        5000
      ),
      reconnectPeriodMs: parsePositiveInteger(
        env.MQTT_RECONNECT_PERIOD_MS,
        "MQTT_RECONNECT_PERIOD_MS",
        5000
      ),
      staleAfterSeconds: parsePositiveInteger(
        env.MQTT_STALE_AFTER_SECONDS,
        "MQTT_STALE_AFTER_SECONDS",
        300
      )
    },
    notifications: {
      enabled: parseBoolean(env.PUSH_NOTIFICATIONS_ENABLED, "PUSH_NOTIFICATIONS_ENABLED", false),
      pollIntervalMs: parsePositiveInteger(
        env.NOTIFICATION_POLL_INTERVAL_MS,
        "NOTIFICATION_POLL_INTERVAL_MS",
        45 * 1000
      ),
      postTripWatchMinutes: parsePositiveInteger(
        env.POST_TRIP_WATCH_MINUTES,
        "POST_TRIP_WATCH_MINUTES",
        15
      ),
      postTripSafetyGraceSeconds: parsePositiveInteger(
        env.POST_TRIP_SAFETY_GRACE_SECONDS,
        "POST_TRIP_SAFETY_GRACE_SECONDS",
        90
      ),
      stateStorePath: env.NOTIFICATION_STATE_STORE_PATH || "",
      eventHistoryLimit: parsePositiveInteger(
        env.NOTIFICATION_EVENT_HISTORY_LIMIT,
        "NOTIFICATION_EVENT_HISTORY_LIMIT",
        500
      ),
      apns: {
        enabled: parseBoolean(env.APNS_ENABLED, "APNS_ENABLED", false),
        environment: parseEnum(
          env.APNS_ENVIRONMENT,
          "APNS_ENVIRONMENT",
          ["development", "production"],
          "development"
        ),
        teamId: env.APNS_TEAM_ID || "",
        keyId: env.APNS_KEY_ID || "",
        bundleId: env.APNS_BUNDLE_ID || "com.lagom.ttdeck",
        privateKey: env.APNS_PRIVATE_KEY || "",
        privateKeyPath: env.APNS_PRIVATE_KEY_PATH || ""
      }
    }
  };
}

module.exports = {
  loadConfig
};
