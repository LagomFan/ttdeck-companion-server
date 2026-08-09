const vehicles = [
  {
    id: "demo-ev-home",
    displayName: "Demo EV",
    vinSuffix: "8Y42",
    state: "asleep",
    lastUpdatedAt: "2026-06-25T04:20:00.000Z",
    details: {
      model: "EV",
      trimBadging: "Long Range",
      exteriorColor: "Pearl White",
      wheelType: "Aero20",
      softwareVersion: "2026.20.1",
      updateAvailable: false,
      updateVersion: null,
      odometerKm: 18432.6
    },
    location: {
      label: "Home",
      latitude: 37.3947,
      longitude: -122.1503
    },
    battery: {
      percent: 78,
      usablePercent: 75,
      estimatedKm: 382,
      ratedKm: 401,
      idealKm: 395
    },
    charging: {
      pluggedIn: false,
      state: "Disconnected",
      powerKw: 0,
      chargeLimitPercent: 80,
      minutesToFull: null,
      chargerVoltage: null,
      chargerActualCurrent: null,
      chargerPhases: null,
      chargeEnergyAddedKwh: 24.6,
      chargePortDoorOpen: false,
      chargeCurrentRequest: null,
      chargeCurrentRequestMax: null,
      recentSessions: [
        {
          id: "my-home-2026-06-24",
          startedAt: "2026-06-24T21:10:00.000Z",
          endedAt: "2026-06-24T23:40:00.000Z",
          location: "Home",
          energyAddedKwh: 24.6,
          rangeAddedKm: 148,
          costEstimate: 4.68
        },
        {
          id: "my-fast-charger-2026-06-22",
          startedAt: "2026-06-22T12:25:00.000Z",
          endedAt: "2026-06-22T13:05:00.000Z",
          location: "Cupertino Fast Charger",
          energyAddedKwh: 31.2,
          rangeAddedKm: 188,
          costEstimate: 12.8
        }
      ]
    },
    safety: {
      locked: true,
      doorsClosed: true,
      windowsClosed: true,
      frunkClosed: true,
      trunkClosed: true,
      sentryMode: false,
      tirePressureOk: true,
      tirePressure: {
        unit: "bar",
        frontLeftBar: 2.8,
        frontRightBar: 2.8,
        rearLeftBar: 2.9,
        rearRightBar: 2.9,
        softWarningFrontLeft: false,
        softWarningFrontRight: false,
        softWarningRearLeft: false,
        softWarningRearRight: false,
        measuredAt: "2026-06-25T04:19:00.000Z",
        severity: "normal"
      }
    },
    climate: {
      insideTempC: 21.5,
      outsideTempC: 18,
      isClimateOn: false,
      isPreconditioning: false
    },
    navigation: {
      destination: null,
      energyAtArrivalPercent: null,
      distanceToArrivalKm: null,
      minutesToArrival: null,
      trafficDelayMinutes: null
    },
    trips: [
      {
        id: "my-trip-2026-06-24-commute",
        startedAt: "2026-06-24T15:20:00.000Z",
        endedAt: "2026-06-24T15:58:00.000Z",
        title: "Office to Home",
        distanceKm: 34.2,
        energyKwh: 5.8,
        efficiencyWhPerKm: 170
      },
      {
        id: "my-trip-2026-06-23-school",
        startedAt: "2026-06-23T07:40:00.000Z",
        endedAt: "2026-06-23T08:05:00.000Z",
        title: "School Drop-off",
        distanceKm: 12.6,
        energyKwh: 2.1,
        efficiencyWhPerKm: 167
      }
    ],
    trends: {
      weeklyDistanceKm: 216,
      weeklyEnergyKwh: 38.4,
      parkingDrainPercent: 3,
      estimatedRangeHealthPercent: 94,
      series: [
        {
          id: "parkingDrain",
          label: "Parking drain",
          unit: "%",
          points: [
            { date: "2026-06-19", value: 1 },
            { date: "2026-06-22", value: 1 },
            { date: "2026-06-24", value: 1 }
          ]
        },
        {
          id: "temperatureInside",
          label: "Inside temperature",
          unit: "C",
          points: [
            { date: "2026-06-24T08:00:00.000Z", value: 24.2 },
            { date: "2026-06-24T12:00:00.000Z", value: 28.6 },
            { date: "2026-06-24T16:00:00.000Z", value: 21.5 }
          ]
        },
        {
          id: "temperatureOutside",
          label: "Outside temperature",
          unit: "C",
          points: [
            { date: "2026-06-24T08:00:00.000Z", value: 20.5 },
            { date: "2026-06-24T12:00:00.000Z", value: 24.8 },
            { date: "2026-06-24T16:00:00.000Z", value: 18.0 }
          ]
        }
      ]
    }
  },
  {
    id: "demo-ev-work",
    displayName: "Demo Commuter",
    vinSuffix: "3W91",
    state: "online",
    lastUpdatedAt: "2026-06-25T04:28:00.000Z",
    details: {
      model: "EV",
      trimBadging: "Touring",
      exteriorColor: "Deep Blue Metallic",
      wheelType: "Sport20",
      softwareVersion: "2026.20.1",
      updateAvailable: true,
      updateVersion: "2026.20.5",
      odometerKm: 9231.2
    },
    location: {
      label: "Work",
      latitude: 37.3318,
      longitude: -122.0312
    },
    battery: {
      percent: 52,
      usablePercent: 50,
      estimatedKm: 251,
      ratedKm: 269,
      idealKm: 263
    },
    charging: {
      pluggedIn: true,
      state: "Charging",
      powerKw: 6.8,
      chargeLimitPercent: 80,
      minutesToFull: 145,
      chargerVoltage: 231,
      chargerActualCurrent: 32,
      chargerPhases: 1,
      chargeEnergyAddedKwh: 9.4,
      chargePortDoorOpen: true,
      chargeCurrentRequest: 32,
      chargeCurrentRequestMax: 32,
      recentSessions: [
        {
          id: "m3-work-2026-06-25",
          startedAt: "2026-06-25T03:10:00.000Z",
          endedAt: null,
          location: "Work",
          energyAddedKwh: 9.4,
          rangeAddedKm: 57,
          costEstimate: 0
        }
      ]
    },
    safety: {
      locked: false,
      doorsClosed: true,
      windowsClosed: true,
      frunkClosed: true,
      trunkClosed: true,
      sentryMode: true,
      tirePressureOk: true,
      tirePressure: {
        unit: "bar",
        frontLeftBar: 2.7,
        frontRightBar: 2.7,
        rearLeftBar: 2.8,
        rearRightBar: 2.8,
        softWarningFrontLeft: false,
        softWarningFrontRight: false,
        softWarningRearLeft: false,
        softWarningRearRight: false,
        measuredAt: "2026-06-25T04:27:00.000Z",
        severity: "normal"
      }
    },
    climate: {
      insideTempC: 23,
      outsideTempC: 20,
      isClimateOn: false,
      isPreconditioning: false
    },
    navigation: {
      destination: "Home",
      energyAtArrivalPercent: 44,
      distanceToArrivalKm: 18.1,
      minutesToArrival: 28,
      trafficDelayMinutes: 3
    },
    trips: [
      {
        id: "m3-trip-2026-06-24-errand",
        startedAt: "2026-06-24T18:05:00.000Z",
        endedAt: "2026-06-24T18:32:00.000Z",
        title: "Work to Market",
        distanceKm: 18.4,
        energyKwh: 3.1,
        efficiencyWhPerKm: 168
      }
    ],
    trends: {
      weeklyDistanceKm: 144,
      weeklyEnergyKwh: 24.1,
      parkingDrainPercent: 2,
      estimatedRangeHealthPercent: 97,
      series: [
        {
          id: "parkingDrain",
          label: "Parking drain",
          unit: "%",
          points: [
            { date: "2026-06-20", value: 1 },
            { date: "2026-06-23", value: 1 }
          ]
        },
        {
          id: "temperatureInside",
          label: "Inside temperature",
          unit: "C",
          points: [
            { date: "2026-06-24T08:00:00.000Z", value: 23.4 },
            { date: "2026-06-24T12:00:00.000Z", value: 26.2 },
            { date: "2026-06-24T18:00:00.000Z", value: 23.0 }
          ]
        },
        {
          id: "temperatureOutside",
          label: "Outside temperature",
          unit: "C",
          points: [
            { date: "2026-06-24T08:00:00.000Z", value: 19.5 },
            { date: "2026-06-24T12:00:00.000Z", value: 22.4 },
            { date: "2026-06-24T18:00:00.000Z", value: 20.0 }
          ]
        }
      ]
    }
  }
];

