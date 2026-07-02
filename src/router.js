const crypto = require("node:crypto");
const QRCode = require("qrcode");
const {
  buildCharging,
  buildOverview,
  buildSafety,
  buildTripDetail,
  buildTrends,
  buildTrips
} = require("./data/summaries");
const {
  createReadToken,
  hashDeviceSecret,
  hashToken,
  verifyDeviceSecret,
  verifyToken
} = require("./security/tokens");

const DEFAULT_VEHICLE_SNAPSHOT_CACHE_TTL_MS = 5000;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function error(res, status, code, message, headers = {}) {
  const payload = JSON.stringify({
    ok: false,
    error: { code, message }
  });
  res.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "content-length": Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function timingSafeStringEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isLoopbackAddress(remoteAddress) {
  return [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ].includes(remoteAddress);
}

function isLoopbackHost(hostHeader) {
  const host = String(hostHeader || "").toLowerCase().replace(/:\d+$/, "");
  return [
    "localhost",
    "127.0.0.1",
    "[::1]"
  ].includes(host);
}

function requireSetupAccess(req, res, context) {
  const setupSecret = context.config.setupSecret;
  const requestSecret = req.headers["x-setup-secret"] || "";
  if (setupSecret && timingSafeStringEqual(requestSecret, setupSecret)) {
    return true;
  }

  const remoteAddress = req.socket?.remoteAddress || "";
  if (!setupSecret && isLoopbackAddress(remoteAddress) && isLoopbackHost(req.headers.host)) {
    return true;
  }

  error(res, 403, "setup_forbidden", "Pairing must be started from this server or with setup secret.");
  return false;
}

class RequestBodyError extends Error {
  constructor({ status, code, message }) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function readJson(req, { limitBytes = 64 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bodyBytes = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      bodyBytes += chunk.length;
      if (bodyBytes > limitBytes) {
        settled = true;
        reject(new RequestBodyError({
          status: 413,
          code: "body_too_large",
          message: "Request body is too large."
        }));
      }
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new RequestBodyError({
          status: 400,
          code: "invalid_json",
          message: "Request body must be valid JSON."
        }));
      }
    });
    req.on("error", (requestError) => {
      if (settled) return;
      settled = true;
      reject(requestError);
    });
  });
}

function clientRateKey(req, action) {
  return `${action}:${req.socket?.remoteAddress || "unknown"}`;
}

function enforceRateLimit(req, res, context, action) {
  if (!context.rateLimiter) return true;

  const result = context.rateLimiter.check(clientRateKey(req, action));
  if (result.allowed) return true;

  error(res, 429, "rate_limited", "Too many attempts. Try again later.", {
    "retry-after": String(result.retryAfterSeconds)
  });
  return false;
}

function sanitizeDeviceName(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return normalized || "Unknown Device";
}

function isTokenHash(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isDeviceSecret(value) {
  const normalized = String(value || "");
  return normalized.length >= 32 && normalized.length <= 256 && /^[A-Za-z0-9._~-]+$/.test(normalized);
}

function isApnsDeviceToken(value) {
  return /^[a-f0-9]{32,256}$/i.test(String(value || ""));
}

function pushEnvironment(value) {
  return value === "production" ? "production" : "development";
}

function requireDeviceSecret(req, res, context, record, tokenHash) {
  const rawDeviceSecret = String(req.headers["x-device-secret"] || "");
  if (record.deviceSecretHash) {
    if (!isDeviceSecret(rawDeviceSecret)) {
      error(res, 403, "device_secret_missing", "Device secret is required for this token.");
      return false;
    }

    if (!verifyDeviceSecret({
      rawDeviceSecret,
      expectedHash: record.deviceSecretHash,
      secret: context.config.tokenSecret
    })) {
      error(res, 403, "device_secret_invalid", "Device secret does not match this token.");
      return false;
    }

    return true;
  }

  if (!context.config.deviceSecretRequired) {
    return true;
  }

  if (!isDeviceSecret(rawDeviceSecret)) {
    error(res, 403, "device_secret_missing", "Device secret is required for this token.");
    return false;
  }

  context.bindingStore.bindDeviceSecret(tokenHash, hashDeviceSecret({
    rawDeviceSecret,
    secret: context.config.tokenSecret
  }));
  return true;
}

function requireAuth(req, res, context) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    error(res, 401, "token_missing", "Missing bearer token.");
    return false;
  }

  const rawToken = header.slice("Bearer ".length);
  const tokenHash = hashToken({
    rawToken,
    secret: context.config.tokenSecret
  });
  const record = context.bindingStore.findReadToken(tokenHash);

  if (!record) {
    error(res, 403, "token_invalid", "Invalid bearer token.");
    return false;
  }

  if (!verifyToken({
    rawToken,
    expectedHash: record.tokenHash,
    secret: context.config.tokenSecret
  })) {
    error(res, 403, "token_invalid", "Invalid bearer token.");
    return false;
  }

  if (!requireDeviceSecret(req, res, context, record, tokenHash)) {
    return null;
  }
  return { tokenHash, record };
}

