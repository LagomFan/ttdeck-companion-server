const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function token(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

function isTokenHash(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

function isApnsDeviceToken(value) {
  return /^[a-f0-9]{32,256}$/i.test(String(value || ""));
}

function booleanPreference(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function integerPreference(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizePushPreferences(preferences = {}) {
  return {
    tripEvents: booleanPreference(preferences.tripEvents ?? preferences.notifyTripEvents, true),
    chargingEvents: booleanPreference(preferences.chargingEvents ?? preferences.notifyChargingEvents, true),
    safetyEvents: booleanPreference(preferences.safetyEvents ?? preferences.notifySafetyEvents, true),
    staleDataEvents: booleanPreference(preferences.staleDataEvents ?? preferences.notifyStaleDataEvents, false),
    quietHoursEnabled: booleanPreference(preferences.quietHoursEnabled, false),
    lowBatteryThresholdPercent: integerPreference(preferences.lowBatteryThresholdPercent, 5, 50, 20),
    parkingDrainThresholdPercent: integerPreference(preferences.parkingDrainThresholdPercent, 1, 15, 3)
  };
}

function normalizePushTokenRecord(record, existingRecord = null) {
  const token = String(record.deviceToken || record.token || "").toLowerCase();
  if (!isApnsDeviceToken(token)) {
    return null;
  }

  const environment = record.environment === "production" ? "production" : "development";
  const bundleId = String(record.bundleId || "com.example.ttdeck").trim() || "com.example.ttdeck";
  const preferences = normalizePushPreferences(record.preferences || existingRecord?.preferences || {});
  return {
    deviceToken: token,
    environment,
    bundleId,
    preferences,
    registeredAt: String(record.registeredAt || new Date().toISOString())
  };
}

function normalizeTokenRecord(record) {
  const pushTokens = Array.isArray(record.pushTokens)
    ? record.pushTokens.map(normalizePushTokenRecord).filter(Boolean)
    : [];
  const normalized = {
    tokenHash: String(record.tokenHash || ""),
    deviceName: String(record.deviceName || "Unknown Device"),
    createdAt: String(record.createdAt || new Date().toISOString()),
    pushTokens
  };
  const deviceSecretHash = String(record.deviceSecretHash || "");
  if (isTokenHash(deviceSecretHash)) {
    normalized.deviceSecretHash = deviceSecretHash;
  }
  return normalized;
}

function publicTokenRecord(record) {
  return {
    tokenHash: record.tokenHash,
    deviceName: record.deviceName,
    createdAt: record.createdAt,
    deviceBound: Boolean(record.deviceSecretHash),
    pushRegistered: Array.isArray(record.pushTokens) && record.pushTokens.length > 0
  };
}

function loadReadTokens(tokenStorePath) {
  if (!tokenStorePath || !fs.existsSync(tokenStorePath)) {
    return new Map();
  }

  const parsed = JSON.parse(fs.readFileSync(tokenStorePath, "utf8"));
  const records = Array.isArray(parsed.readTokens) ? parsed.readTokens : [];
  const readTokens = new Map();

  for (const record of records) {
    const normalized = normalizeTokenRecord(record);
    if (isTokenHash(normalized.tokenHash)) {
      readTokens.set(normalized.tokenHash, normalized);
    }
  }

  return readTokens;
}

function saveReadTokens(tokenStorePath, readTokens) {
  if (!tokenStorePath) return;

  const directory = path.dirname(tokenStorePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const payload = JSON.stringify({
    version: 1,
    readTokens: [...readTokens.values()]
  }, null, 2);
  const temporaryPath = `${tokenStorePath}.${process.pid}.tmp`;

  fs.writeFileSync(temporaryPath, payload, { mode: 0o600 });
  fs.renameSync(temporaryPath, tokenStorePath);
}

function createBindingStore({ ttlMs = 10 * 60 * 1000, tokenStorePath = "" } = {}) {
  const pairings = new Map();
  const readTokens = loadReadTokens(tokenStorePath);

  function prune(now = Date.now()) {
    for (const [pairingToken, record] of pairings) {
      if (record.expiresAt <= now) {
        pairings.delete(pairingToken);
      }
    }
  }

  return {
    startPairing({ publicBaseUrl, now = Date.now() }) {
      prune(now);
      const pairingToken = token("pair");
      const expiresAt = now + ttlMs;
      const qrPayload = JSON.stringify({
        type: "tesla-monitor-companion",
        version: 1,
        serverUrl: publicBaseUrl,
        pairingToken
      });

      pairings.set(pairingToken, { pairingToken, expiresAt });

      return { pairingToken, expiresAt, qrPayload };
    },

    consumePairing({ pairingToken, now = Date.now() }) {
      prune(now);
      const record = pairings.get(pairingToken);
      if (!record) return null;
      pairings.delete(pairingToken);
      return record;
    },

    saveReadToken({ tokenHash, deviceName, deviceSecretHash = "", createdAt = new Date().toISOString() }) {
      const record = normalizeTokenRecord({ tokenHash, deviceName, deviceSecretHash, createdAt });
      readTokens.set(record.tokenHash, record);
      saveReadTokens(tokenStorePath, readTokens);
    },

    findReadToken(tokenHash) {
      const record = readTokens.get(tokenHash);
      return record ? { ...record } : null;
    },

    listReadTokens() {
      return [...readTokens.values()]
        .map(publicTokenRecord)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },

    savePushToken(tokenHash, pushToken) {
      const record = readTokens.get(tokenHash);
      if (!record) {
        return false;
      }

      const existing = Array.isArray(record.pushTokens) ? record.pushTokens : [];
      const existingToken = existing.find((candidate) => candidate.deviceToken === String(pushToken.deviceToken || "").toLowerCase());
      const normalized = normalizePushTokenRecord(pushToken, existingToken);
      if (!normalized) {
        return false;
      }

      record.pushTokens = [
        normalized,
        ...existing.filter((candidate) => candidate.deviceToken !== normalized.deviceToken)
      ];
      readTokens.set(tokenHash, record);
      saveReadTokens(tokenStorePath, readTokens);
      return true;
    },

    removePushToken(tokenHash, deviceToken = "") {
      const record = readTokens.get(tokenHash);
      if (!record) {
        return false;
      }

      const existing = Array.isArray(record.pushTokens) ? record.pushTokens : [];
      const normalizedToken = String(deviceToken || "").toLowerCase();
      const nextTokens = normalizedToken
        ? existing.filter((candidate) => candidate.deviceToken !== normalizedToken)
        : [];
      const changed = nextTokens.length !== existing.length;
      record.pushTokens = nextTokens;
      readTokens.set(tokenHash, record);
      if (changed) {
        saveReadTokens(tokenStorePath, readTokens);
      }
      return changed;
    },

    listPushTargets() {
      return [...readTokens.values()].flatMap((record) => {
        const pushTokens = Array.isArray(record.pushTokens) ? record.pushTokens : [];
        return pushTokens.map((pushToken) => ({
          tokenHash: record.tokenHash,
          deviceName: record.deviceName,
          ...pushToken
        }));
      });
    },

    bindDeviceSecret(tokenHash, deviceSecretHash) {
      const record = readTokens.get(tokenHash);
      if (!record || record.deviceSecretHash || !isTokenHash(deviceSecretHash)) {
        return false;
      }

      record.deviceSecretHash = deviceSecretHash;
      readTokens.set(tokenHash, record);
      saveReadTokens(tokenStorePath, readTokens);
      return true;
    },

    revokeReadToken(tokenHash) {
      const deleted = readTokens.delete(tokenHash);
      if (deleted) {
        saveReadTokens(tokenStorePath, readTokens);
      }
      return deleted;
    }
  };
}

module.exports = {
  createBindingStore,
  normalizePushPreferences
};
