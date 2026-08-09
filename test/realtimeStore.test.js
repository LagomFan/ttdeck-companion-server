const assert = require("node:assert/strict");
const test = require("node:test");
const { RealtimeStore, parsePayload } = require("../src/realtime/realtimeStore");

test("parsePayload maps TeslaMate MQTT primitive values", () => {
  assert.equal(parsePayload("true"), true);
  assert.equal(parsePayload("false"), false);
  assert.equal(parsePayload("nil"), null);
  assert.equal(parsePayload("91"), 91);
  assert.deepEqual(parsePayload('{"latitude":31.5,"longitude":121.1}'), {
    latitude: 31.5,
    longitude: 121.1
  });
  assert.equal(parsePayload("online"), "online");
});

test("RealtimeStore maps TeslaMate car topics into realtime snapshot", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  assert.equal(store.applyTopic("teslamate/cars/1/state", "online", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/model", "y", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/trim_badging", "Long Range", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/exterior_color", "DeepBlue", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/wheel_type", "Induction20", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/locked", "true", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/doors_open", "false", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/windows_open", "false", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/battery_level", "91", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/usable_battery_level", "90", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/plugged_in", "true", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charging_state", "Stopped", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charge_port_door_open", "true", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charger_power", "0", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charger_voltage", "229", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charger_actual_current", "0", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charger_phases", "1", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charge_limit_soc", "100", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charge_current_request", "32", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/charge_current_request_max", "32", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/scheduled_charging_start_time", "2026-06-26T14:00:00.000Z", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/location", '{"latitude":31.5,"longitude":121.1}', receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/tpms_pressure_fl", "2.875", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/cars/1/tpms_soft_warning_fl", "false", receivedAt), true);
  assert.equal(store.applyTopic("teslamate/other/1/state", "online", receivedAt), false);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.available, true);
  assert.equal(snapshot.connection.status, "fresh");
  assert.equal(snapshot.vehicle.state, "online");
  assert.equal(snapshot.vehicle.model, "y");
  assert.equal(snapshot.vehicle.trimBadging, "Long Range");
  assert.equal(snapshot.vehicle.exteriorColor, "DeepBlue");
  assert.equal(snapshot.vehicle.wheelType, "Induction20");
  assert.equal(snapshot.battery.levelPercent, 91);
  assert.equal(snapshot.charging.pluggedIn, true);
  assert.equal(snapshot.charging.state, "Stopped");
  assert.equal(snapshot.charging.chargePortDoorOpen, true);
  assert.equal(snapshot.charging.chargerVoltageV, 229);
  assert.equal(snapshot.charging.chargerActualCurrentA, 0);
  assert.equal(snapshot.charging.chargerPhases, 1);
  assert.equal(snapshot.charging.chargeLimitSoc, 100);
  assert.equal(snapshot.charging.chargeCurrentRequestA, 32);
  assert.equal(snapshot.charging.chargeCurrentRequestMaxA, 32);
  assert.equal(snapshot.charging.scheduledChargingStartAt, "2026-06-26T14:00:00.000Z");
  assert.equal(snapshot.location.latitude, 31.5);
  assert.equal(snapshot.safety.locked, true);
  assert.equal(snapshot.tires.frontLeftBar, 2.875);
  assert.equal(snapshot.route.activeRoute, null);
  assert.equal(snapshot.route.destination, null);
  assert.equal(snapshot.events.length, 0);
});

test("RealtimeStore treats unavailable active routes as authoritative over legacy destinations", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route", '{"error":"No active route available"}', receivedAt);
  store.applyTopic("teslamate/cars/1/active_route_destination", '{"name":"Home"}', receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, null);
  assert.equal(snapshot.route.available, false);
  assert.equal(snapshot.route.destination, null);
  assert.equal(snapshot.route.error, "No active route available");
});

test("RealtimeStore preserves legacy route topic fallbacks", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route_destination", "Home", receivedAt);
  store.applyTopic("teslamate/cars/1/active_route_latitude", "31.5", receivedAt);
  store.applyTopic("teslamate/cars/1/active_route_longitude", "121.1", receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, "Home");
  assert.equal(snapshot.route.available, true);
  assert.equal(snapshot.route.destination, "Home");
  assert.equal(snapshot.route.latitude, 31.5);
  assert.equal(snapshot.route.longitude, 121.1);
  assert.equal(snapshot.route.energyAtArrivalPercent, null);
  assert.equal(snapshot.route.distanceToArrivalKm, null);
  assert.equal(snapshot.route.minutesToArrival, null);
  assert.equal(snapshot.route.trafficDelayMinutes, null);
  assert.equal(snapshot.route.error, null);
});

test("RealtimeStore preserves scalar legacy active route strings", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route", "Legacy Home", receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, "Legacy Home");
  assert.equal(snapshot.route.available, true);
  assert.equal(snapshot.route.destination, "Legacy Home");
  assert.equal(snapshot.route.latitude, null);
  assert.equal(snapshot.route.longitude, null);
  assert.equal(snapshot.route.energyAtArrivalPercent, null);
  assert.equal(snapshot.route.distanceToArrivalKm, null);
  assert.equal(snapshot.route.minutesToArrival, null);
  assert.equal(snapshot.route.trafficDelayMinutes, null);
  assert.equal(snapshot.route.error, null);
});

