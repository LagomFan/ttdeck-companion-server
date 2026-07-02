const assert = require("node:assert/strict");
const test = require("node:test");
const { buildOverview, buildSafety } = require("../src/data/summaries");
const { TeslaMateDataSource } = require("../src/data/teslamateDataSource");

function createFakePool(options = {}) {
  const tripAddresses = options.tripAddresses || {
    start: "Office",
    end: "Home"
  };
  const tripCoordinates = options.tripCoordinates || {
    startLatitude: 10.0001,
    startLongitude: 20.0001,
    endLatitude: 10.0003,
    endLongitude: 20.0003
  };

  return {
    queries: [],
    async query(text, params = []) {
      this.queries.push({ text, params });

      if (text === "SELECT 1") {
        return { rows: [{ "?column?": 1 }] };
      }

      if (text === "SELECT COUNT(*)::int AS count FROM cars") {
        return { rows: [{ count: 1 }] };
      }

      if (text.includes("FROM cars c") && !text.includes("WHERE c.id")) {
        return {
          rows: [
            {
              id: 1,
              display_name: "Model Y",
              vin: "TESTVIN0000000000",
              state: "asleep",
              last_updated_at: new Date("2026-06-25T08:00:00.000Z")
            }
          ]
        };
      }

      if (text.includes("FROM cars c") && text.includes("WHERE c.id = $1")) {
        assert.deepEqual(params, [1]);
        return {
          rows: [
            {
              id: 1,
              display_name: "Model Y",
              vin: "TESTVIN0000000000",
              model: "y",
              efficiency: 170,
              state: "asleep",
              last_updated_at: new Date("2026-06-25T08:00:00.000Z"),
              position_date: new Date("2026-06-25T08:00:00.000Z"),
              latitude: 10.0003,
              longitude: 20.0003,
              battery_level: 78,
              usable_battery_level: 75,
              odometer: 13021.59,
              est_battery_range_km: 382.4,
              ideal_battery_range_km: 392.1,
              rated_battery_range_km: 401.2,
              inside_temp: 22.8,
              outside_temp: 18,
              driver_temp_setting: 21.5,
              passenger_temp_setting: 21.5,
              is_climate_on: false,
              tpms_pressure_fl: 2.9,
              tpms_pressure_fr: 2.9,
              tpms_pressure_rl: 2.8,
              tpms_pressure_rr: 2.8
            }
          ]
        };
      }

      if (text.includes("FROM drives d") && text.includes("LIMIT $2 OFFSET $3") && !text.includes("d.id = $2")) {
        assert.equal(params[0], 1);
        assert.equal(params[2], 0);
        return {
          rows: [
            {
              id: 10,
              start_date: new Date("2026-06-24T15:20:00.000Z"),
              end_date: new Date("2026-06-24T15:58:00.000Z"),
              distance: 34.2,
              energy_kwh: 5.8,
              sampled_energy_kwh: 0,
              efficiency: 170,
              speed_max: 88,
              power_max: 42,
              power_min: -6,
              start_address: tripAddresses.start,
              end_address: tripAddresses.end,
              start_latitude: tripCoordinates.startLatitude,
              start_longitude: tripCoordinates.startLongitude,
              end_latitude: tripCoordinates.endLatitude,
              end_longitude: tripCoordinates.endLongitude
            }
          ]
        };
      }

      if (text.includes("COUNT(*)::int AS count") && text.includes("FROM drives")) {
        assert.deepEqual(params, [1]);
        return { rows: [{ count: 42 }] };
      }

      if (text.includes("FROM drives d") && text.includes("d.id = $2")) {
        assert.deepEqual(params, [1, 10]);
        return {
          rows: [
            {
              id: 10,
              start_date: new Date("2026-06-24T15:20:00.000Z"),
              end_date: new Date("2026-06-24T15:58:00.000Z"),
              distance: 34.2,
              energy_kwh: 0,
              sampled_energy_kwh: 6.1,
              efficiency: 0,
              speed_max: 88,
              power_max: 42,
              power_min: -6,
              start_address: tripAddresses.start,
              end_address: tripAddresses.end,
              start_latitude: tripCoordinates.startLatitude,
              start_longitude: tripCoordinates.startLongitude,
              end_latitude: tripCoordinates.endLatitude,
              end_longitude: tripCoordinates.endLongitude
            }
          ]
        };
      }

      if (text.includes("weekly_charges")) {
        return {
          rows: [
            {
              distance_km: 216.2,
              energy_kwh: 38.4,
              charging_energy_kwh: 9.4
            }
          ]
        };
      }

      if (text.includes("parking_drain_percent") && text.includes("ORDER BY end_date ASC")) {
        assert.deepEqual(params, [1]);
        return {
          rows: [
            {
              start_date: new Date("2026-06-23T04:00:00.000Z"),
              day: new Date("2026-06-23T08:00:00.000Z"),
              parking_drain_percent: 1
            },
            {
              start_date: new Date("2026-06-23T13:00:00.000Z"),
              day: new Date("2026-06-23T17:00:00.000Z"),
              parking_drain_percent: 0
            },
            {
              start_date: new Date("2026-06-24T02:00:00.000Z"),
              day: new Date("2026-06-24T07:00:00.000Z"),
              parking_drain_percent: 1
            }
          ]
        };
      }

      if (text.includes("largest_drain_percent")) {
        return {
          rows: [
            {
              parking_drain_percent: 2,
              interval_count: 3,
              largest_drain_percent: 1
            }
          ]
        };
      }

      if (text.includes("FROM geofences") && !text.includes("LEFT JOIN")) {
        return {
          rows: [
            {
              id: 1,
              name: "Home",
              latitude: 10.0003,
              longitude: 20.0003,
              radius: 150
            }
          ]
        };
      }

      if (text.includes("FROM information_schema.columns")) {
        return {
          rows: [
            { table_name: "cars", column_name: "model" },
            { table_name: "cars", column_name: "efficiency" },
            { table_name: "positions", column_name: "latitude" },
            { table_name: "positions", column_name: "longitude" },
            { table_name: "positions", column_name: "battery_level" },
            { table_name: "positions", column_name: "odometer" },
            { table_name: "positions", column_name: "tpms_pressure_fl" },
            { table_name: "positions", column_name: "tpms_pressure_fr" },
            { table_name: "positions", column_name: "tpms_pressure_rl" },
            { table_name: "positions", column_name: "tpms_pressure_rr" },
            { table_name: "charging_processes", column_name: "charge_energy_added" },
            { table_name: "charging_processes", column_name: "start_ideal_range_km" },
            { table_name: "charging_processes", column_name: "end_ideal_range_km" },
            { table_name: "charges", column_name: "charger_power" },
            { table_name: "geofences", column_name: "name" },
            { table_name: "geofences", column_name: "latitude" },
            { table_name: "geofences", column_name: "longitude" },
            { table_name: "states", column_name: "state" },
            { table_name: "states", column_name: "start_date" },
            { table_name: "states", column_name: "end_date" }
          ]
        };
      }

      if (text.includes("FROM charging_processes")) {
        return {
          rows: [
            {
              id: 21,
              start_date: new Date("2026-06-25T07:15:00.000Z"),
              end_date: null,
              charge_energy_added: 9.4,
              start_ideal_range_km: 250,
              end_ideal_range_km: 307,
              cost: 0,
              start_latitude: 10.0003,
              start_longitude: 20.0003
            },
            {
              id: 20,
              start_date: new Date("2026-06-24T07:15:00.000Z"),
              end_date: new Date("2026-06-24T08:15:00.000Z"),
              charge_energy_added: 9.4,
              start_ideal_range_km: 250,
              end_ideal_range_km: 307,
              cost: 0,
              start_latitude: 10.0003,
              start_longitude: 20.0003
            },
            {
              id: 19,
              start_date: new Date("2026-06-23T07:15:00.000Z"),
              end_date: new Date("2026-06-23T07:20:00.000Z"),
              charge_energy_added: 0,
              start_ideal_range_km: 250,
              end_ideal_range_km: 250,
              cost: 0,
              start_latitude: 10.0003,
              start_longitude: 20.0003
            }
          ]
        };
      }

      if (text.includes("WHERE drive_id = $1")) {
        assert.deepEqual(params, [10]);
        return {
          rows: [
            {
              date: new Date("2026-06-24T15:20:00.000Z"),
              latitude: 10.0001,
              longitude: 20.0001,
              speed: 0,
              power: 0,
              battery_heater: false,
              battery_level: 59,
              usable_battery_level: 57,
              est_battery_range_km: 251,
              ideal_battery_range_km: 253,
              rated_battery_range_km: 251,
              tpms_pressure_fl: 2.9,
              tpms_pressure_fr: 2.9,
              tpms_pressure_rl: 2.8,
              tpms_pressure_rr: 2.8
            },
            {
              date: new Date("2026-06-24T15:35:00.000Z"),
              latitude: 10.0002,
              longitude: 20.0002,
              speed: 78,
              power: 12,
              battery_heater: null,
              battery_level: 58,
              usable_battery_level: null,
              est_battery_range_km: null,
              ideal_battery_range_km: null,
              rated_battery_range_km: null,
              tpms_pressure_fl: null,
              tpms_pressure_fr: null,
              tpms_pressure_rl: null,
              tpms_pressure_rr: null
            },
            {
              date: new Date("2026-06-24T15:58:00.000Z"),
              latitude: 10.0003,
              longitude: 20.0003,
              speed: 0,
              power: 12,
              battery_heater: false,
              battery_level: 57,
              usable_battery_level: 56,
              est_battery_range_km: 242,
              ideal_battery_range_km: 244,
              rated_battery_range_km: 242,
              tpms_pressure_fl: 2.9,
              tpms_pressure_fr: 2.9,
              tpms_pressure_rl: 2.8,
              tpms_pressure_rr: 2.8
            }
          ]
        };
      }

      if (text.includes("FROM charges")) {
        return {
          rows: [
            {
              charger_power: 6.8,
              charger_voltage: 240,
              charger_actual_current: 32,
              charger_phases: 1,
              charge_limit_soc: 80,
              minutes_to_full_charge: 145
            }
          ]
        };
      }

      if (text.includes("AVG(inside_temp)")) {
        assert.deepEqual(params, [1]);
        return {
          rows: [
            {
              day: new Date("2026-06-24T15:00:00.000Z"),
              inside_temp: 22.1,
              outside_temp: 18.2
            },
            {
              day: new Date("2026-06-24T16:00:00.000Z"),
              inside_temp: 22.8,
              outside_temp: 18.5
            }
          ]
        };
      }

      if (text.includes("date_trunc('day'")) {
        return {
          rows: [
            {
              day: new Date("2026-06-23T00:00:00.000Z"),
              distance_km: 18.4,
              efficiency_wh_per_km: 168
            },
            {
              day: new Date("2026-06-24T00:00:00.000Z"),
              distance_km: 34.2,
              efficiency_wh_per_km: 170
            }
          ]
        };
      }

      if (text.includes("SUM(d.distance)")) {
        return {
          rows: [
            {
              distance_km: 216.2,
              energy_kwh: 38.4,
              charging_energy_kwh: 9.4
            }
          ]
        };
      }

      throw new Error(`Unexpected query: ${text}`);
    },
    async end() {}
  };
}

