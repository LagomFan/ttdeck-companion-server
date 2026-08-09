const FIXTURE_NOW = new Date("2026-06-25T04:30:00.000Z");

function freshnessFor(lastUpdatedAt) {
  const updatedAt = new Date(lastUpdatedAt);
  const ageMinutes = Math.max(
    0,
    Math.round((FIXTURE_NOW.getTime() - updatedAt.getTime()) / 60000)
  );

  return {
    lastUpdatedAt,
    ageMinutes,
    kind: ageMinutes <= 15 ? "recent" : "stale"
  };
}

function severityFromChecks(checks) {
  if (checks.some((check) => check.severity === "critical")) {
    return "critical";
  }

  if (checks.some((check) => check.severity === "warning")) {
    return "warning";
  }

  return "normal";
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function parsePositiveInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function tripTime(trip) {
  return new Date(trip.startedAt || trip.endedAt || 0).getTime();
}

function tripText(trip) {
  return [
    trip.title,
    trip.startLocation?.label,
    trip.endLocation?.label
  ].filter(Boolean).join(" ").toLowerCase();
}

function inDateRange(trip, from, to) {
  const time = tripTime(trip);
  if (from && time < new Date(from).getTime()) {
    return false;
  }
  if (to && time > new Date(to).getTime()) {
    return false;
  }
  return true;
}

function matchesTripFilter(trip, filter) {
  switch (filter) {
    case "long":
      return trip.distanceKm >= 50;
    case "highEnergy":
      return trip.energyKwh >= 20;
    case "inefficient":
      return trip.efficiencyWhPerKm >= 180;
    case "hasRoute":
      return (trip.routePoints?.length ?? 0) >= 2 || (trip.telemetry?.length ?? 0) >= 2;
    default:
      return true;
  }
}

function sortTrips(trips, sort) {
  const sorted = [...trips];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => tripTime(a) - tripTime(b));
    case "distance":
      return sorted.sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0));
    case "efficiency":
      return sorted.sort((a, b) => (b.efficiencyWhPerKm || 0) - (a.efficiencyWhPerKm || 0));
    default:
      return sorted.sort((a, b) => tripTime(b) - tripTime(a));
  }
}

function tripListItem(trip) {
  const {
    routePoints,
    telemetry,
    ...summary
  } = normalizeTrip(trip);
  return summary;
}

function buildTripDetail(vehicle, tripId) {
  const trip = vehicle.trips.find((candidate) => candidate.id === tripId);
  return trip ? normalizeTrip(trip) : null;
}

function hasRealtime(realtime) {
  return Boolean(realtime && realtime.available);
}

function realtimeIsFresh(realtime) {
  return hasRealtime(realtime) && realtime.connection?.status === "fresh";
}

function parkingDrainSeverity(percent) {
  if (percent >= 8) return "critical";
  if (percent >= 5) return "warning";
  return "normal";
}

function buildGeofence(vehicle) {
  const geofence = vehicle.safety.geofence || {};
  if (Object.keys(geofence).length > 0) {
    const label = geofence.label || vehicle.location.label || "Unknown";
    const status = geofence.status || (label === "Unknown" ? "unknown" : "inside");
    const severity = geofence.severity || (status === "outside" ? "warning" : "normal");

    return {
      available: geofence.available !== false && status !== "unknown" && status !== "not_configured",
      status,
      label,
      severity
    };
  }

  if (vehicle.safety.available === false) {
    return {
      available: false,
      status: "limited",
      label: "Not available",
      severity: "warning"
    };
  }

  const label = geofence.label || vehicle.location.label || "Unknown";
  const status = geofence.status || (label === "Unknown" ? "unknown" : "inside");
  const severity = geofence.severity || (status === "outside" ? "warning" : "normal");

  return {
    available: status !== "unknown",
    status,
    label,
    severity
  };
}

