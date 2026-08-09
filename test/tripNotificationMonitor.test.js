const assert = require("node:assert/strict");
const test = require("node:test");
const { NotificationStateStore } = require("../src/notifications/notificationStateStore");
const { TripNotificationMonitor } = require("../src/notifications/tripNotificationMonitor");

function createMonitorHarness() {
  let timestamp = Date.parse("2026-07-01T10:00:00.000Z");
  let tripState = {
    activeDrive: null,
    latestEndedDrive: null
  };
  let realtime = {
    available: true,
    connection: {
      status: "fresh",
      lastMessageAt: "2026-07-01T10:00:00.000Z",
      ageSeconds: 0
    },
    battery: {
      levelPercent: 80
    },
    charging: {
      pluggedIn: false,
      state: "Disconnected",
      chargerPowerKw: 0,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  };
  let overviewVehicle = {
    id: "1",
    displayName: "Model Y",
    lastUpdatedAt: "2026-07-01T10:00:00.000Z",
    trends: {
      parkingDrainPercent: 0
    }
  };
  let targetPreferences = {};
  let vehicleDisplayName = "Model Y";
  const sent = [];
  const dataSource = {
    async listVehicles() {
      return [{ id: "1", displayName: vehicleDisplayName }];
    },
    async getTripNotificationState() {
      return { vehicleId: "1", ...tripState };
    },
    async getOverviewVehicle() {
      return overviewVehicle;
    }
  };
  const monitor = new TripNotificationMonitor({
    config: {
      enabled: true,
      pollIntervalMs: 45000,
      postTripWatchMinutes: 15,
      postTripSafetyGraceSeconds: 90
    },
    dataSource,
    realtimeStore: {
      getSnapshot() {
        return realtime;
      }
    },
    bindingStore: {
      listPushTargets() {
        return [{
          tokenHash: "token-hash",
          deviceToken: "a".repeat(64),
          environment: "development",
          bundleId: "com.lagom.ttdeck",
          preferences: targetPreferences
        }];
      },
      removePushToken() {}
    },
    stateStore: new NotificationStateStore(),
    pushClient: {
      async send(event) {
        sent.push(event);
        return { ok: true, status: 200 };
      }
    },
    now: () => timestamp,
    logger: {
      error() {},
      warn() {}
    }
  });

  return {
    monitor,
    sent,
    setTripState(nextState) {
      tripState = nextState;
    },
    setRealtime(nextRealtime) {
      realtime = nextRealtime;
    },
    setOverview(nextOverviewVehicle) {
      overviewVehicle = nextOverviewVehicle;
    },
    setTargetPreferences(nextPreferences) {
      targetPreferences = nextPreferences;
    },
    setVehicleDisplayName(nextDisplayName) {
      vehicleDisplayName = nextDisplayName;
    },
    advance(ms) {
      timestamp += ms;
    }
  };
}

test("TripNotificationMonitor seeds current state without pushing history", async () => {
  const harness = createMonitorHarness();
  harness.setTripState({
    activeDrive: null,
    latestEndedDrive: {
      id: "100",
      startedAt: "2026-07-01T08:00:00.000Z",
      endedAt: "2026-07-01T08:20:00.000Z",
      distanceKm: 12.4
    }
  });

  await harness.monitor.tick();

  assert.deepEqual(harness.sent, []);
});

test("TripNotificationMonitor uses a generic vehicle fallback in remote notifications", async () => {
  const harness = createMonitorHarness();
  harness.setVehicleDisplayName("");
  await harness.monitor.tick();

  harness.setTripState({
    activeDrive: {
      id: "generic-vehicle-trip",
      startedAt: "2026-07-01T10:01:00.000Z",
      endedAt: null,
      distanceKm: 0
    },
    latestEndedDrive: null
  });
  await harness.monitor.tick();

  assert.equal(harness.sent.length, 1);
  assert.equal(harness.sent[0].body, "车辆 开始新的行程。");
  assert.doesNotMatch(harness.sent[0].body, /Tesla|Model [3SYX]/i);
});

test("TripNotificationMonitor sends trip start, trip end, and post-trip safety once", async () => {
  const harness = createMonitorHarness();
  await harness.monitor.tick();

  harness.setTripState({
    activeDrive: {
      id: "101",
      startedAt: "2026-07-01T10:01:00.000Z",
      endedAt: null,
      distanceKm: 0
    },
    latestEndedDrive: null
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    safety: {
      locked: false,
      doorsOpen: true,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  harness.setTripState({
    activeDrive: null,
    latestEndedDrive: {
      id: "101",
      startedAt: "2026-07-01T10:01:00.000Z",
      endedAt: "2026-07-01T10:20:00.000Z",
      distanceKm: 18.2
    }
  });
  await harness.monitor.tick();
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    [
      "trip-started-101",
      "trip-ended-101"
    ]
  );

  harness.advance(90 * 1000);
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    [
      "trip-started-101",
      "trip-ended-101",
      "post-trip-unlocked-101",
      "post-trip-doors-open-101"
    ]
  );
});

test("TripNotificationMonitor delays post-trip safety until the grace period expires", async () => {
  const harness = createMonitorHarness();
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    safety: {
      locked: false,
      doorsOpen: true,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  harness.setTripState({
    activeDrive: null,
    latestEndedDrive: {
      id: "104",
      startedAt: "2026-07-01T09:40:00.000Z",
      endedAt: "2026-07-01T10:00:00.000Z",
      distanceKm: 4.1
    }
  });
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    ["trip-ended-104"]
  );

  harness.advance(89 * 1000);
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    ["trip-ended-104"]
  );

  harness.advance(1000);
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    [
      "trip-ended-104",
      "post-trip-unlocked-104",
      "post-trip-doors-open-104"
    ]
  );
});

