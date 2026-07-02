const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { createBindingStore } = require("../src/binding/bindingStore");
const { createFixtureDataSource } = require("../src/data/fixtureDataSource");
const { route } = require("../src/router");
const { createServer } = require("../src/server");
const { getJson, withTestServer } = require("./helpers");

async function routeJson({
  method = "POST",
  path = "/api/bind/start",
  remoteAddress = "203.0.113.10",
  headers = {},
  config = {
    publicBaseUrl: "https://ttdeck.example.test",
    tokenSecret: "test-secret",
    setupSecret: ""
  }
} = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = headers;
  req.socket = { remoteAddress };

  return new Promise((resolve, reject) => {
    const res = {
      writeHead(status, responseHeaders) {
        this.status = status;
        this.headers = responseHeaders;
      },
      end(payload) {
        resolve({
          status: this.status,
          headers: this.headers,
          body: JSON.parse(payload)
        });
      }
    };

    route(req, res, {
      bindingStore: createBindingStore(),
      config
    }).catch(reject);
  });
}

async function createAuthHeaders(baseUrl) {
  const startResponse = await fetch(`${baseUrl}/api/bind/start`, { method: "POST" });
  const startBody = await startResponse.json();
  const completeResponse = await fetch(`${baseUrl}/api/bind/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingToken: startBody.data.pairingToken,
      deviceName: "Test iPhone"
    })
  });
  const completeBody = await completeResponse.json();

  return {
    authorization: `Bearer ${completeBody.data.readToken}`
  };
}

test("GET /healthz returns ok", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const result = await getJson(baseUrl, "/healthz");

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      ok: true,
      data: {
        status: "ok",
        service: "api"
      }
    });
  });
});

test("GET /api/vehicles requires bearer token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const result = await getJson(baseUrl, "/api/vehicles");

    assert.equal(result.status, 401);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "token_missing");
  });
});

test("GET /api/vehicles rejects invalid bearer token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const result = await getJson(baseUrl, "/api/vehicles", {
      authorization: "Bearer bad-token"
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "token_invalid");
  });
});

test("GET /api/vehicles returns fixture vehicles with token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(baseUrl, "/api/vehicles", authHeaders);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(
      result.body.data.vehicles.map((vehicle) => vehicle.id),
      ["model-y-home", "model-3-work"]
    );
  });
});

test("authenticated clients can register and remove APNs device tokens", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const deviceToken = "a".repeat(64);
    const registerResponse = await fetch(`${baseUrl}/api/notifications/device-token`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        deviceToken,
        environment: "development",
        bundleId: "com.example.ttdeck"
      })
    });
    const registerBody = await registerResponse.json();
    const status = await getJson(baseUrl, "/api/notifications/status", authHeaders);
    const devices = await getJson(baseUrl, "/api/bind/devices");
    const removeResponse = await fetch(`${baseUrl}/api/notifications/device-token`, {
      method: "DELETE",
      headers: authHeaders
    });
    const removeBody = await removeResponse.json();
    const statusAfterRemove = await getJson(baseUrl, "/api/notifications/status", authHeaders);

    assert.equal(registerResponse.status, 200);
    assert.equal(registerBody.data.registered, true);
    assert.equal(status.status, 200);
    assert.equal(status.body.data.registeredTokenCount, 1);
    assert.equal(devices.body.data.devices[0].pushRegistered, true);
    assert.equal(removeResponse.status, 200);
    assert.equal(removeBody.data.removed, true);
    assert.equal(statusAfterRemove.body.data.registeredTokenCount, 0);
  });
});

test("APNs device token registration validates token format", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const response = await fetch(`${baseUrl}/api/notifications/device-token`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({ deviceToken: "not-a-token" })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "device_token_invalid");
  });
});

test("vehicle detail endpoints require bearer token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const result = await getJson(baseUrl, "/api/vehicles/model-y-home/overview");

    assert.equal(result.status, 401);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "token_missing");
  });
});

test("vehicle detail endpoints return summaries", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const paths = [
      "/api/vehicles/model-y-home/overview",
      "/api/vehicles/model-y-home/safety",
      "/api/vehicles/model-y-home/charging",
      "/api/vehicles/model-y-home/trips",
      "/api/vehicles/model-y-home/trends"
    ];

    for (const path of paths) {
      const result = await getJson(baseUrl, path, authHeaders);
      assert.equal(result.status, 200, path);
      assert.equal(result.body.ok, true, path);
      assert.equal(result.body.data.vehicleId, "model-y-home", path);
    }
  });
});

test("vehicle section endpoints share in-flight fallback snapshot loads", async () => {
  const fixtureDataSource = createFixtureDataSource();
  let getVehicleCount = 0;
  const dataSource = {
    ...fixtureDataSource,
    async getVehicle(vehicleId) {
      getVehicleCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return await fixtureDataSource.getVehicle(vehicleId);
    }
  };

  await withTestServer(() => createServer({ dataSource }), async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const paths = [
      "/api/vehicles/model-y-home/overview",
      "/api/vehicles/model-y-home/safety",
      "/api/vehicles/model-y-home/charging",
      "/api/vehicles/model-y-home/trends"
    ];
    const results = await Promise.all(paths.map((path) => getJson(baseUrl, path, authHeaders)));

    assert.deepEqual(results.map((result) => result.status), [200, 200, 200, 200]);
    assert.equal(getVehicleCount, 1);
  });
});

test("vehicle section endpoints prefer lightweight data source loaders", async () => {
  const fixtureDataSource = createFixtureDataSource();
  const sectionCalls = [];
  const dataSource = {
    ...fixtureDataSource,
    async getVehicle() {
      throw new Error("full snapshot should not be loaded for section endpoint");
    },
    async getOverviewVehicle(vehicleId) {
      sectionCalls.push("overview");
      return await fixtureDataSource.getVehicle(vehicleId);
    },
    async getSafetyVehicle(vehicleId) {
      sectionCalls.push("safety");
      return await fixtureDataSource.getVehicle(vehicleId);
    },
    async getChargingVehicle(vehicleId) {
      sectionCalls.push("charging");
      return await fixtureDataSource.getVehicle(vehicleId);
    },
    async getTrendsVehicle(vehicleId) {
      sectionCalls.push("trends");
      return await fixtureDataSource.getVehicle(vehicleId);
    }
  };

  await withTestServer(() => createServer({ dataSource }), async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const paths = [
      "/api/vehicles/model-y-home/overview",
      "/api/vehicles/model-y-home/safety",
      "/api/vehicles/model-y-home/charging",
      "/api/vehicles/model-y-home/trends"
    ];

    for (const path of paths) {
      const result = await getJson(baseUrl, path, authHeaders);
      assert.equal(result.status, 200, path);
    }

    assert.deepEqual(sectionCalls, ["overview", "safety", "charging", "trends"]);
  });
});

test("realtime endpoint returns decode-compatible disabled payload", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(baseUrl, "/api/vehicles/model-y-home/realtime", authHeaders);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.data.vehicleId, "model-y-home");
    assert.equal(result.body.data.available, false);
    assert.deepEqual(result.body.data.events, []);
    assert.deepEqual(result.body.data.connection, {
      enabled: false,
      connected: false,
      status: "disabled",
      lastMessageAt: null,
      ageSeconds: null,
      staleAfterSeconds: 300,
      lastError: null
    });
  });
});

test("trips endpoint supports pagination query parameters", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const firstPage = await getJson(baseUrl, "/api/vehicles/model-y-home/trips?limit=1", authHeaders);
    const nextCursor = firstPage.body.data.pagination.nextCursor;
    const secondPage = await getJson(
      baseUrl,
      `/api/vehicles/model-y-home/trips?limit=1&cursor=${nextCursor}`,
      authHeaders
    );

    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.body.data.recentTrips.length, 1);
    assert.equal(firstPage.body.data.pagination.hasMore, true);
    assert.equal(secondPage.status, 200);
    assert.equal(secondPage.body.data.recentTrips.length, 1);
    assert.equal(secondPage.body.data.pagination.hasMore, false);
  });
});

test("trip detail endpoint returns a single trip", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(
      baseUrl,
      "/api/vehicles/model-y-home/trips/my-trip-2026-06-24-commute",
      authHeaders
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.data.id, "my-trip-2026-06-24-commute");
    assert.equal(result.body.data.title, "Office to Home");
  });
});

test("trip detail endpoint returns 404 for unknown trip", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(baseUrl, "/api/vehicles/model-y-home/trips/missing-trip", authHeaders);

    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "trip_not_found");
  });
});

test("vehicle detail endpoints return 404 for unknown vehicle", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(baseUrl, "/api/vehicles/no-car/overview", authHeaders);

    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "vehicle_not_found");
  });
});

test("unknown paths return not found", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const authHeaders = await createAuthHeaders(baseUrl);
    const result = await getJson(baseUrl, "/does-not-exist", authHeaders);

    assert.equal(result.status, 404);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error.code, "not_found");
  });
});

test("binding flow exchanges pairing token for read token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const startResponse = await fetch(`${baseUrl}/api/bind/start`, { method: "POST" });
    const startBody = await startResponse.json();

    assert.equal(startResponse.status, 200);
    assert.equal(startBody.ok, true);
    assert.equal(startBody.data.pairingToken.startsWith("pair_"), true);
    assert.equal(startBody.data.qrPayload.includes(startBody.data.pairingToken), true);
    assert.equal(startBody.data.qrCodeDataUrl.startsWith("data:image/png;base64,"), true);

    const completeResponse = await fetch(`${baseUrl}/api/bind/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingToken: startBody.data.pairingToken,
        deviceName: "Test iPhone"
      })
    });
    const completeBody = await completeResponse.json();

    assert.equal(completeResponse.status, 200);
    assert.equal(completeBody.ok, true);
    assert.equal(completeBody.data.readToken.startsWith("tmc_"), true);

    const vehicles = await getJson(baseUrl, "/api/vehicles", {
      authorization: `Bearer ${completeBody.data.readToken}`
    });

    assert.equal(vehicles.status, 200);
    assert.equal(vehicles.body.data.vehicles.length, 2);
  });
});