function buildAbnormalMovement(vehicle, realtime = null) {
  if (hasRealtime(realtime)) {
    const movementEvent = realtime.events?.find((event) => event.id === "parked-movement");
    return {
      available: true,
      detected: Boolean(movementEvent),
      severity: movementEvent?.severity || "normal"
    };
  }

  if (vehicle.safety.available === false) {
    return {
      available: false,
      detected: false,
      severity: "warning"
    };
  }

  const abnormalMovement = vehicle.safety.abnormalMovement || {};
  return {
    available: abnormalMovement.available !== false,
    detected: Boolean(abnormalMovement.detected),
    severity: abnormalMovement.severity || (abnormalMovement.detected ? "critical" : "normal")
  };
}

function buildParkingDrain(vehicle) {
  const parkingDrain = vehicle.safety.parkingDrain || {};
  const percent = parkingDrain.percent ?? vehicle.safety.parkingDrainPercent ?? vehicle.trends.parkingDrainPercent ?? 0;
  return {
    available: parkingDrain.available ?? percent > 0,
    percent,
    intervalCount: parkingDrain.intervalCount ?? null,
    largestDrainPercent: parkingDrain.largestDrainPercent ?? null,
    severity: parkingDrainSeverity(percent)
  };
}

function normalizeElectrical(electrical = {}) {
  const available = electrical.available !== false && (
    electrical.voltageV != null ||
    electrical.currentA != null ||
    electrical.phases != null ||
    electrical.chargerVoltage != null ||
    electrical.chargerActualCurrent != null ||
    electrical.chargerPhases != null
  );

  return {
    available: Boolean(available),
    voltageV: electrical.voltageV ?? electrical.chargerVoltage ?? null,
    currentA: electrical.currentA ?? electrical.chargerActualCurrent ?? null,
    phases: electrical.phases ?? electrical.chargerPhases ?? null
  };
}

function normalizeTirePressure(tirePressure = {}) {
  const values = [
    tirePressure.frontLeftBar,
    tirePressure.frontRightBar,
    tirePressure.rearLeftBar,
    tirePressure.rearRightBar
  ].filter((value) => value !== null && value !== undefined);

  return {
    available: Boolean(tirePressure.available || values.length > 0),
    unit: tirePressure.unit || "bar",
    frontLeftBar: tirePressure.frontLeftBar ?? null,
    frontRightBar: tirePressure.frontRightBar ?? null,
    rearLeftBar: tirePressure.rearLeftBar ?? null,
    rearRightBar: tirePressure.rearRightBar ?? null,
    softWarningFrontLeft: tirePressure.softWarningFrontLeft ?? tirePressure.softWarnings?.frontLeft ?? null,
    softWarningFrontRight: tirePressure.softWarningFrontRight ?? tirePressure.softWarnings?.frontRight ?? null,
    softWarningRearLeft: tirePressure.softWarningRearLeft ?? tirePressure.softWarnings?.rearLeft ?? null,
    softWarningRearRight: tirePressure.softWarningRearRight ?? tirePressure.softWarnings?.rearRight ?? null,
    measuredAt: tirePressure.measuredAt ?? null,
    severity: tirePressure.severity || (values.length > 0 ? "normal" : "warning")
  };
}

function normalizeRealtimeTirePressure(realtime) {
  if (!hasRealtime(realtime) || !realtime.tires?.available) {
    return null;
  }

  return normalizeTirePressure({
    available: realtime.tires.available,
    unit: realtime.tires.unit,
    frontLeftBar: realtime.tires.frontLeftBar,
    frontRightBar: realtime.tires.frontRightBar,
    rearLeftBar: realtime.tires.rearLeftBar,
    rearRightBar: realtime.tires.rearRightBar,
    softWarnings: realtime.tires.softWarnings,
    measuredAt: realtime.tires.measuredAt,
    severity: realtime.tires.severity
  });
}

function tirePressureSummary(tirePressure) {
  if (!tirePressure.available) return null;
  const values = [
    tirePressure.frontLeftBar,
    tirePressure.frontRightBar,
    tirePressure.rearLeftBar,
    tirePressure.rearRightBar
  ].filter((value) => value !== null && value !== undefined);
  if (values.length === 0) return null;
  const average = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  const roundedAverage = Math.round((average + 1e-9) * 10) / 10;
  return `${roundedAverage.toFixed(1)} ${tirePressure.unit}`;
}