test("TripNotificationMonitor sends charging, battery, stale data, and parking drain events", async () => {
  const harness = createMonitorHarness();
  harness.setTargetPreferences({
    tripEvents: true,
    chargingEvents: true,
    safetyEvents: true,
    staleDataEvents: true,
    lowBatteryThresholdPercent: 20,
    parkingDrainThresholdPercent: 3
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    connection: {
      status: "stale",
      lastMessageAt: "2026-07-01T10:01:00.000Z",
      ageSeconds: 780
    },
    battery: {
      levelPercent: 19
    },
    charging: {
      pluggedIn: true,
      state: "Charging",
      chargerPowerKw: 7.2,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  harness.setOverview({
    id: "1",
    displayName: "Model Y",
    lastUpdatedAt: "2026-07-01T10:01:00.000Z",
    trends: {
      parkingDrainPercent: 4
    }
  });
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.data.category),
    ["charging", "battery", "stale", "parking"]
  );
  assert.deepEqual(
    harness.sent.map((event) => event.eventId).map((eventId) => eventId.split("-").slice(0, 2).join("-")),
    ["charging-started", "battery-low", "stale-data", "parking-drain"]
  );
});

test("TripNotificationMonitor does not repeat charging complete after idle state flaps", async () => {
  const harness = createMonitorHarness();
  harness.setTargetPreferences({
    tripEvents: true,
    chargingEvents: true,
    safetyEvents: true,
    staleDataEvents: true,
    lowBatteryThresholdPercent: 20,
    parkingDrainThresholdPercent: 3
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    connection: {
      status: "fresh",
      lastMessageAt: "2026-07-01T10:01:00.000Z",
      ageSeconds: 0
    },
    battery: {
      levelPercent: 79
    },
    charging: {
      pluggedIn: true,
      state: "Charging",
      chargerPowerKw: 7.2,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    connection: {
      status: "fresh",
      lastMessageAt: "2026-07-01T10:02:00.000Z",
      ageSeconds: 0
    },
    battery: {
      levelPercent: 80
    },
    charging: {
      pluggedIn: true,
      state: "Complete",
      chargerPowerKw: 0,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    connection: {
      status: "fresh",
      lastMessageAt: "2026-07-01T10:03:00.000Z",
      ageSeconds: 0
    },
    battery: {
      levelPercent: 80
    },
    charging: {
      pluggedIn: true,
      state: "Stopped",
      chargerPowerKw: 0,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  await harness.monitor.tick();

  harness.setRealtime({
    available: true,
    connection: {
      status: "fresh",
      lastMessageAt: "2026-07-01T10:04:00.000Z",
      ageSeconds: 0
    },
    battery: {
      levelPercent: 80
    },
    charging: {
      pluggedIn: true,
      state: "Complete",
      chargerPowerKw: 0,
      chargeLimitSoc: 80
    },
    safety: {
      locked: true,
      doorsOpen: false,
      windowsOpen: false,
      frunkOpen: false,
      trunkOpen: false
    }
  });
  await harness.monitor.tick();

  assert.equal(
    harness.sent.filter((event) => event.eventId.startsWith("charging-complete")).length,
    1
  );
});

test("TripNotificationMonitor stops post-trip safety checks after the watch window", async () => {
  const harness = createMonitorHarness();
  await harness.monitor.tick();
  harness.setTripState({
    activeDrive: null,
    latestEndedDrive: {
      id: "102",
      startedAt: "2026-07-01T09:40:00.000Z",
      endedAt: "2026-07-01T10:00:00.000Z",
      distanceKm: 4.1
    }
  });
  await harness.monitor.tick();

  harness.advance(16 * 60 * 1000);
  harness.setRealtime({
    available: true,
    safety: {
      locked: false,
      doorsOpen: true,
      windowsOpen: true,
      frunkOpen: true,
      trunkOpen: true
    }
  });
  await harness.monitor.tick();

  assert.deepEqual(
    harness.sent.map((event) => event.eventId),
    ["trip-ended-102"]
  );
});