function vehicleSnapshotCacheTtlMs(context) {
  return context.config?.vehicleSnapshotCacheTtlMs ?? DEFAULT_VEHICLE_SNAPSHOT_CACHE_TTL_MS;
}

function cacheEntryIsFresh(entry, now) {
  return entry && entry.expiresAt > now;
}

async function getCachedVehicle(context, vehicleId) {
  const cache = context.vehicleSnapshotCache;
  const ttlMs = vehicleSnapshotCacheTtlMs(context);
  if (!cache || ttlMs <= 0) {
    return await context.dataSource.getVehicle(vehicleId);
  }

  const key = String(vehicleId);
  const now = Date.now();
  const existing = cache.get(key);
  if (cacheEntryIsFresh(existing, now)) {
    return existing.promise || existing.value;
  }

  const promise = context.dataSource.getVehicle(vehicleId)
    .then((vehicle) => {
      cache.set(key, {
        value: vehicle,
        expiresAt: Date.now() + ttlMs
      });
      return vehicle;
    })
    .catch((loadError) => {
      if (cache.get(key)?.promise === promise) {
        cache.delete(key);
      }
      throw loadError;
    });

  cache.set(key, {
    promise,
    expiresAt: now + ttlMs
  });
  return await promise;
}

async function loadVehicle(context, res, vehicleId) {
  const vehicle = await getCachedVehicle(context, vehicleId);
  if (!vehicle) {
    error(res, 404, "vehicle_not_found", "Vehicle was not found.");
    return null;
  }
  return vehicle;
}

function realtimeFor(context, vehicleId) {
  return context.realtimeStore?.getSnapshot(vehicleId) || unavailableRealtime(vehicleId);
}

function unavailableRealtime(vehicleId) {
  return {
    vehicleId: String(vehicleId),
    available: false,
    connection: {
      enabled: false,
      connected: false,
      status: "disabled",
      lastMessageAt: null,
      ageSeconds: null,
      staleAfterSeconds: null,
      lastError: null
    },
    events: []
  };
}