function normalizeChargeSession(session) {
  const efficiencyWhPerKm = session.efficiencyWhPerKm ??
    (session.rangeAddedKm > 0 ? Math.round((session.energyAddedKwh * 1000) / session.rangeAddedKm) : null);

  return {
    ...clone(session),
    efficiencyWhPerKm,
    averagePowerKw: session.averagePowerKw ?? null
  };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function minutesFromHours(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 60) : null;
}

function normalizeRealtimeCharging(realtime) {
  if (!hasRealtime(realtime) || !realtime.charging) {
    return null;
  }

  const charging = realtime.charging;
  return {
    pluggedIn: firstDefined(charging.pluggedIn, null),
    state: firstDefined(charging.state, null),
    powerKw: firstDefined(charging.chargerPowerKw, null),
    chargeLimitPercent: firstDefined(charging.chargeLimitSoc, null),
    minutesToFull: minutesFromHours(charging.timeToFullHours),
    chargerVoltage: firstDefined(charging.chargerVoltageV, null),
    chargerActualCurrent: firstDefined(charging.chargerActualCurrentA, null),
    chargerPhases: firstDefined(charging.chargerPhases, null),
    chargeEnergyAddedKwh: firstDefined(charging.chargeEnergyAddedKwh, null),
    chargePortDoorOpen: firstDefined(charging.chargePortDoorOpen, null),
    chargeCurrentRequest: firstDefined(charging.chargeCurrentRequestA, null),
    chargeCurrentRequestMax: firstDefined(charging.chargeCurrentRequestMaxA, null),
    scheduledChargingStartAt: firstDefined(charging.scheduledChargingStartAt, null)
  };
}

function chargingStateImpliesPluggedIn(state) {
  const normalized = String(state || "").toLowerCase();
  return normalized === "charging" ||
    normalized === "stopped" ||
    normalized === "complete" ||
    normalized === "starting" ||
    normalized === "nopower" ||
    normalized === "no_power" ||
    normalized.includes("scheduled");
}

function chargingStateImpliesUnplugged(state) {
  const normalized = String(state || "").toLowerCase();
  return normalized === "unplugged" ||
    normalized === "disconnected";
}

function inferPluggedIn({ pluggedIn, state, powerKw, chargePortDoorOpen }) {
  if (typeof pluggedIn === "boolean") {
    return pluggedIn;
  }

  if (chargingStateImpliesUnplugged(state)) {
    return false;
  }
  if (chargingStateImpliesPluggedIn(state) || Number(powerKw) > 0) {
    return true;
  }
  return chargePortDoorOpen === true ? null : false;
}

function normalizeTrip(trip) {
  return {
    ...clone(trip),
    startLocation: clone(trip.startLocation) ?? null,
    endLocation: clone(trip.endLocation) ?? null,
    routePoints: clone(trip.routePoints || []),
    telemetry: clone(trip.telemetry || []),
    averageSpeedKmh: trip.averageSpeedKmh ?? null,
    maxSpeedKmh: trip.maxSpeedKmh ?? null,
    maxPowerKw: trip.maxPowerKw ?? null
  };
}

function mergedOverviewLocation(vehicle, realtime) {
  if (hasRealtime(realtime) && realtime.location?.available !== false &&
      realtime.location?.latitude != null && realtime.location?.longitude != null) {
    return {
      ...vehicle.location,
      latitude: realtime.location.latitude,
      longitude: realtime.location.longitude
    };
  }
  return { ...vehicle.location };
}

function mergedOverviewBattery(vehicle, realtime) {
  return {
    percent: firstDefined(realtime?.battery?.levelPercent, vehicle.battery.percent),
    usablePercent: firstDefined(realtime?.battery?.usablePercent, vehicle.battery.usablePercent)
  };
}