test("TeslaMate data source maps vehicle list rows to API summaries", async () => {
  const pool = createFakePool();
  const dataSource = new TeslaMateDataSource({ pool });

  const vehicles = await dataSource.listVehicles();

  assert.deepEqual(vehicles, [
    {
      id: "1",
      displayName: "Model Y",
      vinSuffix: "0000",
      state: "asleep",
      lastUpdatedAt: "2026-06-25T08:00:00.000Z"
    }
  ]);
});

test("TeslaMate data source maps Postgres rows to vehicle snapshot shape", async () => {
  const pool = createFakePool();
  const dataSource = new TeslaMateDataSource({ pool });

  const vehicle = await dataSource.getVehicle("1");
  const overview = buildOverview(vehicle);
  const safety = buildSafety(vehicle);
  const chargesQuery = pool.queries.find((query) => query.text.includes("FROM charging_processes cp"));

  assert.equal(vehicle.id, "1");
  assert.equal(vehicle.battery.percent, 78);
  assert.equal(vehicle.battery.estimatedKm, 382);
  assert.equal(vehicle.details.model, "y");
  assert.equal(vehicle.details.odometerKm, 13021.59);
  assert.equal(vehicle.location.label, "Home");
  assert.equal(vehicle.charging.pluggedIn, true);
  assert.equal(vehicle.charging.powerKw, 6.8);
  assert.equal(vehicle.charging.chargeEnergyAddedKwh, 9.4);
  assert.equal(vehicle.charging.electrical.voltageV, 240);
  assert.equal(vehicle.charging.recentSessions.length, 1);
  assert.equal(vehicle.charging.recentSessions[0].id, "charge-20");
  assert.equal(vehicle.charging.recentSessions[0].endedAt, "2026-06-24T08:15:00.000Z");
  assert.equal(vehicle.charging.recentSessions[0].location, "10.00030, 20.00030");
  assert.equal(vehicle.charging.recentSessions[0].latitude, 10.0003);
  assert.equal(vehicle.charging.recentSessions[0].longitude, 20.0003);
  assert.equal(vehicle.charging.recentSessions[0].averagePowerKw, 9.4);
  assert.equal(vehicle.charging.recentSessions[0].efficiencyWhPerKm, 165);
  assert.deepEqual(chargesQuery.params, [1]);
  assert.equal(chargesQuery.text.includes("LIMIT $2"), false);
  assert.equal(vehicle.trips[0].title, "Office to Home");
  assert.equal(vehicle.trips[0].energyKwh, 5.8);
  assert.equal(vehicle.trips[0].efficiencyWhPerKm, 170);
  assert.equal(vehicle.trips[0].routePoints.length, 0);
  assert.equal(vehicle.trips[0].telemetry.length, 0);
  assert.equal(vehicle.trips[0].maxSpeedKmh, 88);
  assert.equal(vehicle.trips[0].maxPowerKw, 42);
  assert.equal(vehicle.safety.tirePressure.frontLeftBar, 2.9);
  assert.equal(vehicle.climate.insideTempC, 22.8);
  assert.equal(vehicle.climate.outsideTempC, 18);
  assert.equal(vehicle.safety.geofence.status, "inside");
  assert.equal(vehicle.safety.geofence.label, "Home");
  assert.equal(vehicle.safety.parkingDrain.percent, 2);
  assert.equal(vehicle.frequentPlaces[0].label, "Home");
  assert.equal(vehicle.frequentPlaces[0].visits, 2);
  assert.equal(vehicle.trends.weeklyDistanceKm, 216);
  assert.equal(vehicle.trends.weeklyChargingEnergyKwh, 9.4);
  assert.equal(vehicle.trends.parkingDrainPercent, 2);
  assert.equal(vehicle.trends.estimatedRangeHealthPercent, 95);
  assert.equal(vehicle.trends.series.find((series) => series.id === "mileage").points.length, 2);
  assert.deepEqual(vehicle.trends.series.find((series) => series.id === "parkingDrain").points, [
    { date: "2026-06-23T08:00:00.000Z", value: 1 },
    { date: "2026-06-23T17:00:00.000Z", value: 0 },
    { date: "2026-06-24T07:00:00.000Z", value: 1 }
  ]);
  assert.deepEqual(vehicle.trends.series.find((series) => series.id === "temperatureInside").points, [
    { date: "2026-06-24T15:00:00.000Z", value: 22.1 },
    { date: "2026-06-24T16:00:00.000Z", value: 22.8 }
  ]);
  assert.deepEqual(vehicle.trends.series.find((series) => series.id === "temperatureOutside").points, [
    { date: "2026-06-24T15:00:00.000Z", value: 18.2 },
    { date: "2026-06-24T16:00:00.000Z", value: 18.5 }
  ]);
  assert.equal(vehicle.trends.healthEvents.some((event) => event.id === "geofence-snapshot"), true);
  assert.equal(overview.weeklySummary.chargingEnergyKwh, 9.4);
  assert.equal(overview.details.odometerKm, 13021.59);
  assert.equal(overview.summaryCards.find((card) => card.id === "safety").value, "Limited");
  assert.equal(overview.summaryCards.find((card) => card.id === "tirePressure").value, "2.9 bar");
  assert.equal(safety.overallSeverity, "warning");
  assert.equal(safety.checks[0].id, "liveTelemetry");
  assert.equal(safety.checks.find((check) => check.id === "tirePressure").ok, true);
  assert.equal(safety.geofence.available, true);
  assert.equal(safety.geofence.label, "Home");
  assert.equal(safety.parkingDrain.intervalCount, 3);
});