test("device list returns paired token records without raw tokens", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const startResponse = await fetch(`${baseUrl}/api/bind/start`, { method: "POST" });
    const startBody = await startResponse.json();
    const completeResponse = await fetch(`${baseUrl}/api/bind/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingToken: startBody.data.pairingToken,
        deviceName: "Garage iPhone"
      })
    });

    assert.equal(completeResponse.status, 200);

    const devices = await getJson(baseUrl, "/api/bind/devices");

    assert.equal(devices.status, 200);
    assert.equal(devices.body.ok, true);
    assert.equal(devices.body.data.devices.length, 1);
    assert.equal(devices.body.data.devices[0].deviceName, "Garage iPhone");
    assert.equal(devices.body.data.devices[0].tokenHash.length, 64);
    assert.equal("readToken" in devices.body.data.devices[0], false);
  });
});

test("device revocation invalidates the paired read token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const startResponse = await fetch(`${baseUrl}/api/bind/start`, { method: "POST" });
    const startBody = await startResponse.json();
    const completeResponse = await fetch(`${baseUrl}/api/bind/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingToken: startBody.data.pairingToken,
        deviceName: "Old iPhone"
      })
    });
    const completeBody = await completeResponse.json();
    const devices = await getJson(baseUrl, "/api/bind/devices");
    const tokenHash = devices.body.data.devices[0].tokenHash;

    const revokeResponse = await fetch(`${baseUrl}/api/bind/devices/${tokenHash}`, {
      method: "DELETE"
    });
    const revokeBody = await revokeResponse.json();
    const vehicles = await getJson(baseUrl, "/api/vehicles", {
      authorization: `Bearer ${completeBody.data.readToken}`
    });

    assert.equal(revokeResponse.status, 200);
    assert.equal(revokeBody.ok, true);
    assert.equal(revokeBody.data.revoked, true);
    assert.equal(vehicles.status, 403);
    assert.equal(vehicles.body.error.code, "token_invalid");
  });
});