function mergedOverviewRange(vehicle, realtime) {
  const estimatedKm = firstDefined(
    realtime?.battery?.estimatedRangeKm == null ? null : Math.round(realtime.battery.estimatedRangeKm),
    vehicle.battery.estimatedKm
  );
  const ratedKm = firstDefined(
    realtime?.battery?.ratedRangeKm == null ? null : Math.round(realtime.battery.ratedRangeKm),
    vehicle.battery.ratedKm
  );
  return {
    estimatedKm,
    ratedKm,
    healthPercent: vehicle.trends.estimatedRangeHealthPercent,
    idealKm: firstDefined(
      realtime?.battery?.idealRangeKm == null ? null : Math.round(realtime.battery.idealRangeKm),
      vehicle.battery.idealKm,
      null
    )
  };
}

function mergedOverviewDetails(vehicle, realtime) {
  return {
    model: firstDefined(realtime?.vehicle?.model, vehicle.details?.model, null),
    trimBadging: firstDefined(realtime?.vehicle?.trimBadging, vehicle.details?.trimBadging, null),
    exteriorColor: firstDefined(realtime?.vehicle?.exteriorColor, vehicle.details?.exteriorColor, null),
    wheelType: firstDefined(realtime?.vehicle?.wheelType, vehicle.details?.wheelType, null),
    softwareVersion: firstDefined(realtime?.software?.version, realtime?.vehicle?.version, vehicle.details?.softwareVersion, null),
    updateAvailable: firstDefined(realtime?.software?.updateAvailable, vehicle.details?.updateAvailable, null),
    updateVersion: vehicle.details?.updateVersion ?? null,
    odometerKm: firstDefined(realtime?.drive?.odometerKm, vehicle.details?.odometerKm, null)
  };
}

function mergedOverviewClimate(vehicle, realtime) {
  return {
    insideTempC: firstDefined(realtime?.climate?.insideTempC, vehicle.climate?.insideTempC, null),
    outsideTempC: firstDefined(realtime?.climate?.outsideTempC, vehicle.climate?.outsideTempC, null),
    isClimateOn: firstDefined(realtime?.climate?.isClimateOn, vehicle.climate?.isClimateOn, null),
    isPreconditioning: firstDefined(realtime?.climate?.preconditioning, vehicle.climate?.isPreconditioning, null)
  };
}

function normalizedRouteDestination(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
}

function normalizedNavigation(navigation) {
  if (!navigation) return null;
  return {
    destination: normalizedRouteDestination(navigation.destination),
    latitude: navigation.latitude ?? null,
    longitude: navigation.longitude ?? null,
    energyAtArrivalPercent: navigation.energyAtArrivalPercent ?? null,
    distanceToArrivalKm: navigation.distanceToArrivalKm ?? null,
    minutesToArrival: navigation.minutesToArrival ?? null,
    trafficDelayMinutes: navigation.trafficDelayMinutes ?? null,
    available: navigation.available ?? null,
    error: navigation.error ?? null
  };
}

function mergedOverviewNavigation(vehicle, realtime) {
  const route = realtime?.route || null;
  if (hasRealtime(realtime) && route?.available === false) {
    return {
      destination: null,
      latitude: null,
      longitude: null,
      energyAtArrivalPercent: null,
      distanceToArrivalKm: null,
      minutesToArrival: null,
      trafficDelayMinutes: null,
      available: false,
      error: route.error ?? null
    };
  }

  const realtimeDestination = firstDefined(
    normalizedRouteDestination(route?.destination),
    normalizedRouteDestination(route?.activeRoute)
  );
  const hasRealtimeNavigation = hasRealtime(realtime) && (
    realtimeDestination != null ||
    route?.latitude != null ||
    route?.longitude != null ||
    route?.energyAtArrivalPercent != null ||
    route?.distanceToArrivalKm != null ||
    route?.minutesToArrival != null ||
    route?.trafficDelayMinutes != null ||
    route?.available != null ||
    route?.error != null
  );

  if (hasRealtimeNavigation) {
    return {
      destination: firstDefined(realtimeDestination, normalizedRouteDestination(vehicle.navigation?.destination), null),
      latitude: firstDefined(route?.latitude, vehicle.navigation?.latitude, null),
      longitude: firstDefined(route?.longitude, vehicle.navigation?.longitude, null),
      energyAtArrivalPercent: firstDefined(route?.energyAtArrivalPercent, vehicle.navigation?.energyAtArrivalPercent, null),
      distanceToArrivalKm: firstDefined(route?.distanceToArrivalKm, vehicle.navigation?.distanceToArrivalKm, null),
      minutesToArrival: firstDefined(route?.minutesToArrival, vehicle.navigation?.minutesToArrival, null),
      trafficDelayMinutes: firstDefined(route?.trafficDelayMinutes, vehicle.navigation?.trafficDelayMinutes, null),
      available: firstDefined(route?.available, vehicle.navigation?.available, null),
      error: firstDefined(route?.error, vehicle.navigation?.error, null)
    };
  }
  return normalizedNavigation(vehicle.navigation);
}

