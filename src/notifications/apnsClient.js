const crypto = require("node:crypto");
const fs = require("node:fs");
const http2 = require("node:http2");

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizePrivateKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

function readPrivateKey(config) {
  if (!config.enabled) {
    return "";
  }
  if (config.privateKey) {
    return normalizePrivateKey(config.privateKey);
  }
  if (config.privateKeyPath) {
    return fs.readFileSync(config.privateKeyPath, "utf8");
  }
  return "";
}

class ApnsClient {
  constructor({ config, http2Module = http2, now = () => Date.now() }) {
    this.config = config;
    this.http2 = http2Module;
    this.now = now;
    this.privateKey = readPrivateKey(config);
    this.cachedToken = null;
    this.sessions = new Map();
  }

  get configured() {
    return Boolean(
      this.config.enabled &&
      this.config.teamId &&
      this.config.keyId &&
      this.config.bundleId &&
      this.privateKey
    );
  }

  providerToken() {
    const issuedAt = Math.floor(this.now() / 1000);
    if (this.cachedToken && issuedAt - this.cachedToken.issuedAt < 50 * 60) {
      return this.cachedToken.value;
    }

    const header = base64Url(JSON.stringify({
      alg: "ES256",
      kid: this.config.keyId
    }));
    const claims = base64Url(JSON.stringify({
      iss: this.config.teamId,
      iat: issuedAt
    }));
    const signingInput = `${header}.${claims}`;
    const signature = crypto.sign("sha256", Buffer.from(signingInput), {
      key: this.privateKey,
      dsaEncoding: "ieee-p1363"
    });
    const value = `${signingInput}.${base64Url(signature)}`;
    this.cachedToken = { issuedAt, value };
    return value;
  }

  endpoint(environment) {
    return environment === "production"
      ? "https://api.push.apple.com"
      : "https://api.development.push.apple.com";
  }

  sessionFor(environment) {
    const endpoint = this.endpoint(environment);
    const existing = this.sessions.get(endpoint);
    if (existing && !existing.destroyed && !existing.closed) {
      return existing;
    }

    const session = this.http2.connect(endpoint);
    session.on("error", () => {});
    session.on("close", () => {
      if (this.sessions.get(endpoint) === session) {
        this.sessions.delete(endpoint);
      }
    });
    this.sessions.set(endpoint, session);
    return session;
  }

  async send({
    deviceToken,
    environment,
    bundleId,
    title,
    body,
    eventId,
    threadId = "trip",
    data = {}
  }) {
    if (!this.configured) {
      return { ok: false, skipped: true, reason: "apns_not_configured" };
    }

    const targetEnvironment = environment || this.config.environment;
    const payload = JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
        "thread-id": threadId
      },
      eventId,
      ...data
    });
    const session = this.sessionFor(targetEnvironment);
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${this.providerToken()}`,
      "apns-topic": bundleId || this.config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": String(eventId || "ttdeck-event").slice(0, 64)
    });

    return new Promise((resolve) => {
      let status = 0;
      let responseBody = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[":status"] || 0);
      });
      request.on("data", (chunk) => {
        responseBody += chunk;
      });
      request.on("error", (error) => {
        resolve({ ok: false, status, reason: error.message });
      });
      request.on("end", () => {
        let reason = "";
        if (responseBody) {
          try {
            reason = JSON.parse(responseBody).reason || responseBody;
          } catch {
            reason = responseBody;
          }
        }
        resolve({
          ok: status === 200,
          status,
          reason,
          inactive: status === 410 || reason === "Unregistered" || reason === "BadDeviceToken"
        });
      });
      request.end(payload);
    });
  }

  close() {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }
}

function createApnsClient(config) {
  return new ApnsClient({ config });
}

module.exports = {
  ApnsClient,
  createApnsClient,
  base64Url
};