function tripsQuery(url) {
  return {
    limit: url.searchParams.get("limit"),
    cursor: url.searchParams.get("cursor"),
    query: url.searchParams.get("query") || url.searchParams.get("q"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    filter: url.searchParams.get("filter"),
    sort: url.searchParams.get("sort")
  };
}

function mergeDiagnostics(checks, context) {
  const mqttCheck = context.realtimeStore?.getDiagnostics();
  if (!mqttCheck) return checks;

  const merged = checks.filter((check) => check.id !== "mqtt" && check.id !== "liveSafety");
  const postgresIndex = merged.findIndex((check) => check.id === "postgres");
  const insertAt = postgresIndex >= 0 ? postgresIndex + 1 : merged.length;
  merged.splice(insertAt, 0, mqttCheck);
  return merged;
}

const sectionVehicleLoaders = {
  overview: "getOverviewVehicle",
  safety: "getSafetyVehicle",
  charging: "getChargingVehicle",
  trends: "getTrendsVehicle"
};

async function loadSectionVehicle(context, res, vehicleId, section) {
  const loaderName = sectionVehicleLoaders[section];
  if (loaderName && typeof context.dataSource[loaderName] === "function") {
    const vehicle = await context.dataSource[loaderName](vehicleId);
    if (!vehicle) {
      error(res, 404, "vehicle_not_found", "Vehicle was not found.");
      return null;
    }
    return vehicle;
  }

  return await loadVehicle(context, res, vehicleId);
}

async function route(req, res, context = {}) {
  const url = new URL(req.url, "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/") {
    error(res, 404, "not_found", "Route not found.");
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    json(res, 200, {
      ok: true,
      data: {
        status: "ok",
        service: "api"
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/setup/diagnostics") {
    if (!requireSetupAccess(req, res, context)) return;

    const checks = mergeDiagnostics(await context.dataSource.getDiagnostics(), context);
    json(res, 200, {
      ok: true,
      data: {
        mode: context.config.dataSourceMode,
        checks
      }
    });
    return;
  }

  if (url.pathname === "/api/bind/start" && req.method === "POST") {
    if (!enforceRateLimit(req, res, context, "bind-start")) return;
    if (!requireSetupAccess(req, res, context)) return;

    const pairing = context.bindingStore.startPairing({
      publicBaseUrl: context.config.publicBaseUrl
    });
    const qrCodeDataUrl = await QRCode.toDataURL(pairing.qrPayload, {
      margin: 1,
      width: 256
    });

    json(res, 200, {
      ok: true,
      data: {
        ...pairing,
        qrCodeDataUrl
      }
    });
    return;
  }

  if (url.pathname === "/api/bind/complete" && req.method === "POST") {
    if (!enforceRateLimit(req, res, context, "bind-complete")) return;

    let body;
    try {
      body = await readJson(req, {
        limitBytes: context.config.requestBodyLimitBytes
      });
    } catch (requestError) {
      error(
        res,
        requestError.status || 400,
        requestError.code || "invalid_json",
        requestError.message || "Request body must be valid JSON."
      );
      return;
    }

    const pairingToken = String(body.pairingToken || "");
    const deviceName = sanitizeDeviceName(body.deviceName);
    const rawDeviceSecret = String(body.deviceSecret || "");
    if (context.config.deviceSecretRequired && !isDeviceSecret(rawDeviceSecret)) {
      error(res, 400, "device_secret_invalid", "Device secret is required to bind this device.");
      return;
    }

    const pairing = context.bindingStore.consumePairing({ pairingToken });

    if (!pairing) {
      error(res, 400, "pairing_invalid", "Pairing token is invalid or expired.");
      return;
    }

    const readToken = createReadToken({
      secret: context.config.tokenSecret
    });
    context.bindingStore.saveReadToken({
      tokenHash: readToken.hash,
      deviceName,
      deviceSecretHash: isDeviceSecret(rawDeviceSecret)
        ? hashDeviceSecret({
            rawDeviceSecret,
            secret: context.config.tokenSecret
          })
        : ""
    });

    json(res, 200, {
      ok: true,
      data: {
        readToken: readToken.raw,
        deviceName
      }
    });
    return;
  }

  if (url.pathname === "/api/bind/devices" && req.method === "GET") {
    if (!requireSetupAccess(req, res, context)) return;

    json(res, 200, {
      ok: true,
      data: {
        devices: context.bindingStore.listReadTokens()
      }
    });
    return;
  }

  if (url.pathname === "/api/notifications/status" && req.method === "GET") {
    const auth = requireAuth(req, res, context);
    if (!auth) return;

    const targets = context.bindingStore.listPushTargets();
    json(res, 200, {
      ok: true,
      data: {
        remotePushEnabled: Boolean(context.config.notifications?.enabled),
        apnsConfigured: Boolean(context.config.notifications?.apns?.enabled),
        registeredTokenCount: targets.filter((target) => target.tokenHash === auth.tokenHash).length
      }
    });
    return;
  }

  if (url.pathname === "/api/notifications/device-token" && req.method === "POST") {
    const auth = requireAuth(req, res, context);
    if (!auth) return;

    let body;
    try {
      body = await readJson(req, {
        limitBytes: context.config.requestBodyLimitBytes
      });
    } catch (requestError) {
      error(
        res,
        requestError.status || 400,
        requestError.code || "invalid_json",
        requestError.message || "Request body must be valid JSON."
      );
      return;
    }

    const deviceToken = String(body.deviceToken || "").toLowerCase();
    if (!isApnsDeviceToken(deviceToken)) {
      error(res, 400, "device_token_invalid", "APNs device token is invalid.");
      return;
    }

    const saved = context.bindingStore.savePushToken(auth.tokenHash, {
      deviceToken,
      environment: pushEnvironment(body.environment),
      bundleId: String(body.bundleId || context.config.notifications?.apns?.bundleId || "com.example.ttdeck"),
      preferences: body.preferences && typeof body.preferences === "object" ? body.preferences : {},
      registeredAt: new Date().toISOString()
    });
    json(res, 200, {
      ok: true,
      data: { registered: saved }
    });
    return;
  }

  if (url.pathname === "/api/notifications/device-token" && req.method === "DELETE") {
    const auth = requireAuth(req, res, context);
    if (!auth) return;

    const removed = context.bindingStore.removePushToken(auth.tokenHash);
    json(res, 200, {
      ok: true,
      data: { removed }
    });
    return;
  }

  const bindDeviceMatch = url.pathname.match(/^\/api\/bind\/devices\/([a-f0-9]{64})$/i);
  if (bindDeviceMatch && req.method === "DELETE") {
    if (!requireSetupAccess(req, res, context)) return;

    const [, tokenHash] = bindDeviceMatch;
    if (!isTokenHash(tokenHash)) {
      error(res, 400, "token_hash_invalid", "Token hash is invalid.");
      return;
    }

    const revoked = context.bindingStore.revokeReadToken(tokenHash);
    json(res, 200, {
      ok: true,
      data: { revoked }
    });
    return;
  }

  if (url.pathname === "/api/vehicles" && req.method === "GET") {
    if (!requireAuth(req, res, context)) return;
    const vehicles = await context.dataSource.listVehicles();
    json(res, 200, { ok: true, data: { vehicles } });
    return;
  }

  const tripDetailMatch = url.pathname.match(/^\/api\/vehicles\/([^/]+)\/trips\/([^/]+)$/);
  if (tripDetailMatch && req.method === "GET") {
    if (!requireAuth(req, res, context)) return;

    const [, vehicleId, tripId] = tripDetailMatch;
    if (context.dataSource.getTrip) {
      const trip = await context.dataSource.getTrip(vehicleId, decodeURIComponent(tripId));
      if (!trip) {
        error(res, 404, "trip_not_found", "Trip was not found.");
        return;
      }

      json(res, 200, { ok: true, data: trip });
      return;
    }

    const vehicle = await loadVehicle(context, res, vehicleId);
    if (!vehicle) return;

    const trip = buildTripDetail(vehicle, decodeURIComponent(tripId));
    if (!trip) {
      error(res, 404, "trip_not_found", "Trip was not found.");
      return;
    }

    json(res, 200, { ok: true, data: trip });
    return;
  }

  const match = url.pathname.match(/^\/api\/vehicles\/([^/]+)\/(overview|safety|charging|trips|trends|realtime)$/);
  if (match && req.method === "GET") {
    if (!requireAuth(req, res, context)) return;

    const [, vehicleId, section] = match;
    if (section === "trips" && context.dataSource.getTrips) {
      const trips = await context.dataSource.getTrips(vehicleId, tripsQuery(url));
      if (!trips) {
        error(res, 404, "vehicle_not_found", "Vehicle was not found.");
        return;
      }

      json(res, 200, { ok: true, data: trips });
      return;
    }

    const realtime = realtimeFor(context, vehicleId);
    if (section === "realtime") {
      json(res, 200, { ok: true, data: realtime });
      return;
    }

    const vehicle = await loadSectionVehicle(context, res, vehicleId, section);
    if (!vehicle) return;

    const builders = {
      overview: buildOverview,
      safety: buildSafety,
      charging: buildCharging,
      trips: buildTrips,
      trends: buildTrends
    };

    const payload = section === "trips"
      ? buildTrips(vehicle, tripsQuery(url))
      : builders[section](vehicle, realtime);
    json(res, 200, { ok: true, data: payload });
    return;
  }

  error(res, 404, "not_found", "Route not found.");
}

module.exports = {
  json,
  route
};
