const assert = require("node:assert/strict");
const test = require("node:test");
const { createFixtureDataSource } = require("../src/data/fixtureDataSource");
const {
  buildOverview,
  buildSafety,
  buildCharging,
  buildTrips,
  buildTrends
} = require("../src/data/summaries");

test("fixture data source exposes two vehicles", async () => {
  const dataSource = createFixtureDataSource();
  const vehicles = await dataSource.listVehicles();

  assert.deepEqual(
    vehicles.map((vehicle) => vehicle.id),
    ["model-y-home", "model-3-work"]
  );
});

test("overview summarizes current state and freshness", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const overview = buildOverview(vehicle);

  assert.equal(overview.vehicleId, "model-y-home");
  assert.equal(overview.displayName, "Model Y");
  assert.equal(overview.state, "asleep");
  assert.equal(overview.battery.percent, 78);
  assert.equal(overview.range.estimatedKm, 382);
  assert.equal(overview.details.softwareVersion, "2026.20.1");
  assert.equal(overview.details.odometerKm, 18432.6);
  assert.equal(overview.climate.outsideTempC, 18);
  assert.equal(overview.freshness.kind, "recent");
  assert.equal(overview.summaryCards.length, 6);
});

test("overview ignores non-string realtime route destinations", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  vehicle.navigation = null;

  const overview = buildOverview(vehicle, {
    vehicleId: "model-y-home",
    available: true,
    route: {
      destination: { error: "No active route available" }
    }
  });

  assert.equal(overview.navigation, null);
});

test("safety flags unlocked vehicle as warning", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-3-work");
  const safety = buildSafety(vehicle);

  assert.equal(safety.vehicleId, "model-3-work");
  assert.equal(safety.overallSeverity, "warning");
  assert.equal(safety.tirePressure.frontLeftBar, 2.7);
  assert.equal(
    safety.checks.find((check) => check.id === "lock").severity,
    "warning"
  );
});

test("charging exposes live and recent session data", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const charging = buildCharging(vehicle);

  assert.equal(charging.current.pluggedIn, false);
  assert.equal(charging.current.chargeEnergyAddedKwh, 24.6);
  assert.equal(charging.recentSessions.length, 2);
});

test("charging prefers realtime plugged-in state over historical session state", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const charging = buildCharging(vehicle, {
    vehicleId: "model-y-home",
    available: true,
    connection: { status: "fresh", lastMessageAt: "2026-06-25T04:29:00.000Z", ageSeconds: 10 },
    charging: {
      pluggedIn: true,
      state: "Stopped",
      chargePortDoorOpen: true,
      chargerPowerKw: 0,
      chargerVoltageV: 229,
      chargerActualCurrentA: 0,
      chargerPhases: 1,
      chargeLimitSoc: 100,
      chargeCurrentRequestA: 32,
      chargeCurrentRequestMaxA: 32,
      scheduledChargingStartAt: "2026-06-26T14:00:00.000Z"
    }
  });

  assert.equal(charging.current.pluggedIn, true);
  assert.equal(charging.current.state, "Stopped");
  assert.equal(charging.current.chargePortDoorOpen, true);
  assert.equal(charging.current.chargerVoltage, 229);
  assert.equal(charging.current.chargeCurrentRequest, 32);
  assert.equal(charging.current.scheduledChargingStartAt, "2026-06-26T14:00:00.000Z");
});

test("charging infers plugged-in context from stopped realtime state", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const charging = buildCharging(vehicle, {
    vehicleId: "model-y-home",
    available: true,
    connection: { status: "fresh", lastMessageAt: "2026-06-25T04:29:00.000Z", ageSeconds: 10 },
    charging: {
      pluggedIn: false,
      state: "Stopped",
      chargerPowerKw: 0,
      chargeLimitSoc: 100
    }
  });

  assert.equal(charging.current.pluggedIn, true);
  assert.equal(charging.current.state, "Stopped");
});