test("TeslaMate section vehicle loaders skip unrelated heavy queries", async () => {
  const isRecentChargesQuery = (query) => query.text.includes("FROM charging_processes cp") &&
    query.text.includes("ORDER BY cp.start_date DESC");

  const overviewPool = createFakePool();
  const overviewSource = new TeslaMateDataSource({ pool: overviewPool });
  const overviewVehicle = await overviewSource.getOverviewVehicle("1");
  const overviewTripQuery = overviewPool.queries.find((query) => query.text.includes("LIMIT $2 OFFSET $3"));

  assert.equal(overviewVehicle.trips.length, 1);
  assert.deepEqual(overviewTripQuery.params, [1, 2, 0]);
  assert.equal(overviewPool.queries.some((query) => query.text.includes("AVG(inside_temp)")), false);

  const safetyPool = createFakePool();
  const safetySource = new TeslaMateDataSource({ pool: safetyPool });
  const safetyVehicle = await safetySource.getSafetyVehicle("1");

  assert.equal(safetyVehicle.safety.parkingDrain.percent, 2);
  assert.equal(safetyPool.queries.some((query) => query.text.includes("LIMIT $2 OFFSET $3")), false);
  assert.equal(safetyPool.queries.some(isRecentChargesQuery), false);
  assert.equal(safetyPool.queries.some((query) => query.text.includes("AVG(inside_temp)")), false);

  const chargingPool = createFakePool();
  const chargingSource = new TeslaMateDataSource({ pool: chargingPool });
  const chargingVehicle = await chargingSource.getChargingVehicle("1");

  assert.equal(chargingVehicle.charging.recentSessions.length, 1);
  assert.equal(chargingPool.queries.some(isRecentChargesQuery), true);
  assert.equal(chargingPool.queries.some((query) => query.text.includes("LIMIT $2 OFFSET $3")), false);
  assert.equal(chargingPool.queries.some((query) => query.text.includes("AVG(inside_temp)")), false);

  const trendsPool = createFakePool();
  const trendsSource = new TeslaMateDataSource({ pool: trendsPool });
  const trendsVehicle = await trendsSource.getTrendsVehicle("1");

  assert.equal(trendsVehicle.trends.series.find((series) => series.id === "temperatureInside").points.length, 2);
  assert.equal(trendsPool.queries.some((query) => query.text.includes("AVG(inside_temp)")), true);
  assert.equal(trendsPool.queries.some((query) => query.text.includes("LIMIT $2 OFFSET $3")), false);
  assert.equal(trendsPool.queries.some(isRecentChargesQuery), false);
});

