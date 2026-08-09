function event({ id, severity, title, message, occurredAt }) {
  return {
    id,
    severity,
    title,
    message,
    occurredAt
  };
}

function buildRealtimeEvents(snapshot) {
  const occurredAt = snapshot.connection.lastMessageAt || new Date().toISOString();
  const events = [];

  if (!snapshot.connection.connected) {
    events.push(event({
      id: "mqtt-disconnected",
      severity: "warning",
      title: "Live telemetry feed disconnected",
      message: "The Companion Server is not currently connected to the live telemetry feed.",
      occurredAt
    }));
  }

  if (snapshot.connection.status === "stale") {
    events.push(event({
      id: "realtime-stale",
      severity: "warning",
      title: "Realtime data stale",
      message: `No live telemetry update has been received for ${snapshot.connection.ageSeconds} seconds.`,
      occurredAt
    }));
  }

  if (snapshot.safety.locked === false) {
    events.push(event({
      id: "vehicle-unlocked",
      severity: "warning",
      title: "Vehicle unlocked",
      message: "The live telemetry feed reports the vehicle is unlocked.",
      occurredAt
    }));
  }

  if (snapshot.safety.doorsOpen === true) {
    events.push(event({
      id: "doors-open",
      severity: "critical",
      title: "Door open",
      message: "The live telemetry feed reports at least one door is open.",
      occurredAt
    }));
  }

  if (snapshot.safety.windowsOpen === true) {
    events.push(event({
      id: "windows-open",
      severity: "warning",
      title: "Window open",
      message: "The live telemetry feed reports at least one window is open.",
      occurredAt
    }));
  }

  if (snapshot.safety.frunkOpen === true) {
    events.push(event({
      id: "frunk-open",
      severity: "critical",
      title: "Front trunk open",
      message: "The live telemetry feed reports the front trunk is open.",
      occurredAt
    }));
  }

  if (snapshot.safety.trunkOpen === true) {
    events.push(event({
      id: "trunk-open",
      severity: "critical",
      title: "Trunk open",
      message: "The live telemetry feed reports the trunk is open.",
      occurredAt
    }));
  }

  if (snapshot.drive.shiftState === "P" && snapshot.drive.speedKmh !== null && snapshot.drive.speedKmh > 3) {
    events.push(event({
      id: "parked-movement",
      severity: "critical",
      title: "Parked movement",
      message: "The live telemetry feed reports movement while the vehicle is in Park.",
      occurredAt
    }));
  }

  if (snapshot.tires.softWarning) {
    events.push(event({
      id: "tire-pressure-warning",
      severity: "warning",
      title: "Tyre pressure warning",
      message: "The live telemetry feed reports a tyre pressure warning.",
      occurredAt
    }));
  }

  return events;
}

module.exports = {
  buildRealtimeEvents
};