test("trips and trends expose mobile-sized summaries", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const trends = buildTrends(vehicle);

  assert.equal(buildTrips(vehicle).recentTrips.length, 2);
  assert.equal(buildTrips(vehicle).pagination.total, 2);
  assert.equal(trends.metrics.length, 4);
  assert.equal(trends.series.find((series) => series.id === "parkingDrain").points.length, 3);
  assert.equal(trends.series.find((series) => series.id === "temperatureInside").points.length, 3);
  assert.equal(trends.series.find((series) => series.id === "temperatureOutside").points.length, 3);
});

test("trips support pagination and search filters", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  const firstPage = buildTrips(vehicle, { limit: "1" });
  const secondPage = buildTrips(vehicle, { limit: "1", cursor: firstPage.pagination.nextCursor });
  const searched = buildTrips(vehicle, { query: "school" });

  assert.equal(firstPage.recentTrips.length, 1);
  assert.equal(firstPage.pagination.hasMore, true);
  assert.equal(secondPage.recentTrips.length, 1);
  assert.equal(secondPage.pagination.hasMore, false);
  assert.equal(searched.recentTrips.length, 1);
  assert.equal(searched.recentTrips[0].id, "my-trip-2026-06-23-school");
});

test("trip lists omit route and telemetry details", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");
  vehicle.trips[0].routePoints = [{ latitude: 1, longitude: 2 }];
  vehicle.trips[0].telemetry = [{ speedKmh: 10 }];

  const trips = buildTrips(vehicle);

  assert.equal(Object.hasOwn(trips.recentTrips[0], "routePoints"), false);
  assert.equal(Object.hasOwn(trips.recentTrips[0], "telemetry"), false);
});

test("fixture vehicles are isolated from caller mutation", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");

  vehicle.battery.percent = 5;
  vehicle.charging.recentSessions[0].location = "Polluted";
  vehicle.trips.push({ id: "polluted-trip" });

  const freshVehicle = await dataSource.getVehicle("model-y-home");

  assert.equal(freshVehicle.battery.percent, 78);
  assert.equal(freshVehicle.charging.recentSessions[0].location, "Home");
  assert.equal(freshVehicle.trips.length, 2);
});

test("summary builders are isolated from caller mutation", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");

  buildOverview(vehicle).location.label = "Polluted";
  buildOverview(vehicle).battery.percent = 5;
  buildOverview(vehicle).weeklySummary.distanceKm = 1;
  buildCharging(vehicle).recentSessions[0].location = "Polluted";
  buildTrips(vehicle).recentTrips[0].title = "Polluted";

  assert.equal(buildOverview(vehicle).location.label, "Home");
  assert.equal(buildOverview(vehicle).battery.percent, 78);
  assert.equal(buildOverview(vehicle).weeklySummary.distanceKm, 216);
  assert.equal(buildCharging(vehicle).recentSessions[0].location, "Home");
  assert.equal(buildTrips(vehicle).recentTrips[0].title, "Office to Home");
});

test("trend metrics derive from the canonical trends object", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");

  assert.equal(Object.hasOwn(vehicle, "weeklyDistanceKm"), false);
  assert.equal(Object.hasOwn(vehicle, "estimatedRangeHealthPercent"), false);
  assert.equal(buildOverview(vehicle).weeklySummary.distanceKm, vehicle.trends.weeklyDistanceKm);
  assert.equal(
    buildTrends(vehicle).metrics.find((metric) => metric.id === "rangeHealth").value,
    vehicle.trends.estimatedRangeHealthPercent
  );
});

test("overview freshness clamps future timestamps to zero age", async () => {
  const dataSource = createFixtureDataSource();
  const vehicle = await dataSource.getVehicle("model-y-home");

  vehicle.lastUpdatedAt = "2026-06-25T04:35:00.000Z";

  assert.equal(buildOverview(vehicle).freshness.ageMinutes, 0);
  assert.equal(buildOverview(vehicle).freshness.kind, "recent");
});