test("device management rejects remote clients without setup secret", async () => {
  const result = await routeJson({
    method: "GET",
    path: "/api/bind/devices"
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, "setup_forbidden");
});

test("binding flow rejects reused pairing token", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const startResponse = await fetch(`${baseUrl}/api/bind/start`, { method: "POST" });
    const startBody = await startResponse.json();
    const body = JSON.stringify({
      pairingToken: startBody.data.pairingToken,
      deviceName: "Test iPhone"
    });

    const firstResponse = await fetch(`${baseUrl}/api/bind/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    const secondResponse = await fetch(`${baseUrl}/api/bind/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    });
    const secondBody = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 400);
    assert.equal(secondBody.ok, false);
    assert.equal(secondBody.error.code, "pairing_invalid");
  });
});

test("binding start rejects remote clients without setup secret", async () => {
  const result = await routeJson();

  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, "setup_forbidden");
});

test("binding start rejects proxied public host without setup secret", async () => {
  const result = await routeJson({
    remoteAddress: "127.0.0.1",
    headers: { host: "ttdeck.example.test" }
  });

  assert.equal(result.status, 403);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, "setup_forbidden");
});

test("binding start accepts direct loopback host without setup secret", async () => {
  const result = await routeJson({
    remoteAddress: "127.0.0.1",
    headers: { host: "127.0.0.1:4020" }
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.pairingToken.startsWith("pair_"), true);
});

test("binding start accepts remote clients with setup secret", async () => {
  const result = await routeJson({
    headers: { "x-setup-secret": "setup-secret" },
    config: {
      publicBaseUrl: "https://ttdeck.example.test",
      tokenSecret: "test-secret",
      setupSecret: "setup-secret"
    }
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.data.pairingToken.startsWith("pair_"), true);
});

test("GET /api/setup/diagnostics returns fixture-mode checks", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const result = await getJson(baseUrl, "/api/setup/diagnostics");

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(result.body.data.checks.map((check) => check.id), [
      "companion",
      "dataSource",
      "teslamate",
      "postgres",
      "mqtt",
      "vehicles"
    ]);
  });
});

test("GET / returns not found", async () => {
  await withTestServer(createServer, async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "not_found");
  });
});
