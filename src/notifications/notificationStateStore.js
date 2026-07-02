const fs = require("node:fs");
const path = require("node:path");

function emptyState() {
  return {
    version: 1,
    vehicles: {}
  };
}

function normalizeVehicleState(state = {}) {
  return {
    initialized: Boolean(state.initialized),
    activeDriveId: state.activeDriveId == null ? null : String(state.activeDriveId),
    lastStartedDriveId: state.lastStartedDriveId == null ? null : String(state.lastStartedDriveId),
    lastEndedDriveId: state.lastEndedDriveId == null ? null : String(state.lastEndedDriveId),
    postTripDriveId: state.postTripDriveId == null ? null : String(state.postTripDriveId),
    postTripWatchUntil: state.postTripWatchUntil || null,
    lastRealtime: state.lastRealtime && typeof state.lastRealtime === "object" ? state.lastRealtime : null,
    lastOverview: state.lastOverview && typeof state.lastOverview === "object" ? state.lastOverview : null,
    sentEventIds: Array.isArray(state.sentEventIds) ? state.sentEventIds.map(String) : []
  };
}

function loadState(stateStorePath) {
  if (!stateStorePath || !fs.existsSync(stateStorePath)) {
    return emptyState();
  }

  const parsed = JSON.parse(fs.readFileSync(stateStorePath, "utf8"));
  const state = emptyState();
  const vehicles = parsed && typeof parsed.vehicles === "object" ? parsed.vehicles : {};
  for (const [vehicleId, vehicleState] of Object.entries(vehicles)) {
    state.vehicles[vehicleId] = normalizeVehicleState(vehicleState);
  }
  return state;
}

class NotificationStateStore {
  constructor({ stateStorePath = "", eventHistoryLimit = 500 } = {}) {
    this.stateStorePath = stateStorePath;
    this.eventHistoryLimit = eventHistoryLimit;
    this.state = loadState(stateStorePath);
  }

  vehicle(vehicleId) {
    const key = String(vehicleId);
    if (!this.state.vehicles[key]) {
      this.state.vehicles[key] = normalizeVehicleState();
    }
    return this.state.vehicles[key];
  }

  updateVehicle(vehicleId, updater) {
    const current = this.vehicle(vehicleId);
    updater(current);
    current.sentEventIds = current.sentEventIds.slice(-this.eventHistoryLimit);
    this.save();
    return current;
  }

  hasSent(vehicleId, eventId) {
    return this.vehicle(vehicleId).sentEventIds.includes(String(eventId));
  }

  markSent(vehicleId, eventId) {
    this.updateVehicle(vehicleId, (state) => {
      const normalized = String(eventId);
      if (!state.sentEventIds.includes(normalized)) {
        state.sentEventIds.push(normalized);
      }
    });
  }

  save() {
    if (!this.stateStorePath) return;
    const directory = path.dirname(this.stateStorePath);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.stateStorePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.stateStorePath);
  }
}

function createNotificationStateStore(config = {}) {
  return new NotificationStateStore({
    stateStorePath: config.stateStorePath,
    eventHistoryLimit: config.eventHistoryLimit
  });
}

module.exports = {
  NotificationStateStore,
  createNotificationStateStore
};
