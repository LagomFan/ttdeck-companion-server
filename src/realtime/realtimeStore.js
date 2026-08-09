const { buildRealtimeEvents } = require("./realtimeRules");

function normalizeTopicPrefix(prefix) {
  return String(prefix || "teslamate/cars").replace(/^\/+|\/+$/g, "");
}

function parsePayload(value) {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
  const trimmed = text.trim();

  if (trimmed === "" || trimmed === "nil" || trimmed === "null") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function optionalNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalInt(value) {
  const number = optionalNumber(value);
  return number === null ? null : Math.round(number);
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function optionalString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    for (const key of ["destination", "name", "display_name", "label", "value"]) {
      const normalized = optionalString(value[key]);
      if (normalized) return normalized;
    }
  }
  return null;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
    const numericDate = new Date(milliseconds);
    return Number.isFinite(numericDate.getTime()) ? numericDate.toISOString() : null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function ageSecondsSince(isoTimestamp, now = new Date()) {
  if (!isoTimestamp) return null;
  const timestamp = new Date(isoTimestamp);
  const elapsed = now.getTime() - timestamp.getTime();
  if (!Number.isFinite(elapsed)) return null;
  return Math.max(0, Math.round(elapsed / 1000));
}

function hasCoordinate(latitude, longitude) {
  return latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;
}

function firstNonNull(...values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function distanceToKm(payload) {
  const kilometers = optionalNumber(payload.distance_to_arrival_km ?? payload.distance_km);
  if (kilometers !== null) return kilometers;

  const miles = optionalNumber(payload.miles_to_arrival);
  return miles === null ? null : miles * 1.609344;
}

function buildRoute(fields) {
  const hasActiveRoute = Object.hasOwn(fields, "active_route");
  const scalarActiveRoute = hasActiveRoute && typeof fields.active_route === "string"
    ? optionalString(fields.active_route)
    : null;
  const malformedStructuredRoute = scalarActiveRoute !== null && (
    scalarActiveRoute.startsWith("{") || scalarActiveRoute.startsWith("[")
  );
  const payload = fields.active_route && typeof fields.active_route === "object" && !Array.isArray(fields.active_route)
    ? fields.active_route
    : {};
  const hasStructuredRoute = Object.keys(payload).length > 0;
  const location = payload.location && typeof payload.location === "object" && !Array.isArray(payload.location)
    ? payload.location
    : {};
  const error = optionalString(payload.error);
  const unavailable = error === "No active route available";

  if (unavailable || (hasActiveRoute && !hasStructuredRoute && malformedStructuredRoute)) {
    return {
      activeRoute: null,
      available: false,
      destination: null,
      latitude: null,
      longitude: null,
      energyAtArrivalPercent: null,
      distanceToArrivalKm: null,
      minutesToArrival: null,
      trafficDelayMinutes: null,
      error
    };
  }

  const destination = firstNonNull(
    optionalString(payload.destination),
    optionalString(payload.name),
    scalarActiveRoute,
    optionalString(fields.active_route_destination)
  );
  const latitude = firstNonNull(
    optionalNumber(location.latitude),
    optionalNumber(payload.latitude),
    optionalNumber(fields.active_route_latitude)
  );
  const longitude = firstNonNull(
    optionalNumber(location.longitude),
    optionalNumber(payload.longitude),
    optionalNumber(fields.active_route_longitude)
  );
  const energyAtArrivalPercent = firstNonNull(
    optionalInt(payload.energy_at_arrival),
    optionalInt(payload.energyAtArrivalPercent)
  );
  const distanceToArrivalKm = distanceToKm(payload);
  const minutesToArrival = firstNonNull(
    optionalInt(payload.minutes_to_arrival),
    optionalInt(payload.minutesToArrival)
  );
  const trafficDelayMinutes = firstNonNull(
    optionalInt(payload.traffic_minutes_delay),
    optionalInt(payload.trafficDelayMinutes)
  );
  const available = Boolean(destination || hasCoordinate(latitude, longitude));

  return {
    activeRoute: destination,
    available,
    destination,
    latitude,
    longitude,
    energyAtArrivalPercent,
    distanceToArrivalKm,
    minutesToArrival,
    trafficDelayMinutes,
    error
  };
}

function pressureSeverity(fields) {
  const warnings = [
    fields.tpms_soft_warning_fl,
    fields.tpms_soft_warning_fr,
    fields.tpms_soft_warning_rl,
    fields.tpms_soft_warning_rr
  ];
  return warnings.some((warning) => warning === true) ? "warning" : "normal";
}

function buildTirePressure(fields) {
  const frontLeftBar = optionalNumber(fields.tpms_pressure_fl);
  const frontRightBar = optionalNumber(fields.tpms_pressure_fr);
  const rearLeftBar = optionalNumber(fields.tpms_pressure_rl);
  const rearRightBar = optionalNumber(fields.tpms_pressure_rr);
  const values = [frontLeftBar, frontRightBar, rearLeftBar, rearRightBar].filter((value) => value !== null);
  const softWarnings = {
    frontLeft: optionalBoolean(fields.tpms_soft_warning_fl),
    frontRight: optionalBoolean(fields.tpms_soft_warning_fr),
    rearLeft: optionalBoolean(fields.tpms_soft_warning_rl),
    rearRight: optionalBoolean(fields.tpms_soft_warning_rr)
  };
  const softWarning = Object.values(softWarnings).some((warning) => warning === true);

  return {
    available: values.length > 0 || Object.values(softWarnings).some((warning) => warning !== null),
    unit: "bar",
    frontLeftBar,
    frontRightBar,
    rearLeftBar,
    rearRightBar,
    measuredAt: null,
    severity: values.length > 0 || softWarning ? pressureSeverity(fields) : "warning",
    softWarning,
    softWarnings
  };
}

function buildSnapshot({ vehicleId, fields, connection, config, now = new Date() }) {
  const lastMessageAt = fields.__lastMessageAt || connection.lastMessageAt;
  const ageSeconds = ageSecondsSince(lastMessageAt, now);
  const stale = ageSeconds !== null && ageSeconds > config.staleAfterSeconds;
  const locationPayload = fields.location && typeof fields.location === "object" ? fields.location : {};
  const latitude = optionalNumber(fields.latitude ?? locationPayload.latitude);
  const longitude = optionalNumber(fields.longitude ?? locationPayload.longitude);
  const tires = buildTirePressure(fields);
  const doorsOpen = optionalBoolean(fields.doors_open);
  const windowsOpen = optionalBoolean(fields.windows_open);
  const frunkOpen = optionalBoolean(fields.frunk_open);
  const trunkOpen = optionalBoolean(fields.trunk_open);

  const snapshot = {
    vehicleId: String(vehicleId),
    available: Boolean(lastMessageAt),
    connection: {
      enabled: true,
      connected: Boolean(connection.connected),
      status: !connection.connected ? "disconnected" : stale ? "stale" : "fresh",
      lastMessageAt,
      ageSeconds,
      staleAfterSeconds: config.staleAfterSeconds,
      lastError: connection.lastError
    },
    vehicle: {
      displayName: optionalString(fields.display_name),
      model: optionalString(fields.model),
      trimBadging: optionalString(fields.trim_badging),
      exteriorColor: optionalString(fields.exterior_color),
      wheelType: optionalString(fields.wheel_type),
      version: optionalString(fields.version),
      state: optionalString(fields.state),
      since: toIso(fields.since)
    },
    location: {
      available: hasCoordinate(latitude, longitude),
      latitude,
      longitude,
      heading: optionalInt(fields.heading),
      elevationM: optionalNumber(fields.elevation)
    },
    battery: {
      levelPercent: optionalInt(fields.battery_level),
      usablePercent: optionalInt(fields.usable_battery_level),
      estimatedRangeKm: optionalNumber(fields.est_battery_range_km),
      idealRangeKm: optionalNumber(fields.ideal_battery_range_km),
      ratedRangeKm: optionalNumber(fields.rated_battery_range_km)
    },
    charging: {
      pluggedIn: optionalBoolean(fields.plugged_in),
      state: fields.charging_state ?? null,
      chargePortDoorOpen: optionalBoolean(fields.charge_port_door_open),
      chargerPowerKw: optionalNumber(fields.charger_power),
      chargerVoltageV: optionalInt(fields.charger_voltage),
      chargerActualCurrentA: optionalNumber(fields.charger_actual_current),
      chargerPhases: optionalInt(fields.charger_phases),
      chargeLimitSoc: optionalInt(fields.charge_limit_soc),
      chargeCurrentRequestA: optionalNumber(fields.charge_current_request),
      chargeCurrentRequestMaxA: optionalNumber(fields.charge_current_request_max),
      timeToFullHours: optionalNumber(fields.time_to_full_charge),
      chargeEnergyAddedKwh: optionalNumber(fields.charge_energy_added),
      scheduledChargingStartAt: toIso(fields.scheduled_charging_start_time)
    },
    safety: {
      locked: optionalBoolean(fields.locked),
      doorsOpen,
      windowsOpen,
      frunkOpen,
      trunkOpen,
      sentryMode: optionalBoolean(fields.sentry_mode),
      isUserPresent: optionalBoolean(fields.is_user_present)
    },
    climate: {
      insideTempC: optionalNumber(fields.inside_temp),
      outsideTempC: optionalNumber(fields.outside_temp),
      isClimateOn: optionalBoolean(fields.is_climate_on),
      climateKeeperMode: fields.climate_keeper_mode ?? null,
      preconditioning: optionalBoolean(fields.is_preconditioning)
    },
    tires,
    drive: {
      shiftState: fields.shift_state ?? null,
      speedKmh: optionalNumber(fields.speed),
      powerKw: optionalNumber(fields.power),
      odometerKm: optionalNumber(fields.odometer),
      heading: optionalInt(fields.heading)
    },
    route: buildRoute(fields),
    software: {
      updateAvailable: optionalBoolean(fields.update_available),
      version: fields.version ?? null
    },
    events: []
  };

  snapshot.tires.measuredAt = snapshot.tires.available ? lastMessageAt : null;
  snapshot.events = buildRealtimeEvents(snapshot);
  return snapshot;
}

class RealtimeStore {
  constructor(config = {}) {
    this.config = {
      enabled: Boolean(config.enabled),
      topicPrefix: normalizeTopicPrefix(config.topicPrefix),
      staleAfterSeconds: config.staleAfterSeconds || 300
    };
    this.connection = {
      enabled: this.config.enabled,
      connected: false,
      lastMessageAt: null,
      lastError: null
    };
    this.vehicles = new Map();
  }

  setConnection(update) {
    this.connection = {
      ...this.connection,
      ...update,
      enabled: this.config.enabled
    };
  }

  setError(message) {
    this.setConnection({
      connected: false,
      lastError: message || "Live telemetry feed connection failed."
    });
  }

  applyTopic(topic, payload, receivedAt = new Date()) {
    const normalizedTopic = String(topic || "").replace(/^\/+|\/+$/g, "");
    const expectedPrefix = `${this.config.topicPrefix}/`;
    if (!normalizedTopic.startsWith(expectedPrefix)) {
      return false;
    }

    const rest = normalizedTopic.slice(expectedPrefix.length);
    const [vehicleId, field, ...extra] = rest.split("/");
    if (!vehicleId || !field || extra.length > 0) {
      return false;
    }

    const fields = this.vehicles.get(vehicleId) || {};
    fields[field] = parsePayload(payload);
    fields.__lastMessageAt = receivedAt.toISOString();
    this.vehicles.set(vehicleId, fields);
    this.setConnection({
      lastMessageAt: fields.__lastMessageAt,
      lastError: null
    });
    return true;
  }

  getSnapshot(vehicleId, { now = new Date() } = {}) {
    if (!this.config.enabled) {
      return {
        vehicleId: String(vehicleId),
        available: false,
        connection: {
          enabled: false,
          connected: false,
          status: "disabled",
          lastMessageAt: null,
          ageSeconds: null,
          staleAfterSeconds: this.config.staleAfterSeconds,
          lastError: null
        },
        events: []
      };
    }

    const fields = this.vehicles.get(String(vehicleId));
    if (!fields) {
      return {
        vehicleId: String(vehicleId),
        available: false,
        connection: {
          enabled: true,
          connected: Boolean(this.connection.connected),
          status: this.connection.connected ? "waiting" : "disconnected",
          lastMessageAt: this.connection.lastMessageAt,
          ageSeconds: ageSecondsSince(this.connection.lastMessageAt, now),
          staleAfterSeconds: this.config.staleAfterSeconds,
          lastError: this.connection.lastError
        },
        events: []
      };
    }

    return buildSnapshot({
      vehicleId,
      fields,
      connection: this.connection,
      config: this.config,
      now
    });
  }

  getDiagnostics() {
    if (!this.config.enabled) {
      return {
        id: "mqtt",
        label: "Live Telemetry Feed",
        status: "skipped",
        message: "Live telemetry feed is disabled."
      };
    }

    if (this.connection.connected) {
      const vehicleCount = this.vehicles.size;
      return {
        id: "mqtt",
        label: "Live Telemetry Feed",
        status: vehicleCount > 0 ? "ok" : "warning",
        message: vehicleCount > 0
          ? `Live telemetry feed connected; realtime fields received for ${vehicleCount} vehicle(s).`
          : "Live telemetry feed connected; waiting for retained vehicle topics."
      };
    }

    return {
      id: "mqtt",
      label: "Live Telemetry Feed",
      status: "warning",
      message: this.connection.lastError || "Live telemetry feed is not connected yet."
    };
  }
}

function createRealtimeStore(config) {
  return new RealtimeStore(config);
}

module.exports = {
  RealtimeStore,
  buildSnapshot,
  createRealtimeStore,
  parsePayload
};