test("RealtimeStore maps structured TeslaMate active routes into route metadata", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route", JSON.stringify({
    destination: "Demo Destination",
    energy_at_arrival: 62,
    miles_to_arrival: 7.7,
    minutes_to_arrival: 24.4,
    traffic_minutes_delay: 3,
    location: { latitude: 31.456, longitude: 121.123 },
    error: null
  }), receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, "Demo Destination");
  assert.equal(snapshot.route.available, true);
  assert.equal(snapshot.route.destination, "Demo Destination");
  assert.equal(snapshot.route.latitude, 31.456);
  assert.equal(snapshot.route.longitude, 121.123);
  assert.equal(snapshot.route.energyAtArrivalPercent, 62);
  assert.equal(snapshot.route.distanceToArrivalKm, 7.7 * 1.609344);
  assert.equal(snapshot.route.minutesToArrival, 24);
  assert.equal(snapshot.route.trafficDelayMinutes, 3);
  assert.equal(snapshot.route.error, null);
});

test("RealtimeStore treats no active route payloads as unavailable", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route", JSON.stringify({
    error: "No active route available"
  }), receivedAt);
  store.applyTopic("teslamate/cars/1/active_route_destination", "Home", receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, null);
  assert.equal(snapshot.route.available, false);
  assert.equal(snapshot.route.destination, null);
  assert.equal(snapshot.route.latitude, null);
  assert.equal(snapshot.route.longitude, null);
  assert.equal(snapshot.route.error, "No active route available");
});

test("RealtimeStore fails closed for malformed active route payloads", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 300
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/active_route", "{bad json", receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:01:00.000Z")
  });

  assert.equal(snapshot.route.activeRoute, null);
  assert.equal(snapshot.route.available, false);
  assert.equal(snapshot.route.destination, null);
  assert.equal(snapshot.route.latitude, null);
  assert.equal(snapshot.route.longitude, null);
  assert.equal(snapshot.route.error, null);
});

test("RealtimeStore emits stale and risk events from realtime fields", () => {
  const store = new RealtimeStore({
    enabled: true,
    topicPrefix: "teslamate/cars",
    staleAfterSeconds: 60
  });
  const receivedAt = new Date("2026-06-26T05:00:00.000Z");

  store.setConnection({ connected: true });
  store.applyTopic("teslamate/cars/1/locked", "false", receivedAt);
  store.applyTopic("teslamate/cars/1/doors_open", "true", receivedAt);
  store.applyTopic("teslamate/cars/1/frunk_open", "true", receivedAt);
  store.applyTopic("teslamate/cars/1/shift_state", "P", receivedAt);
  store.applyTopic("teslamate/cars/1/speed", "5", receivedAt);
  store.applyTopic("teslamate/cars/1/tpms_soft_warning_rr", "true", receivedAt);

  const snapshot = store.getSnapshot("1", {
    now: new Date("2026-06-26T05:02:30.000Z")
  });
  const eventIds = snapshot.events.map((event) => event.id);

  assert.equal(snapshot.connection.status, "stale");
  assert.equal(eventIds.includes("realtime-stale"), true);
  assert.equal(eventIds.includes("vehicle-unlocked"), true);
  assert.equal(eventIds.includes("doors-open"), true);
  assert.equal(eventIds.includes("frunk-open"), true);
  assert.equal(eventIds.includes("parked-movement"), true);
  assert.equal(eventIds.includes("tire-pressure-warning"), true);
  assert.deepEqual(
    snapshot.events.find((event) => event.id === "frunk-open"),
    {
      id: "frunk-open",
      severity: "critical",
      title: "Front trunk open",
      message: "The live telemetry feed reports the front trunk is open.",
      occurredAt: "2026-06-26T05:00:00.000Z"
    }
  );
  assert.doesNotMatch(
    snapshot.events.map(({ title, message }) => `${title}: ${message}`).join("\n"),
    /TeslaMate|MQTT|Frunk/i
  );
});

test("RealtimeStore returns disabled diagnostics when MQTT is off", () => {
  const store = new RealtimeStore({ enabled: false });

  assert.equal(store.getSnapshot("1").available, false);
  assert.deepEqual(store.getDiagnostics(), {
    id: "mqtt",
    label: "Live Telemetry Feed",
    status: "skipped",
    message: "Live telemetry feed is disabled."
  });
});

test("RealtimeStore exposes generic live telemetry diagnostics", () => {
  const store = new RealtimeStore({ enabled: true });

  assert.deepEqual(store.getDiagnostics(), {
    id: "mqtt",
    label: "Live Telemetry Feed",
    status: "warning",
    message: "Live telemetry feed is not connected yet."
  });

  store.setConnection({ connected: true });
  assert.deepEqual(store.getDiagnostics(), {
    id: "mqtt",
    label: "Live Telemetry Feed",
    status: "warning",
    message: "Live telemetry feed connected; waiting for retained vehicle topics."
  });
});