test("TeslaMate data source paginates trips and loads details separately", async () => {
  const pool = createFakePool();
  const dataSource = new TeslaMateDataSource({ pool });

  const trips = await dataSource.getTrips("1", { limit: "30", cursor: "0" });
  const trip = await dataSource.getTrip("1", "drive-10");
  const tripsQuery = pool.queries.find((query) => query.text.includes("LIMIT $2 OFFSET $3"));

  assert.equal(trips.recentTrips.length, 1);
  assert.equal(trips.recentTrips[0].id, "drive-10");
  assert.equal(tripsQuery.text.includes("LAG(power"), false);
  assert.equal(tripsQuery.text.includes("date <= d.start_date"), false);
  assert.equal(trips.frequentPlaces.length, 2);
  assert.equal(trips.frequentPlaces[0].label, "Home");
  assert.equal(Object.hasOwn(trips.recentTrips[0], "routePoints"), false);
  assert.equal(Object.hasOwn(trips.recentTrips[0], "telemetry"), false);
  assert.equal(trips.pagination.total, 42);
  assert.equal(trips.pagination.nextCursor, "1");
  assert.equal(trips.pagination.hasMore, true);
  assert.equal(trip.routePoints.length, 3);
  assert.equal(trip.telemetry[1].speedKmh, 78);
  assert.equal(trip.telemetry[1].socPercent, 58);
  assert.equal(trip.telemetry[1].usableSocPercent, 57);
  assert.equal(trip.telemetry[1].ratedRangeKm, 251);
  assert.equal(trip.telemetry[1].batteryHeaterOn, false);
  assert.equal(trip.telemetry[1].tirePressure.frontLeftBar, 2.9);
});

