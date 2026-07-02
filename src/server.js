const http = require("node:http");
const { createBindingStore } = require("./binding/bindingStore");
const { loadConfig } = require("./config");
const { createDataSource } = require("./data/dataSourceFactory");
const { createApnsClient } = require("./notifications/apnsClient");
const { createNotificationStateStore } = require("./notifications/notificationStateStore");
const { createTripNotificationMonitor } = require("./notifications/tripNotificationMonitor");
const { createMqttTelemetryService } = require("./realtime/mqttTelemetryService");
const { createRealtimeStore } = require("./realtime/realtimeStore");
const { route } = require("./router");
const { createRateLimiter } = require("./security/rateLimiter");

function requestDurationMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

function logRequest({ config, req, res, startedAt }) {
  if (!config.requestLogging) return;

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const durationMs = requestDurationMs(startedAt);
  const contentLength = res.getHeader?.("content-length");
  console.log(JSON.stringify({
    event: "http_request",
    method: req.method,
    path: url.pathname,
    status: res.statusCode,
    durationMs: Number(durationMs.toFixed(1)),
    contentLength: contentLength === undefined ? null : Number(contentLength)
  }));
}

function createServer(options = {}) {
  const config = options.config || loadConfig({});
  const dataSource = options.dataSource || createDataSource(config);
  const bindingStore = options.bindingStore || createBindingStore({
    tokenStorePath: config.tokenStorePath
  });
  const rateLimiter = options.rateLimiter || createRateLimiter(config.bindRateLimit);
  const realtimeStore = options.realtimeStore || createRealtimeStore(config.mqtt);
  const vehicleSnapshotCache = options.vehicleSnapshotCache || new Map();
  const realtimeService = options.realtimeService === undefined && config.mqtt.enabled
    ? createMqttTelemetryService({ config: config.mqtt, store: realtimeStore })
    : options.realtimeService;
  const pushClient = options.pushClient || createApnsClient(config.notifications.apns);
  const notificationStateStore = options.notificationStateStore || createNotificationStateStore(config.notifications);
  const tripNotificationMonitor = options.tripNotificationMonitor === undefined && config.notifications.enabled
    ? createTripNotificationMonitor({
        config: config.notifications,
        dataSource,
        realtimeStore,
        bindingStore,
        stateStore: notificationStateStore,
        pushClient
      })
    : options.tripNotificationMonitor;

  const server = http.createServer((req, res) => {
    const startedAt = process.hrtime.bigint();
    route(req, res, { bindingStore, config, dataSource, rateLimiter, realtimeStore, vehicleSnapshotCache }).catch((error) => {
      console.error(error);
      const payload = JSON.stringify({
        ok: false,
        error: {
          code: "internal_error",
          message: config.productionErrors ? "Internal server error." : error.message
        }
      });
      res.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-length": Buffer.byteLength(payload)
      });
      res.end(payload);
    }).finally(() => {
      logRequest({ config, req, res, startedAt });
    });
  });

  server.realtimeService = realtimeService || null;
  server.tripNotificationMonitor = tripNotificationMonitor || null;
  server.pushClient = pushClient || null;
  return server;
}

module.exports = {
  createServer
};