function buildOverview(vehicle, realtime = null) {
  const safety = buildSafety(vehicle, realtime);
  const charging = buildCharging(vehicle, realtime);
  const safetyLimited = vehicle.safety.available === false && !hasRealtime(realtime);
  const tirePressure = normalizeRealtimeTirePressure(realtime) || normalizeTirePressure(vehicle.safety.tirePressure);
  const tirePressureValue = tirePressureSummary(tirePressure);
  const chargingState = String(charging.current.state || "").toLowerCase();
  const chargingStateUnknown = !charging.current.pluggedIn && (chargingState === "unknown" || chargingState === "");
  const details = mergedOverviewDetails(vehicle, realtime);
  const climate = mergedOverviewClimate(vehicle, realtime);
  const location = mergedOverviewLocation(vehicle, realtime);
  const battery = mergedOverviewBattery(vehicle, realtime);
  const range = mergedOverviewRange(vehicle, realtime);

  return {
    vehicleId: vehicle.id,
    displayName: firstDefined(realtime?.vehicle?.displayName, vehicle.displayName),
    vinSuffix: vehicle.vinSuffix,
    state: firstDefined(realtime?.vehicle?.state, vehicle.state),
    location,
    battery,
    range,
    details,
    climate,
    navigation: mergedOverviewNavigation(vehicle, realtime),
    freshness: freshnessFor(vehicle.lastUpdatedAt),
    summaryCards: [
      {
        id: "safety",
        label: "Safety",
        severity: safety.overallSeverity,
        value: safetyLimited
          ? "Limited"
          : safety.overallSeverity === "normal"
            ? "Secure"
            : "Needs attention"
      },
      {
        id: "charging",
        label: "Charging",
        severity: charging.current.pluggedIn ? "normal" : "warning",
        value: charging.current.pluggedIn
          ? charging.current.state
          : (chargingStateUnknown ? "Plug state unknown" : "Unplugged")
      },
      {
        id: "location",
        label: "Location",
        severity: "normal",
        value: location.label
      },
      {
        id: "tirePressure",
        label: "Tire pressure",
        severity: tirePressure.available ? tirePressure.severity : safetyLimited ? "warning" : vehicle.safety.tirePressureOk ? "normal" : "warning",
        value: tirePressureValue || (safetyLimited ? "Not in source database" : vehicle.safety.tirePressureOk ? "OK" : "Check tires")
      },
      {
        id: "temperature",
        label: "Temperature",
        severity: "normal",
        value: climate.insideTempC == null ? "Unknown" : `${climate.insideTempC}C inside`
      },
      {
        id: "system",
        label: "System",
        severity: vehicle.state === "offline" ? "critical" : "normal",
        value: vehicle.state
      }
    ],
    recentActivity: vehicle.trips.slice(0, 2).map((trip) => ({
      id: trip.id,
      title: trip.title,
      endedAt: trip.endedAt,
      distanceKm: trip.distanceKm,
      energyKwh: trip.energyKwh
    })),
    weeklySummary: {
      distanceKm: vehicle.trends.weeklyDistanceKm,
      energyKwh: vehicle.trends.weeklyEnergyKwh,
      chargingEnergyKwh: vehicle.trends.weeklyChargingEnergyKwh ?? null,
      parkingDrainPercent: vehicle.trends.parkingDrainPercent
    }
  };
}