function cloneFixture(value) {
  return structuredClone(value);
}

function createFixtureDataSource() {
  return {
    async listVehicles() {
      return vehicles.map(({ id, displayName, vinSuffix, state, lastUpdatedAt, details }) => ({
        id,
        displayName,
        vinSuffix,
        state,
        lastUpdatedAt,
        model: details?.model ?? null,
        trimBadging: details?.trimBadging ?? null,
        softwareVersion: details?.softwareVersion ?? null,
        odometerKm: details?.odometerKm ?? null
      }));
    },

    async getVehicle(vehicleId) {
      const vehicle = vehicles.find((candidate) => candidate.id === vehicleId);
      return vehicle ? cloneFixture(vehicle) : null;
    },

    async getDiagnostics() {
      return [
        { id: "companion", label: "Companion Server", status: "ok", message: "Server is running." },
        { id: "dataSource", label: "Data Source", status: "ok", message: "Fixture data source is active." },
        { id: "teslamate", label: "Self-Hosted Data Source", status: "skipped", message: "Self-hosted vehicle data source check is not active in fixture mode." },
        { id: "postgres", label: "Source Database", status: "skipped", message: "Source database check is not active in fixture mode." },
        { id: "vehicles", label: "Vehicle Data", status: "ok", message: "Fixture vehicles are available." }
      ];
    }
  };
}

module.exports = {
  createFixtureDataSource
};
