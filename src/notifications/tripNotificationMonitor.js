const { normalizePushPreferences } = require("../binding/bindingStore");

function isoNow(now) {
  return new Date(now()).toISOString();
}

function addMinutes(isoTimestamp, minutes) {
  return new Date(new Date(isoTimestamp).getTime() + minutes * 60 * 1000).toISOString();
}

function addSeconds(isoTimestamp, seconds) {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

function isBeforeNow(isoTimestamp, now) {
  return !isoTimestamp || new Date(isoTimestamp).getTime() <= now();
}

function isAfterNow(isoTimestamp, now) {
  return Boolean(isoTimestamp) && new Date(isoTimestamp).getTime() > now();
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function timestampMarker(state, now) {
  return state?.lastMessageAt || isoNow(now);
}

function normalizeChargingState(state) {
  return String(state || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function wasActivelyCharging(state) {
  const chargingState = normalizeChargingState(state?.chargingState);
  return chargingState === "charging" ||
    chargingState === "starting" ||
    Number(state?.chargerPowerKw) > 0;
}

function isQuietHour(nowMs) {
  const hour = new Date(nowMs).getHours();
  return hour >= 22 || hour < 7;
}

function displayNameFor(vehicle) {
  return String(vehicle?.displayName || "").trim() || "车辆";
}

function tripTitle(vehicle, trip) {
  const displayName = displayNameFor(vehicle);
  if (!trip?.distanceKm) {
    return displayName;
  }
  return `${displayName} ${Number(trip.distanceKm).toFixed(1)} km`;
}

function realtimeStateFor(realtime) {
  if (!realtime) {
    return null;
  }

  return {
    available: realtime.available === true,
    status: realtime.connection?.status || null,
    lastMessageAt: realtime.connection?.lastMessageAt || null,
    ageSeconds: optionalNumber(realtime.connection?.ageSeconds),
    batteryLevel: optionalNumber(realtime.battery?.levelPercent),
    chargingPluggedIn: optionalBoolean(realtime.charging?.pluggedIn),
    chargingState: String(realtime.charging?.state || "").toLowerCase(),
    chargerPowerKw: optionalNumber(realtime.charging?.chargerPowerKw),
    chargeLimitSoc: optionalNumber(realtime.charging?.chargeLimitSoc),
    safety: {
      locked: optionalBoolean(realtime.safety?.locked),
      doorsOpen: optionalBoolean(realtime.safety?.doorsOpen),
      windowsOpen: optionalBoolean(realtime.safety?.windowsOpen),
      frunkOpen: optionalBoolean(realtime.safety?.frunkOpen),
      trunkOpen: optionalBoolean(realtime.safety?.trunkOpen)
    }
  };
}

function overviewStateFor(vehicle) {
  if (!vehicle) {
    return null;
  }

  const parkingDrainPercent = optionalNumber(
    vehicle.overview?.weeklySummary?.parkingDrainPercent ??
      vehicle.safety?.parkingDrain?.percent ??
      vehicle.safety?.parkingDrainPercent ??
      vehicle.trends?.parkingDrainPercent
  );
  return {
    parkingDrainPercent,
    lastUpdatedAt: vehicle.lastUpdatedAt || vehicle.overview?.freshness?.lastUpdatedAt || null
  };
}

function chargingEventsForRealtime({ vehicle, previous, current, now }) {
  if (!previous || !current) {
    return [];
  }

  const displayName = displayNameFor(vehicle);
  const marker = timestampMarker(current, now);
  const powerText = current.chargerPowerKw == null ? "" : `，当前功率 ${current.chargerPowerKw.toFixed(1)} kW`;
  const events = [];

  if (previous.chargingPluggedIn === false && current.chargingPluggedIn === true) {
    events.push({
      id: `charging-started-${vehicle.id}-${marker}`,
      category: "charging",
      title: "开始充电",
      body: `${displayName} 已插枪${powerText}。`,
      data: { vehicleId: String(vehicle.id), type: "charging_started" }
    });
  }

  if (previous.chargingPluggedIn === true && current.chargingPluggedIn === false) {
    const batteryText = current.batteryLevel == null ? "" : ` 当前电量 ${Math.round(current.batteryLevel)}%。`;
    events.push({
      id: `charging-disconnected-${vehicle.id}-${marker}`,
      category: "charging",
      title: "充电已断开",
      body: `${displayName} 已断开充电。${batteryText}`,
      data: { vehicleId: String(vehicle.id), type: "charging_disconnected" }
    });
  }

  if (wasActivelyCharging(previous) && normalizeChargingState(current.chargingState) === "complete") {
    const limitText = current.chargeLimitSoc == null ? "充电上限" : `${Math.round(current.chargeLimitSoc)}% 充电上限`;
    events.push({
      id: `charging-complete-${vehicle.id}-${marker}`,
      category: "charging",
      title: "充电完成",
      body: `${displayName} 已达到 ${limitText}。`,
      data: { vehicleId: String(vehicle.id), type: "charging_complete" }
    });
  }

  return events;
}

function batteryEventsForRealtime({ vehicle, previous, current, now }) {
  if (!previous || !current || previous.batteryLevel == null || current.batteryLevel == null) {
    return [];
  }

  if (current.batteryLevel >= previous.batteryLevel || current.batteryLevel > 50) {
    return [];
  }

  const marker = timestampMarker(current, now);
  const batteryLevel = Math.round(current.batteryLevel);
  return [{
    id: `battery-low-${vehicle.id}-${batteryLevel}-${marker}`,
    category: "battery",
    title: "电量偏低",
    body: `${displayNameFor(vehicle)} 当前电量 ${batteryLevel}%。`,
    batteryLevel,
    previousBatteryLevel: Math.round(previous.batteryLevel),
    data: { vehicleId: String(vehicle.id), type: "battery_low", batteryLevel }
  }];
}

function safetyEventsForRealtime({ vehicle, previous, current, now }) {
  if (!previous?.safety || !current?.safety) {
    return [];
  }

  const displayName = displayNameFor(vehicle);
  const marker = timestampMarker(current, now);
  const checks = [
    ["doorsOpen", "车门未关", `${displayName} 当前显示有车门打开。`, "doors_open"],
    ["windowsOpen", "车窗未关", `${displayName} 当前显示有车窗打开。`, "windows_open"],
    ["frunkOpen", "前备箱未关", `${displayName} 当前显示前备箱打开。`, "frunk_open"],
    ["trunkOpen", "后备箱未关", `${displayName} 当前显示后备箱打开。`, "trunk_open"]
  ];

  return checks.flatMap(([key, title, body, type]) => {
    if (previous.safety[key] === true || current.safety[key] !== true) {
      return [];
    }
    return [{
      id: `safety-${key}-${vehicle.id}-${marker}`,
      category: "safety",
      title,
      body,
      data: { vehicleId: String(vehicle.id), type }
    }];
  });
}

function staleEventsForRealtime({ vehicle, previous, current, now }) {
  if (!previous || !current || previous.status === "stale" || current.status !== "stale") {
    return [];
  }

  const ageMinutes = current.ageSeconds == null ? null : Math.round(current.ageSeconds / 60);
  const ageText = ageMinutes == null ? "已经停止更新" : `已 ${ageMinutes} 分钟未更新`;
  const marker = timestampMarker(current, now);
  return [{
    id: `stale-data-${vehicle.id}-${marker}`,
    category: "stale",
    title: "数据更新变慢",
    body: `${displayNameFor(vehicle)} 数据${ageText}。`,
    data: { vehicleId: String(vehicle.id), type: "stale_data", ageMinutes }
  }];
}

function parkingDrainEventsForOverview({ vehicle, previous, current }) {
  if (!previous || !current || previous.parkingDrainPercent == null || current.parkingDrainPercent == null) {
    return [];
  }

  if (current.parkingDrainPercent <= previous.parkingDrainPercent || current.parkingDrainPercent > 100) {
    return [];
  }

  const parkingDrainPercent = Math.round(current.parkingDrainPercent);
  return [{
    id: `parking-drain-${vehicle.id}-${parkingDrainPercent}-${current.lastUpdatedAt || ""}`,
    category: "parking",
    title: "停车耗电偏高",
    body: `${displayNameFor(vehicle)} 近期停车耗电 ${parkingDrainPercent}%。`,
    parkingDrainPercent,
    previousParkingDrainPercent: Math.round(previous.parkingDrainPercent),
    data: { vehicleId: String(vehicle.id), type: "parking_drain", parkingDrainPercent }
  }];
}

function targetAllowsEvent(target, event, nowMs) {
  const preferences = normalizePushPreferences(target.preferences || {});
  if (preferences.quietHoursEnabled && !event.allowDuringQuietHours && isQuietHour(nowMs)) {
    return false;
  }

  switch (event.category) {
    case "trip":
      return preferences.tripEvents;
    case "charging":
      return preferences.chargingEvents;
    case "battery":
      return preferences.chargingEvents &&
        Number(event.previousBatteryLevel) > preferences.lowBatteryThresholdPercent &&
        Number(event.batteryLevel) <= preferences.lowBatteryThresholdPercent;
    case "safety":
      return preferences.safetyEvents;
    case "stale":
      return preferences.staleDataEvents;
    case "parking":
      return Number(event.previousParkingDrainPercent) < preferences.parkingDrainThresholdPercent &&
        Number(event.parkingDrainPercent) >= preferences.parkingDrainThresholdPercent;
    default:
      return true;
  }
}

function safetyEventsForPostTrip({ vehicle, realtime, driveId }) {
  if (!realtime || realtime.available === false || !realtime.safety) {
    return [];
  }

  const displayName = displayNameFor(vehicle);
  const events = [];
  if (realtime.safety.locked === false) {
    events.push({
      id: `post-trip-unlocked-${driveId}`,
      title: "车辆未锁",
      body: `${displayName} 行程结束后仍显示未锁车。`
    });
  }
  if (realtime.safety.doorsOpen === true) {
    events.push({
      id: `post-trip-doors-open-${driveId}`,
      title: "车门未关",
      body: `${displayName} 行程结束后仍有车门未关闭。`
    });
  }
  if (realtime.safety.windowsOpen === true) {
    events.push({
      id: `post-trip-windows-open-${driveId}`,
      title: "车窗未关",
      body: `${displayName} 行程结束后仍有车窗未关闭。`
    });
  }
  if (realtime.safety.frunkOpen === true) {
    events.push({
      id: `post-trip-frunk-open-${driveId}`,
      title: "前备箱未关",
      body: `${displayName} 行程结束后前备箱仍未关闭。`
    });
  }
  if (realtime.safety.trunkOpen === true) {
    events.push({
      id: `post-trip-trunk-open-${driveId}`,
      title: "后备箱未关",
      body: `${displayName} 行程结束后后备箱仍未关闭。`
    });
  }
  return events;
}

class TripNotificationMonitor {
  constructor({
    config,
    dataSource,
    realtimeStore,
    bindingStore,
    stateStore,
    pushClient,
    now = () => Date.now(),
    logger = console
  }) {
    this.config = config;
    this.dataSource = dataSource;
    this.realtimeStore = realtimeStore;
    this.bindingStore = bindingStore;
    this.stateStore = stateStore;
    this.pushClient = pushClient;
    this.now = now;
    this.logger = logger;
    this.timer = null;
    this.running = false;
  }

  start() {
    if (!this.config.enabled || this.timer || !this.dataSource.getTripNotificationState) {
      return;
    }

    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.error("Trip notification monitor failed:", error);
      });
    }, this.config.pollIntervalMs);
    this.tick().catch((error) => {
      this.logger.error("Trip notification monitor failed:", error);
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    if (this.running || !this.config.enabled || !this.dataSource.getTripNotificationState) {
      return;
    }

    this.running = true;
    try {
      const vehicles = await this.dataSource.listVehicles();
      for (const vehicle of vehicles) {
        await this.checkVehicle(vehicle);
      }
    } finally {
      this.running = false;
    }
  }

  async checkVehicle(vehicle) {
    const tripState = await this.dataSource.getTripNotificationState(vehicle.id);
    const realtime = this.realtimeStore?.getSnapshot(String(vehicle.id)) || null;
    const realtimeState = realtimeStateFor(realtime);
    const overviewState = await this.loadOverviewState(vehicle);
    const current = this.stateStore.vehicle(vehicle.id);
    const activeDrive = tripState?.activeDrive || null;
    const latestEndedDrive = tripState?.latestEndedDrive || null;

    if (!current.initialized) {
      this.stateStore.updateVehicle(vehicle.id, (state) => {
        state.initialized = true;
        state.activeDriveId = activeDrive?.id ? String(activeDrive.id) : null;
        state.lastStartedDriveId = activeDrive?.id ? String(activeDrive.id) : null;
        state.lastEndedDriveId = latestEndedDrive?.id ? String(latestEndedDrive.id) : null;
        state.lastRealtime = realtimeState;
        state.lastOverview = overviewState;
      });
      return;
    }

    if (activeDrive?.id && String(activeDrive.id) !== current.activeDriveId) {
      await this.sendOnce(vehicle.id, {
        id: `trip-started-${activeDrive.id}`,
        category: "trip",
        title: "行程已开始",
        body: `${displayNameFor(vehicle)} 开始新的行程。`,
        data: { vehicleId: String(vehicle.id), driveId: String(activeDrive.id), type: "trip_started" }
      });
      this.stateStore.updateVehicle(vehicle.id, (state) => {
        state.activeDriveId = String(activeDrive.id);
        state.lastStartedDriveId = String(activeDrive.id);
      });
    }

    if (latestEndedDrive?.id && String(latestEndedDrive.id) !== current.lastEndedDriveId) {
      await this.sendOnce(vehicle.id, {
        id: `trip-ended-${latestEndedDrive.id}`,
        category: "trip",
        title: "行程已结束",
        body: `${tripTitle(vehicle, latestEndedDrive)} 行程已结束。`,
        data: { vehicleId: String(vehicle.id), driveId: String(latestEndedDrive.id), type: "trip_ended" }
      });
      const endedAt = latestEndedDrive.endedAt || isoNow(this.now);
      const safetyAfter = addSeconds(isoNow(this.now), this.config.postTripSafetyGraceSeconds || 0);
      this.stateStore.updateVehicle(vehicle.id, (state) => {
        state.activeDriveId = state.activeDriveId === String(latestEndedDrive.id) ? null : state.activeDriveId;
        state.lastEndedDriveId = String(latestEndedDrive.id);
        state.postTripDriveId = String(latestEndedDrive.id);
        state.postTripSafetyAfter = safetyAfter;
        state.postTripWatchUntil = addMinutes(endedAt, this.config.postTripWatchMinutes);
      });
    }

    await this.checkPostTripSafety(vehicle, realtime);
    await this.checkRealtimeEvents(vehicle, current.lastRealtime, realtimeState);
    await this.checkOverviewEvents(vehicle, current.lastOverview, overviewState);

    this.stateStore.updateVehicle(vehicle.id, (state) => {
      state.lastRealtime = realtimeState;
      state.lastOverview = overviewState;
    });
  }

  async loadOverviewState(vehicle) {
    if (typeof this.dataSource.getOverviewVehicle !== "function") {
      return overviewStateFor(vehicle);
    }

    try {
      const overviewVehicle = await this.dataSource.getOverviewVehicle(vehicle.id);
      return overviewStateFor(overviewVehicle || vehicle);
    } catch (error) {
      this.logger.warn(`Parking drain notification snapshot failed for ${vehicle.id}: ${error.message || error}`);
      return overviewStateFor(vehicle);
    }
  }

  async checkPostTripSafety(vehicle, realtime) {
    const current = this.stateStore.vehicle(vehicle.id);
    if (!current.postTripDriveId) {
      return;
    }

    if (isBeforeNow(current.postTripWatchUntil, this.now)) {
      this.stateStore.updateVehicle(vehicle.id, (state) => {
        state.postTripDriveId = null;
        state.postTripSafetyAfter = null;
        state.postTripWatchUntil = null;
      });
      return;
    }

    if (isAfterNow(current.postTripSafetyAfter, this.now)) {
      return;
    }

    const events = safetyEventsForPostTrip({
      vehicle,
      realtime,
      driveId: current.postTripDriveId
    });
    for (const event of events) {
      await this.sendOnce(vehicle.id, {
        ...event,
        category: "safety",
        data: { vehicleId: String(vehicle.id), driveId: current.postTripDriveId, type: "post_trip_safety" }
      });
    }
  }

  async checkRealtimeEvents(vehicle, previous, current) {
    const events = [
      ...chargingEventsForRealtime({ vehicle, previous, current, now: this.now }),
      ...batteryEventsForRealtime({ vehicle, previous, current, now: this.now }),
      ...staleEventsForRealtime({ vehicle, previous, current, now: this.now })
    ];

    for (const event of events) {
      await this.sendOnce(vehicle.id, event);
    }
  }

  async checkOverviewEvents(vehicle, previous, current) {
    const events = parkingDrainEventsForOverview({ vehicle, previous, current });
    for (const event of events) {
      await this.sendOnce(vehicle.id, event);
    }
  }

  async sendOnce(vehicleId, event) {
    if (this.stateStore.hasSent(vehicleId, event.id)) {
      return false;
    }

    const targets = this.bindingStore.listPushTargets();
    if (targets.length === 0) {
      return false;
    }

    let delivered = false;
    let filtered = 0;
    let attempted = 0;
    for (const target of targets) {
      if (!targetAllowsEvent(target, event, this.now())) {
        filtered += 1;
        continue;
      }

      attempted += 1;
      const result = await this.pushClient.send({
        deviceToken: target.deviceToken,
        environment: target.environment,
        bundleId: target.bundleId,
        title: event.title,
        body: event.body,
        eventId: event.id,
        data: { ...event.data, category: event.category || "general" }
      });
      if (result.ok) {
        delivered = true;
      }
      if (result.inactive) {
        this.bindingStore.removePushToken(target.tokenHash, target.deviceToken);
      }
      if (!result.ok && !result.skipped) {
        this.logger.warn(`Push notification failed for ${event.id}: ${result.status || ""} ${result.reason || ""}`.trim());
      }
    }

    if (delivered || (attempted === 0 && filtered > 0)) {
      this.stateStore.markSent(vehicleId, event.id);
    }
    return delivered;
  }
}

function createTripNotificationMonitor(options) {
  return new TripNotificationMonitor(options);
}

module.exports = {
  TripNotificationMonitor,
  createTripNotificationMonitor,
  safetyEventsForPostTrip
};