function addBooleanCheck(checks, { id, label, ok, failSeverity = "warning" }) {
  if (typeof ok !== "boolean") return;
  checks.push({
    id,
    label,
    ok,
    severity: ok ? "normal" : failSeverity
  });
}

function realtimeCheckStatus(realtime) {
  if (!hasRealtime(realtime)) {
    return {
      ok: false,
      severity: "warning"
    };
  }

  return {
    ok: realtime.connection?.status === "fresh",
    severity: realtimeIsFresh(realtime) ? "normal" : "warning"
  };
}

function buildRealtimeSafety(vehicle, realtime) {
  const tirePressure = normalizeRealtimeTirePressure(realtime) || normalizeTirePressure(vehicle.safety.tirePressure);
  const liveTelemetry = realtimeCheckStatus(realtime);
  const checks = [
    {
      id: "liveTelemetry",
      label: "Live telemetry",
      ok: liveTelemetry.ok,
      severity: liveTelemetry.severity
    }
  ];

  addBooleanCheck(checks, {
    id: "lock",
    label: "Locked",
    ok: realtime.safety?.locked,
    failSeverity: "warning"
  });
  addBooleanCheck(checks, {
    id: "doors",
    label: "Doors",
    ok: typeof realtime.safety?.doorsOpen === "boolean" ? !realtime.safety.doorsOpen : undefined,
    failSeverity: "critical"
  });
  addBooleanCheck(checks, {
    id: "windows",
    label: "Windows",
    ok: typeof realtime.safety?.windowsOpen === "boolean" ? !realtime.safety.windowsOpen : undefined,
    failSeverity: "warning"
  });
  addBooleanCheck(checks, {
    id: "frunk",
    label: "Front Trunk",
    ok: typeof realtime.safety?.frunkOpen === "boolean" ? !realtime.safety.frunkOpen : undefined,
    failSeverity: "critical"
  });
  addBooleanCheck(checks, {
    id: "trunk",
    label: "Trunk",
    ok: typeof realtime.safety?.trunkOpen === "boolean" ? !realtime.safety.trunkOpen : undefined,
    failSeverity: "critical"
  });
  addBooleanCheck(checks, {
    id: "sentry",
    label: "Security Watch",
    ok: realtime.safety?.sentryMode,
    failSeverity: "warning"
  });

  if (tirePressure.available) {
    checks.push({
      id: "tirePressure",
      label: "Tire pressure",
      ok: tirePressure.severity === "normal",
      severity: tirePressure.severity
    });
  }

  return {
    vehicleId: vehicle.id,
    overallSeverity: severityFromChecks(checks),
    checks,
    geofence: buildGeofence(vehicle),
    abnormalMovement: buildAbnormalMovement(vehicle, realtime),
    parkingDrain: buildParkingDrain(vehicle),
    tirePressure,
    connectivity: [
      {
        id: "teslamateMqtt",
        label: "Live Telemetry Feed",
        status: realtime.connection?.status || "unknown",
        severity: realtimeIsFresh(realtime) ? "normal" : "warning"
      },
      {
        id: "teslamatePostgres",
        label: "Source Database",
        status: "ok",
        severity: "normal"
      }
    ],
    realtimeEvents: clone(realtime.events || []),
    freshness: {
      lastUpdatedAt: realtime.connection?.lastMessageAt || vehicle.lastUpdatedAt,
      ageMinutes: Math.max(0, Math.round((realtime.connection?.ageSeconds || 0) / 60)),
      kind: realtimeIsFresh(realtime) ? "recent" : "stale"
    }
  };
}