test("TeslaMate data source falls back to coordinates instead of generic trip endpoints", async () => {
  const pool = createFakePool({
    tripAddresses: {
      start: null,
      end: null
    }
  });
  const dataSource = new TeslaMateDataSource({ pool });

  const trips = await dataSource.getTrips("1", { limit: "30", cursor: "0" });
  const trip = trips.recentTrips[0];

  assert.equal(trip.title, "10.00010, 20.00010 to 10.00030, 20.00030");
  assert.equal(trip.startLocation.label, "10.00010, 20.00010");
  assert.equal(trip.endLocation.label, "10.00030, 20.00030");
  assert.notEqual(trip.title, "Start to End");
});

test("TeslaMate data source returns null for invalid vehicle ids", async () => {
  const pool = createFakePool();
  const dataSource = new TeslaMateDataSource({ pool });

  assert.equal(await dataSource.getVehicle("not-a-number"), null);
  assert.equal(pool.queries.length, 0);
});

test("TeslaMate diagnostics reports Postgres and vehicle checks", async () => {
  const pool = createFakePool();
  const dataSource = new TeslaMateDataSource({ pool });

  const checks = await dataSource.getDiagnostics();

  assert.equal(checks.find((check) => check.id === "postgres").status, "ok");
  assert.equal(checks.find((check) => check.id === "vehicles").status, "ok");
  assert.equal(checks.find((check) => check.id === "schemaGeofences").status, "ok");
  assert.equal(checks.find((check) => check.id === "schemaParkingDrain").status, "ok");
  assert.equal(checks.find((check) => check.id === "liveSafety").status, "limited");
});