function buildSafety(vehicle, realtime = null) {
  const tirePressure = normalizeRealtimeTirePressure(realtime) || normalizeTirePressure(vehicle.safety.tirePressure);
  if (hasRealtime(realtime)) {
    return buildRealtimeSafety(vehicle, realtime);
  }

  if (vehicle.safety.available === false) {
    const checks = [
      {
        id: "liveTelemetry",
        label: "Live telemetry",
        ok: false,
        severity: "warning"
      }
    ];

    if (tirePressure.available) {
      checks.push({
        id: "tirePressure",
        label: "Tire pressure",
        ok: true,
        severity: tirePressure.severity
      });
    }

    return {
      vehicleId: vehicle.id,
      overallSeverity: severityFromChecks(checks),
      checks,
      geofence: buildGeofence(vehicle),
      abnormalMovement: buildAbnormalMovement(vehicle, realtime),
      parkingDrain: buildParkingDrain(vehicle),
      tirePressure,
      connectivity: [
        {
          id: "teslamatePostgres",
          label: "Source Database",
          status: "limited",
          severity: "warning"
        }
      ],
      realtimeEvents: [],
      freshness: freshnessFor(vehicle.lastUpdatedAt)
    };
  }

  const checks = [
    {
      id: "lock",
      label: "Locked",
      ok: vehicle.safety.locked,
      severity: vehicle.safety.locked ? "normal" : "warning"
    },
    {
      id: "doors",
      label: "Doors",
      ok: vehicle.safety.doorsClosed,
      severity: vehicle.safety.doorsClosed ? "normal" : "critical"
    },
    {
      id: "windows",
      label: "Windows",
      ok: vehicle.safety.windowsClosed,
      severity: vehicle.safety.windowsClosed ? "normal" : "warning"
    },
    {
      id: "frunk",
      label: "Front Trunk",
      ok: vehicle.safety.frunkClosed,
      severity: vehicle.safety.frunkClosed ? "normal" : "critical"
    },
    {
      id: "trunk",
      label: "Trunk",
      ok: vehicle.safety.trunkClosed,
      severity: vehicle.safety.trunkClosed ? "normal" : "critical"
    },
    {
      id: "sentry",
      label: "Security Watch",
      ok: vehicle.safety.sentryMode,
      severity: vehicle.safety.sentryMode ? "normal" : "warning"
    },
    {
      id: "tirePressure",
      label: "Tire pressure",
      ok: vehicle.safety.tirePressureOk,
      severity: vehicle.safety.tirePressureOk ? "normal" : "warning"
    }
  ];

  return {
    vehicleId: vehicle.id,
    overallSeverity: severityFromChecks(checks),
    checks,
    geofence: buildGeofence(vehicle),
    abnormalMovement: buildAbnormalMovement(vehicle, realtime),
    parkingDrain: buildParkingDrain(vehicle),
    tirePressure,
    connectivity: [
      {
        id: "companionSnapshot",
        label: "Companion snapshot",
        status: "ok",
        severity: "normal"
      },
      {
        id: "teslamate",
        label: "Self-Hosted Vehicle Data Source",
        status: "ok",
        severity: "normal"
      }
    ],
    realtimeEvents: [],
    freshness: freshnessFor(vehicle.lastUpdatedAt)
  };
}

function buildCharging(vehicle, realtime = null) {
  const realtimeCharging = normalizeRealtimeCharging(realtime);
  const electrical = normalizeElectrical({
    ...vehicle.charging.electrical,
    chargerVoltage: vehicle.charging.chargerVoltage,
    chargerActualCurrent: vehicle.charging.chargerActualCurrent,
    chargerPhases: vehicle.charging.chargerPhases
  });
  const chargerVoltage = firstDefined(realtimeCharging?.chargerVoltage, electrical.voltageV);
  const chargerActualCurrent = firstDefined(realtimeCharging?.chargerActualCurrent, electrical.currentA);
  const chargerPhases = firstDefined(realtimeCharging?.chargerPhases, electrical.phases);
  const state = firstDefined(realtimeCharging?.state, vehicle.charging.state, "Unknown");
  const powerKw = firstDefined(realtimeCharging?.powerKw, vehicle.charging.powerKw, 0);
  const scheduledChargingStartAt = firstDefined(realtimeCharging?.scheduledChargingStartAt, vehicle.charging.scheduledChargingStartAt, null);
  const chargePortDoorOpen = firstDefined(realtimeCharging?.chargePortDoorOpen, vehicle.charging.chargePortDoorOpen, null);
  const pluggedIn = inferPluggedIn({
    pluggedIn: firstDefined(realtimeCharging?.pluggedIn, vehicle.charging.pluggedIn, null),
    state,
    powerKw,
    chargePortDoorOpen
  });
  const mergedElectrical = normalizeElectrical({
    voltageV: chargerVoltage,
    currentA: chargerActualCurrent,
    phases: chargerPhases
  });

  return {
    vehicleId: vehicle.id,
    current: {
      pluggedIn: pluggedIn === true,
      state,
      powerKw,
      chargeLimitPercent: firstDefined(realtimeCharging?.chargeLimitPercent, vehicle.charging.chargeLimitPercent, 0),
      minutesToFull: firstDefined(realtimeCharging?.minutesToFull, vehicle.charging.minutesToFull, null),
      electrical: mergedElectrical,
      chargerVoltage,
      chargerActualCurrent,
      chargerPhases,
      chargeEnergyAddedKwh: firstDefined(realtimeCharging?.chargeEnergyAddedKwh, vehicle.charging.chargeEnergyAddedKwh, null),
      chargePortDoorOpen,
      chargeCurrentRequest: firstDefined(realtimeCharging?.chargeCurrentRequest, vehicle.charging.chargeCurrentRequest, null),
      chargeCurrentRequestMax: firstDefined(realtimeCharging?.chargeCurrentRequestMax, vehicle.charging.chargeCurrentRequestMax, null),
      scheduledChargingStartAt
    },
    recentSessions: vehicle.charging.recentSessions.map(normalizeChargeSession)
  };
}

function buildTrips(vehicle, options = {}) {
  const limit = parsePositiveInteger(options.limit, 30, { min: 1, max: 100 });
  const offset = parsePositiveInteger(options.cursor, 0, { min: 0 });
  const query = String(options.query || "").trim().toLowerCase();
  const filteredTrips = sortTrips(
    vehicle.trips.filter((trip) => {
      if (!inDateRange(trip, options.from, options.to)) {
        return false;
      }
      if (!matchesTripFilter(trip, options.filter)) {
        return false;
      }
      return !query || tripText(trip).includes(query);
    }),
    options.sort
  );
  const page = filteredTrips.slice(offset, offset + limit);
  const nextOffset = offset + page.length;

  return {
    vehicleId: vehicle.id,
    recentTrips: page.map(tripListItem),
    frequentPlaces: clone(vehicle.frequentPlaces || []),
    pagination: {
      limit,
      nextCursor: nextOffset < filteredTrips.length ? String(nextOffset) : null,
      total: filteredTrips.length,
      hasMore: nextOffset < filteredTrips.length
    }
  };
}

function buildTrends(vehicle) {
  const metrics = [
    {
      id: "weeklyDistance",
      label: "Weekly distance",
      value: vehicle.trends.weeklyDistanceKm,
      unit: "km"
    },
    {
      id: "weeklyEnergy",
      label: "Weekly energy",
      value: vehicle.trends.weeklyEnergyKwh,
      unit: "kWh"
    }
  ];

  if (vehicle.trends.weeklyChargingEnergyKwh != null) {
    metrics.push({
      id: "weeklyChargingEnergy",
      label: "Weekly charging",
      value: vehicle.trends.weeklyChargingEnergyKwh,
      unit: "kWh"
    });
  }

  metrics.push(
    {
      id: "parkingDrain",
      label: "Parking drain",
      value: vehicle.trends.parkingDrainPercent,
      unit: "%"
    },
    {
      id: "rangeHealth",
      label: "Range health",
      value: vehicle.trends.estimatedRangeHealthPercent,
      unit: "%"
    }
  );

  return {
    vehicleId: vehicle.id,
    metrics,
    series: clone(vehicle.trends.series || []),
    softwareUpdates: clone(vehicle.trends.softwareUpdates || []),
    healthEvents: clone(vehicle.trends.healthEvents || [])
  };
}

module.exports = {
  buildCharging,
  buildOverview,
  buildSafety,
  buildTripDetail,
  buildTrends,
  buildTrips
};
