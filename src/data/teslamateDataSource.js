const { Pool } = require("pg");

const VEHICLES_SQL = `
  SELECT
    c.id,
    COALESCE(NULLIF(c.name, ''), NULLIF(c.model, ''), 'Vehicle') AS display_name,
    c.vin,
    COALESCE(s.state::text, 'unknown') AS state,
    COALESCE(p.date, s.start_date, c.updated_at, c.inserted_at) AS last_updated_at
  FROM cars c
  LEFT JOIN LATERAL (
    SELECT date
    FROM positions
    WHERE car_id = c.id
    ORDER BY date DESC
    LIMIT 1
  ) p ON TRUE
  LEFT JOIN LATERAL (
    SELECT state, start_date
    FROM states
    WHERE car_id = c.id
    ORDER BY start_date DESC
    LIMIT 1
  ) s ON TRUE
  ORDER BY c.id ASC
`;

const VEHICLE_SQL = `
  SELECT
    c.id,
    COALESCE(NULLIF(c.name, ''), NULLIF(c.model, ''), 'Vehicle') AS display_name,
    c.vin,
    c.model,
    c.trim_badging,
    c.exterior_color,
    c.wheel_type,
    c.efficiency,
    COALESCE(s.state::text, 'unknown') AS state,
    COALESCE(p.date, s.start_date, c.updated_at, c.inserted_at) AS last_updated_at,
    p.date AS position_date,
    p.latitude,
    p.longitude,
    p.battery_level,
    p.usable_battery_level,
    p.odometer,
    p.est_battery_range_km,
    p.ideal_battery_range_km,
    p.rated_battery_range_km,
    p.inside_temp,
    p.outside_temp,
    p.driver_temp_setting,
    p.passenger_temp_setting,
    p.is_climate_on,
    p.tpms_pressure_fl,
    p.tpms_pressure_fr,
    p.tpms_pressure_rl,
    p.tpms_pressure_rr
  FROM cars c
  LEFT JOIN LATERAL (
    SELECT
      date,
      latitude,
      longitude,
      battery_level,
      usable_battery_level,
      odometer,
      est_battery_range_km,
      ideal_battery_range_km,
      rated_battery_range_km,
      inside_temp,
      outside_temp,
      driver_temp_setting,
      passenger_temp_setting,
      is_climate_on,
      tpms_pressure_fl,
      tpms_pressure_fr,
      tpms_pressure_rl,
      tpms_pressure_rr
    FROM positions
    WHERE car_id = c.id
    ORDER BY date DESC
    LIMIT 1
  ) p ON TRUE
  LEFT JOIN LATERAL (
    SELECT state, start_date
    FROM states
    WHERE car_id = c.id
    ORDER BY start_date DESC
    LIMIT 1
  ) s ON TRUE
  WHERE c.id = $1
`;

const DEFAULT_TRIP_LIMIT = 30;
const MAX_TRIP_LIMIT = 100;

const ACTIVE_DRIVE_SQL = `
  SELECT id, start_date, end_date, distance
  FROM drives
  WHERE car_id = $1 AND end_date IS NULL
  ORDER BY start_date DESC
  LIMIT 1
`;

const LATEST_ENDED_DRIVE_SQL = `
  SELECT id, start_date, end_date, distance
  FROM drives
  WHERE car_id = $1 AND end_date IS NOT NULL
  ORDER BY end_date DESC
  LIMIT 1
`;

const TRIPS_PAGE_SQL = `
  SELECT
    d.id,
    d.start_date,
    d.end_date,
    d.distance,
    COALESCE(d.distance * c.efficiency / 1000, 0) AS energy_kwh,
    c.efficiency,
    0 AS sampled_energy_kwh,
    d.speed_max,
    d.power_max,
    d.power_min,
    COALESCE(
      NULLIF(sg.name, ''),
      NULLIF(sa.display_name, ''),
      NULLIF(sa.name, ''),
      NULLIF(sa.road, ''),
      NULLIF(sa.neighbourhood, ''),
      NULLIF(sa.city, '')
    ) AS start_address,
    COALESCE(
      NULLIF(eg.name, ''),
      NULLIF(ea.display_name, ''),
      NULLIF(ea.name, ''),
      NULLIF(ea.road, ''),
      NULLIF(ea.neighbourhood, ''),
      NULLIF(ea.city, '')
    ) AS end_address,
    COALESCE(sg.latitude, sa.latitude, sp_exact.latitude, sp_drive.latitude) AS start_latitude,
    COALESCE(sg.longitude, sa.longitude, sp_exact.longitude, sp_drive.longitude) AS start_longitude,
    COALESCE(eg.latitude, ea.latitude, ep_exact.latitude, ep_drive.latitude) AS end_latitude,
    COALESCE(eg.longitude, ea.longitude, ep_exact.longitude, ep_drive.longitude) AS end_longitude
  FROM drives d
  INNER JOIN cars c ON c.id = d.car_id
  LEFT JOIN positions sp_exact ON sp_exact.id = d.start_position_id
  LEFT JOIN positions ep_exact ON ep_exact.id = d.end_position_id
  LEFT JOIN addresses sa ON sa.id = d.start_address_id
  LEFT JOIN addresses ea ON ea.id = d.end_address_id
  LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
  LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
  LEFT JOIN LATERAL (
    SELECT p.latitude, p.longitude
    FROM positions p
    WHERE p.drive_id = d.id
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
    ORDER BY p.date ASC
    LIMIT 1
  ) sp_drive ON TRUE
  LEFT JOIN LATERAL (
    SELECT p.latitude, p.longitude
    FROM positions p
    WHERE p.drive_id = d.id
      AND p.latitude IS NOT NULL
      AND p.longitude IS NOT NULL
    ORDER BY p.date DESC
    LIMIT 1
  ) ep_drive ON TRUE
  WHERE d.car_id = $1 AND d.end_date IS NOT NULL
  ORDER BY d.end_date DESC
  LIMIT $2 OFFSET $3
`;

const TRIPS_COUNT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM drives
  WHERE car_id = $1 AND end_date IS NOT NULL
`;

const TRIP_DETAIL_SQL = `
  SELECT
    d.id,
    d.start_date,
    d.end_date,
    d.distance,
    COALESCE(d.distance * c.efficiency / 1000, 0) AS energy_kwh,
    c.efficiency,
    COALESCE(e.sampled_energy_kwh, 0) AS sampled_energy_kwh,
    d.speed_max,
    d.power_max,
    d.power_min,
    COALESCE(
      NULLIF(sg.name, ''),
      NULLIF(sa.display_name, ''),
      NULLIF(sa.name, ''),
      NULLIF(sa.road, ''),
      NULLIF(sa.neighbourhood, ''),
      NULLIF(sa.city, '')
    ) AS start_address,
    COALESCE(
      NULLIF(eg.name, ''),
      NULLIF(ea.display_name, ''),
      NULLIF(ea.name, ''),
      NULLIF(ea.road, ''),
      NULLIF(ea.neighbourhood, ''),
      NULLIF(ea.city, '')
    ) AS end_address,
    COALESCE(sg.latitude, sa.latitude, sp_exact.latitude, sp.latitude) AS start_latitude,
    COALESCE(sg.longitude, sa.longitude, sp_exact.longitude, sp.longitude) AS start_longitude,
    COALESCE(eg.latitude, ea.latitude, ep_exact.latitude, ep.latitude) AS end_latitude,
    COALESCE(eg.longitude, ea.longitude, ep_exact.longitude, ep.longitude) AS end_longitude
  FROM drives d
  INNER JOIN cars c ON c.id = d.car_id
  LEFT JOIN positions sp_exact ON sp_exact.id = d.start_position_id
  LEFT JOIN positions ep_exact ON ep_exact.id = d.end_position_id
  LEFT JOIN addresses sa ON sa.id = d.start_address_id
  LEFT JOIN addresses ea ON ea.id = d.end_address_id
  LEFT JOIN geofences sg ON sg.id = d.start_geofence_id
  LEFT JOIN geofences eg ON eg.id = d.end_geofence_id
  LEFT JOIN LATERAL (
    SELECT latitude, longitude
    FROM positions
    WHERE car_id = d.car_id AND date <= d.start_date
    ORDER BY date DESC
    LIMIT 1
  ) sp ON TRUE
  LEFT JOIN LATERAL (
    SELECT latitude, longitude
    FROM positions
    WHERE car_id = d.car_id AND date <= d.end_date
    ORDER BY date DESC
    LIMIT 1
  ) ep ON TRUE
  LEFT JOIN LATERAL (
    SELECT GREATEST(
      COALESCE(
        SUM(((COALESCE(prev_power, power) + power) / 2.0) * EXTRACT(EPOCH FROM (date - prev_date)) / 3600.0),
        0
      ),
      0
    ) AS sampled_energy_kwh
    FROM (
      SELECT
        date,
        power::float AS power,
        LAG(date) OVER (ORDER BY date) AS prev_date,
        LAG(power::float) OVER (ORDER BY date) AS prev_power
      FROM positions
      WHERE drive_id = d.id
        AND power IS NOT NULL
      ORDER BY date ASC
    ) samples
    WHERE prev_date IS NOT NULL
      AND date > prev_date
      AND date <= prev_date + INTERVAL '1 hour'
  ) e ON TRUE
  WHERE d.car_id = $1 AND d.id = $2 AND d.end_date IS NOT NULL
`;

const RECENT_CHARGES_SQL = `
  SELECT
    cp.id,
    cp.start_date,
    cp.end_date,
    cp.charge_energy_added,
    cp.start_ideal_range_km,
    cp.end_ideal_range_km,
    cp.cost,
    p.latitude AS start_latitude,
    p.longitude AS start_longitude
  FROM charging_processes cp
  LEFT JOIN positions p ON p.id = cp.position_id
  WHERE cp.car_id = $1
  ORDER BY cp.start_date DESC
`;

const WEEKLY_SUMMARY_SQL = `
  WITH weekly_drives AS (
    SELECT
      COALESCE(SUM(d.distance), 0) AS distance_km,
      COALESCE(SUM(d.distance * c.efficiency / 1000), 0) AS energy_kwh
    FROM drives d
    INNER JOIN cars c ON c.id = d.car_id
    WHERE d.car_id = $1
      AND d.end_date IS NOT NULL
      AND d.end_date >= NOW() - INTERVAL '7 days'
  ),
  weekly_charges AS (
    SELECT
      COALESCE(SUM(cp.charge_energy_added), 0) AS charging_energy_kwh
    FROM charging_processes cp
    WHERE cp.car_id = $1
      AND cp.start_date >= NOW() - INTERVAL '7 days'
  )
  SELECT
    weekly_drives.distance_km,
    weekly_drives.energy_kwh,
    weekly_charges.charging_energy_kwh
  FROM weekly_drives
  CROSS JOIN weekly_charges
`;

const TRIP_POINTS_FOR_DRIVE_SQL = `
  WITH ranked AS (
    SELECT
      p.date,
      p.latitude,
      p.longitude,
      p.speed,
      p.power,
      p.battery_heater,
      p.battery_level,
      p.usable_battery_level,
      p.est_battery_range_km,
      p.ideal_battery_range_km,
      p.rated_battery_range_km,
      p.inside_temp,
      p.outside_temp,
      p.tpms_pressure_fl,
      p.tpms_pressure_fr,
      p.tpms_pressure_rl,
      p.tpms_pressure_rr,
      COUNT(inside_temp) OVER (ORDER BY date ASC) AS inside_temp_group,
      COUNT(outside_temp) OVER (ORDER BY date ASC) AS outside_temp_group,
      ROW_NUMBER() OVER (ORDER BY p.date ASC) AS row_index,
      COUNT(*) OVER () AS total_count
    FROM positions p
    WHERE drive_id = $1
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
  ), filled AS (
    SELECT
      date,
      latitude,
      longitude,
      speed,
      power,
      battery_heater,
      battery_level,
      usable_battery_level,
      est_battery_range_km,
      ideal_battery_range_km,
      rated_battery_range_km,
      MAX(inside_temp) OVER (PARTITION BY inside_temp_group) AS inside_temp,
      MAX(outside_temp) OVER (PARTITION BY outside_temp_group) AS outside_temp,
      tpms_pressure_fl,
      tpms_pressure_fr,
      tpms_pressure_rl,
      tpms_pressure_rr,
      row_index,
      total_count
    FROM ranked
  ), sampled AS (
    SELECT *
    FROM filled
    WHERE total_count <= 600
      OR row_index = 1
      OR row_index = total_count
      OR ((row_index - 1) % GREATEST(CEIL(total_count / 600.0)::int, 1)) = 0
    ORDER BY date ASC
    LIMIT 600
  )
  SELECT
    date,
    latitude,
    longitude,
    speed,
    power,
    battery_heater,
    battery_level,
    usable_battery_level,
    est_battery_range_km,
    ideal_battery_range_km,
    rated_battery_range_km,
    inside_temp,
    outside_temp,
    tpms_pressure_fl,
    tpms_pressure_fr,
    tpms_pressure_rl,
    tpms_pressure_rr
  FROM sampled
  ORDER BY date ASC
`;

const LATEST_CHARGE_SAMPLE_SQL = `
  SELECT
    charger_power,
    charger_voltage,
    charger_actual_current,
    charger_phases,
    charge_limit_soc,
    minutes_to_full_charge
  FROM charges
  WHERE car_id = $1
  ORDER BY date DESC
  LIMIT 1
`;

const DAILY_TRENDS_SQL = `
  SELECT
    date_trunc('day', d.end_date)::date AS day,
    COALESCE(SUM(d.distance), 0) AS distance_km,
    CASE
      WHEN SUM(d.distance) > 0 THEN SUM(d.distance * c.efficiency) / SUM(d.distance)
      ELSE c.efficiency
    END AS efficiency_wh_per_km
  FROM drives d
  INNER JOIN cars c ON c.id = d.car_id
  WHERE d.car_id = $1
    AND d.end_date IS NOT NULL
    AND d.end_date >= NOW() - INTERVAL '30 days'
  GROUP BY day, c.efficiency
  ORDER BY day ASC
`;

const TEMPERATURE_TRENDS_SQL = `
  WITH samples AS (
    SELECT
      CASE
        WHEN date >= NOW() - INTERVAL '30 days' THEN date_trunc('hour', date)
        ELSE date_trunc('day', date)
      END AS bucket,
      inside_temp,
      outside_temp
    FROM positions
    WHERE car_id = $1
      AND (inside_temp IS NOT NULL OR outside_temp IS NOT NULL)
  )
  SELECT
    bucket AS day,
    ROUND(AVG(inside_temp)::numeric, 1) AS inside_temp,
    ROUND(AVG(outside_temp)::numeric, 1) AS outside_temp
  FROM samples
  GROUP BY bucket
  ORDER BY bucket ASC
`;

const GEOFENCES_SQL = `
  SELECT id, name, latitude, longitude, 100 AS radius
  FROM geofences
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
`;

const PARKING_DRAIN_SQL = `
  WITH parked_intervals AS (
    SELECT s.start_date, s.end_date
    FROM states s
    WHERE s.car_id = $1
      AND s.end_date IS NOT NULL
      AND s.start_date >= NOW() - INTERVAL '7 days'
      AND s.state::text IN ('asleep', 'online', 'offline')
      AND NOT EXISTS (
        SELECT 1
        FROM charging_processes cp
        WHERE cp.car_id = s.car_id
          AND cp.start_date <= s.end_date
          AND COALESCE(cp.end_date, NOW()) >= s.start_date
      )
  ),
  samples AS (
    SELECT
      pi.start_date,
      pi.end_date,
      start_sample.battery_level AS start_battery_level,
      end_sample.battery_level AS end_battery_level
    FROM parked_intervals pi
    LEFT JOIN LATERAL (
      SELECT battery_level
      FROM positions
      WHERE car_id = $1
        AND date <= pi.start_date
        AND battery_level IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    ) start_sample ON TRUE
    LEFT JOIN LATERAL (
      SELECT battery_level
      FROM positions
      WHERE car_id = $1
        AND date <= pi.end_date
        AND battery_level IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    ) end_sample ON TRUE
  )
  SELECT
    COALESCE(SUM(GREATEST(start_battery_level - end_battery_level, 0)), 0) AS parking_drain_percent,
    COUNT(*) FILTER (
      WHERE start_battery_level IS NOT NULL
        AND end_battery_level IS NOT NULL
    )::int AS interval_count,
    COALESCE(MAX(GREATEST(start_battery_level - end_battery_level, 0)), 0) AS largest_drain_percent
  FROM samples
`;

const PARKING_DRAIN_TRENDS_SQL = `
  WITH parked_intervals AS (
    SELECT
      s.start_date,
      s.end_date
    FROM states s
    WHERE s.car_id = $1
      AND s.end_date IS NOT NULL
      AND s.end_date >= NOW() - INTERVAL '30 days'
      AND s.state::text IN ('asleep', 'online', 'offline')
      AND NOT EXISTS (
        SELECT 1
        FROM charging_processes cp
        WHERE cp.car_id = s.car_id
          AND cp.start_date <= s.end_date
          AND COALESCE(cp.end_date, NOW()) >= s.start_date
      )
  ),
  samples AS (
    SELECT
      pi.start_date,
      pi.end_date,
      start_sample.battery_level AS start_battery_level,
      end_sample.battery_level AS end_battery_level
    FROM parked_intervals pi
    LEFT JOIN LATERAL (
      SELECT battery_level
      FROM positions
      WHERE car_id = $1
        AND date <= pi.start_date
        AND battery_level IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    ) start_sample ON TRUE
    LEFT JOIN LATERAL (
      SELECT battery_level
      FROM positions
      WHERE car_id = $1
        AND date <= pi.end_date
        AND battery_level IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    ) end_sample ON TRUE
  )
  SELECT
    start_date,
    end_date AS day,
    GREATEST(start_battery_level - end_battery_level, 0) AS parking_drain_percent
  FROM samples
  WHERE start_battery_level IS NOT NULL
    AND end_battery_level IS NOT NULL
  ORDER BY end_date ASC
`;

const SCHEMA_SUPPORT_SQL = `
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'cars' AND column_name IN ('model', 'trim_badging', 'exterior_color', 'wheel_type', 'efficiency'))
      OR (table_name = 'positions' AND column_name IN ('latitude', 'longitude', 'battery_level', 'odometer', 'inside_temp', 'outside_temp', 'tpms_pressure_fl', 'tpms_pressure_fr', 'tpms_pressure_rl', 'tpms_pressure_rr'))
      OR (table_name = 'charging_processes' AND column_name IN ('charge_energy_added', 'start_ideal_range_km', 'end_ideal_range_km', 'cost'))
      OR (table_name = 'charges' AND column_name IN ('charger_power', 'charger_voltage', 'charger_actual_current', 'charger_phases', 'charge_limit_soc', 'minutes_to_full_charge'))
      OR (table_name = 'geofences' AND column_name IN ('name', 'latitude', 'longitude', 'radius'))
      OR (table_name = 'states' AND column_name IN ('state', 'start_date', 'end_date'))
    )
`;

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInt(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function toOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toOptionalInt(value) {
  const number = toOptionalNumber(value);
  return number === null ? null : Math.round(number);
}

function parseBoundedInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function tripPageOptions(options = {}) {
  return {
    limit: parseBoundedInteger(options.limit, DEFAULT_TRIP_LIMIT, { min: 1, max: MAX_TRIP_LIMIT }),
    offset: parseBoundedInteger(options.cursor, 0, { min: 0 })
  };
}

function parseTripId(tripId) {
  const match = /^drive-(\d+)$/.exec(String(tripId || ""));
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, toInt(value, 0)));
}

function vinSuffix(vin, id) {
  const normalized = String(vin || "").trim();
  return normalized ? normalized.slice(-4) : `#${id}`;
}

function vehicleSummaryFromRow(row) {
  return {
    id: String(row.id),
    displayName: row.display_name || "Vehicle",
    vinSuffix: vinSuffix(row.vin, row.id),
    state: row.state || "unknown",
    lastUpdatedAt: toIso(row.last_updated_at)
  };
}

function rangeHealthPercent(estimatedKm, ratedKm) {
  if (estimatedKm <= 0 || ratedKm <= 0) {
    return 0;
  }

  return clampPercent((estimatedKm / ratedKm) * 100);
}

function hasCoordinate(latitude, longitude) {
  return latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined;
}

function coordinateLabel(latitude, longitude) {
  if (!hasCoordinate(latitude, longitude)) {
    return "Unknown";
  }
  return `${toNumber(latitude).toFixed(5)}, ${toNumber(longitude).toFixed(5)}`;
}

function mapTripLocation(label, latitude, longitude) {
  if (!hasCoordinate(latitude, longitude)) {
    return null;
  }

  return {
    label: label || coordinateLabel(latitude, longitude),
    latitude: toNumber(latitude),
    longitude: toNumber(longitude)
  };
}

function isCoordinateLabel(label) {
  return /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(String(label || "").trim());
}

function placeKey(label, latitude, longitude) {
  if (hasCoordinate(latitude, longitude)) {
    return `coord:${toNumber(latitude).toFixed(4)},${toNumber(longitude).toFixed(4)}`;
  }
  const normalized = String(label || "").trim().toLowerCase();
  return normalized ? `label:${normalized}` : null;
}

function addPlace(places, { label, latitude, longitude }) {
  const key = placeKey(label, latitude, longitude);
  if (!key) return;

  const normalizedLabel = String(label || "").trim();
  const existing = places.get(key);
  if (existing) {
    existing.visits += 1;
    if (isCoordinateLabel(existing.label) && normalizedLabel && !isCoordinateLabel(normalizedLabel)) {
      existing.label = normalizedLabel;
    }
    return;
  }

  places.set(key, {
    id: key.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase(),
    label: normalizedLabel || coordinateLabel(latitude, longitude),
    visits: 1,
    latitude: hasCoordinate(latitude, longitude) ? toNumber(latitude) : null,
    longitude: hasCoordinate(latitude, longitude) ? toNumber(longitude) : null
  });
}

function buildFrequentPlaces(trips = [], charges = []) {
  const places = new Map();
  for (const trip of trips) {
    addPlace(places, trip.startLocation || {});
    addPlace(places, trip.endLocation || {});
  }
  for (const charge of charges) {
    addPlace(places, {
      label: charge.location,
      latitude: charge.latitude,
      longitude: charge.longitude
    });
  }

  return [...places.values()]
    .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function mapTirePressure(row) {
  const frontLeftBar = toOptionalNumber(row.tpms_pressure_fl);
  const frontRightBar = toOptionalNumber(row.tpms_pressure_fr);
  const rearLeftBar = toOptionalNumber(row.tpms_pressure_rl);
  const rearRightBar = toOptionalNumber(row.tpms_pressure_rr);
  const values = [frontLeftBar, frontRightBar, rearLeftBar, rearRightBar].filter((value) => value !== null);

  return {
    available: values.length > 0,
    unit: "bar",
    frontLeftBar,
    frontRightBar,
    rearLeftBar,
    rearRightBar,
    measuredAt: row.position_date || row.date ? toIso(row.position_date || row.date) : null,
    severity: values.length > 0 ? "normal" : "warning"
  };
}

function parkingDrainSeverity(percent) {
  if (percent >= 8) return "critical";
  if (percent >= 5) return "warning";
  return "normal";
}

function mapParkingDrain(row = {}) {
  const percent = clampPercent(row.parking_drain_percent);
  const intervalCount = toOptionalInt(row.interval_count) ?? 0;
  const largestDrainPercent = clampPercent(row.largest_drain_percent);

  return {
    available: intervalCount > 0,
    percent,
    intervalCount,
    largestDrainPercent,
    severity: parkingDrainSeverity(percent)
  };
}

function distanceMetersBetween(startLatitude, startLongitude, endLatitude, endLongitude) {
  const earthRadiusMeters = 6371000;
  const degreesToRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = degreesToRadians(toNumber(startLatitude));
  const lat2 = degreesToRadians(toNumber(endLatitude));
  const deltaLatitude = degreesToRadians(toNumber(endLatitude) - toNumber(startLatitude));
  const deltaLongitude = degreesToRadians(toNumber(endLongitude) - toNumber(startLongitude));
  const haversine = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function buildGeofenceForLocation(row, geofences = []) {
  if (!hasCoordinate(row.latitude, row.longitude)) {
    return {
      available: false,
      status: "unknown",
      label: "Unknown",
      severity: "warning"
    };
  }

  const candidates = geofences
    .filter((geofence) => hasCoordinate(geofence.latitude, geofence.longitude))
    .map((geofence) => {
      const radiusMeters = Math.max(toOptionalNumber(geofence.radius) ?? 100, 25);
      const distanceMeters = distanceMetersBetween(row.latitude, row.longitude, geofence.latitude, geofence.longitude);
      return {
        label: geofence.name || coordinateLabel(geofence.latitude, geofence.longitude),
        latitude: toNumber(geofence.latitude),
        longitude: toNumber(geofence.longitude),
        radiusMeters,
        distanceMeters
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (candidates.length === 0) {
    return {
      available: false,
      status: "not_configured",
      label: "No geofence",
      severity: "warning"
    };
  }

  const inside = candidates.find((candidate) => candidate.distanceMeters <= candidate.radiusMeters);
  if (inside) {
    return {
      available: true,
      status: "inside",
      label: inside.label,
      severity: "normal",
      distanceMeters: Math.round(inside.distanceMeters)
    };
  }

  return {
    available: true,
    status: "outside",
    label: candidates[0].label,
    severity: "warning",
    distanceMeters: Math.round(candidates[0].distanceMeters)
  };
}

const SLOW_TELEMETRY_FIELDS = [
  "battery_heater",
  "usable_battery_level",
  "est_battery_range_km",
  "ideal_battery_range_km",
  "rated_battery_range_km",
  "tpms_pressure_fl",
  "tpms_pressure_fr",
  "tpms_pressure_rl",
  "tpms_pressure_rr"
];

// Temperatures use sample-and-hold: carry observations forward, never into the past.
const FORWARD_ONLY_TELEMETRY_FIELDS = [
  "inside_temp",
  "outside_temp"
];

const FORWARD_FILL_TELEMETRY_FIELDS = [
  ...SLOW_TELEMETRY_FIELDS,
  ...FORWARD_ONLY_TELEMETRY_FIELDS
];

function fillTripTelemetryValues(rows) {
  const lastKnown = {};
  const forwardFilled = rows.map((row) => {
    const filled = { ...row };
    for (const field of FORWARD_FILL_TELEMETRY_FIELDS) {
      if (row[field] !== null && row[field] !== undefined) {
        lastKnown[field] = row[field];
      } else if (lastKnown[field] !== undefined) {
        filled[field] = lastKnown[field];
      }
    }
    return filled;
  });

  const nextKnown = {};
  for (let index = forwardFilled.length - 1; index >= 0; index -= 1) {
    const original = rows[index];
    const filled = forwardFilled[index];
    for (const field of SLOW_TELEMETRY_FIELDS) {
      if (original[field] !== null && original[field] !== undefined) {
        nextKnown[field] = original[field];
      } else if ((filled[field] === null || filled[field] === undefined) && nextKnown[field] !== undefined) {
        filled[field] = nextKnown[field];
      }
    }
  }

  return forwardFilled;
}

function energyFromTripPoints(tripPointRows) {
  let energyKwh = 0;
  for (let index = 1; index < tripPointRows.length; index += 1) {
    const previous = tripPointRows[index - 1];
    const current = tripPointRows[index];
    const previousPower = toOptionalNumber(previous.power);
    const currentPower = toOptionalNumber(current.power);
    if (previousPower === null || currentPower === null) continue;

    const previousDate = new Date(previous.date);
    const currentDate = new Date(current.date);
    const deltaHours = (currentDate.getTime() - previousDate.getTime()) / 3600000;
    if (!Number.isFinite(deltaHours) || deltaHours <= 0 || deltaHours > 1) continue;

    energyKwh += ((previousPower + currentPower) / 2) * deltaHours;
  }

  return Math.max(0, energyKwh);
}

function mapTrip(row, tripPointRows = []) {
  const filledTripPointRows = fillTripTelemetryValues(tripPointRows);
  const distanceKm = toNumber(row.distance);
  const sqlEnergyKwh = toNumber(row.energy_kwh);
  const sqlSampledEnergyKwh = toNumber(row.sampled_energy_kwh);
  const sampledEnergyKwh = sqlEnergyKwh > 0
    ? sqlEnergyKwh
    : (sqlSampledEnergyKwh > 0 ? sqlSampledEnergyKwh : energyFromTripPoints(tripPointRows));
  const sqlEfficiency = toOptionalNumber(row.efficiency);
  const efficiency = sqlEfficiency && sqlEfficiency > 0
    ? sqlEfficiency
    : (distanceKm > 0 ? (sampledEnergyKwh * 1000) / distanceKm : 0);
  const startedAt = toIso(row.start_date);
  const endedAt = toIso(row.end_date);
  const startedDate = new Date(row.start_date);
  const endedDate = new Date(row.end_date);
  const durationHours = Number.isFinite(endedDate.getTime() - startedDate.getTime())
    ? Math.max((endedDate.getTime() - startedDate.getTime()) / 3600000, 0)
    : 0;
  const speedValues = filledTripPointRows
    .map((point) => toOptionalNumber(point.speed))
    .filter((value) => value !== null);
  const powerValues = filledTripPointRows
    .map((point) => toOptionalNumber(point.power))
    .filter((value) => value !== null);
  const routePoints = filledTripPointRows
    .filter((point) => hasCoordinate(point.latitude, point.longitude))
    .map((point) => ({
      latitude: toNumber(point.latitude),
      longitude: toNumber(point.longitude)
    }));
  const telemetry = filledTripPointRows
    .filter((point) => toOptionalNumber(point.speed) !== null || toOptionalNumber(point.power) !== null)
    .map((point) => ({
      timestamp: toIso(point.date),
      offsetMinutes: Math.max(0, Math.round((new Date(point.date).getTime() - startedDate.getTime()) / 60000)),
      offsetSeconds: Math.max(0, Math.round((new Date(point.date).getTime() - startedDate.getTime()) / 1000)),
      latitude: hasCoordinate(point.latitude, point.longitude) ? toNumber(point.latitude) : null,
      longitude: hasCoordinate(point.latitude, point.longitude) ? toNumber(point.longitude) : null,
      speedKmh: Number(toNumber(point.speed).toFixed(1)),
      powerKw: Number(toNumber(point.power).toFixed(1)),
      batteryHeaterOn: point.battery_heater === null || point.battery_heater === undefined ? null : Boolean(point.battery_heater),
      socPercent: toOptionalInt(point.battery_level),
      usableSocPercent: toOptionalInt(point.usable_battery_level),
      estimatedRangeKm: toOptionalNumber(point.est_battery_range_km),
      idealRangeKm: toOptionalNumber(point.ideal_battery_range_km),
      ratedRangeKm: toOptionalNumber(point.rated_battery_range_km),
      insideTempC: toOptionalNumber(point.inside_temp),
      outsideTempC: toOptionalNumber(point.outside_temp),
      tirePressure: mapTirePressure(point)
    }));
  const startLocation = mapTripLocation(row.start_address, row.start_latitude, row.start_longitude);
  const endLocation = mapTripLocation(row.end_address, row.end_latitude, row.end_longitude);
  const title = [row.start_address, row.end_address].filter(Boolean).join(" to ") ||
    (startLocation && endLocation ? `${startLocation.label} to ${endLocation.label}` : "Drive");

  return {
    id: `drive-${row.id}`,
    startedAt,
    endedAt,
    title,
    distanceKm: Number(distanceKm.toFixed(1)),
    energyKwh: Number(sampledEnergyKwh.toFixed(1)),
    efficiencyWhPerKm: toInt(efficiency),
    startLocation,
    endLocation,
    routePoints,
    telemetry,
    averageSpeedKmh: durationHours > 0 ? Number((distanceKm / durationHours).toFixed(1)) : null,
    maxSpeedKmh: toOptionalNumber(row.speed_max) ?? (speedValues.length > 0 ? Number(Math.max(...speedValues).toFixed(1)) : null),
    maxPowerKw: toOptionalNumber(row.power_max) ?? (powerValues.length > 0 ? Number(Math.max(...powerValues).toFixed(1)) : null)
  };
}

function mapTripSummary(row) {
  const {
    routePoints,
    telemetry,
    ...summary
  } = mapTrip(row, []);
  return summary;
}

function mapNotificationDrive(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    startedAt: toIso(row.start_date),
    endedAt: toIso(row.end_date),
    distanceKm: Number(toNumber(row.distance).toFixed(1))
  };
}

function mapCharge(row) {
  const rangeAdded = toNumber(row.end_ideal_range_km) - toNumber(row.start_ideal_range_km);
  const startedAt = toIso(row.start_date);
  const endedAt = toIso(row.end_date);
  const startedDate = new Date(row.start_date);
  const endedDate = row.end_date ? new Date(row.end_date) : null;
  const durationHours = endedDate
    ? Math.max((endedDate.getTime() - startedDate.getTime()) / 3600000, 0)
    : 0;
  const energyAddedKwh = Number(toNumber(row.charge_energy_added).toFixed(1));
  const rangeAddedKm = Math.max(0, toInt(rangeAdded));

  return {
    id: `charge-${row.id}`,
    startedAt,
    endedAt,
    location: coordinateLabel(row.start_latitude, row.start_longitude) || "Charging session",
    latitude: hasCoordinate(row.start_latitude, row.start_longitude) ? toNumber(row.start_latitude) : null,
    longitude: hasCoordinate(row.start_latitude, row.start_longitude) ? toNumber(row.start_longitude) : null,
    energyAddedKwh,
    rangeAddedKm,
    costEstimate: Number(toNumber(row.cost).toFixed(2)),
    efficiencyWhPerKm: rangeAddedKm > 0 ? Math.round((energyAddedKwh * 1000) / rangeAddedKm) : null,
    averagePowerKw: durationHours > 0 ? Number((energyAddedKwh / durationHours).toFixed(1)) : null
  };
}

function isOpenChargeSession(charge) {
  return charge?.endedAt === null;
}

function isCompletedChargeSession(charge) {
  return charge?.endedAt !== null && toNumber(charge?.energyAddedKwh) > 0;
}

function mapTemperaturePoints(rows, key) {
  return rows
    .filter((row) => row.day && toOptionalNumber(row[key]) !== null)
    .map((row) => ({
      date: toIso(row.day),
      value: Number(toOptionalNumber(row[key]).toFixed(1))
    }));
}

function mapTrendSeries(rows, currentRangeHealthPercent, parkingDrainRows = [], temperatureRows = []) {
  const datedRows = rows.filter((row) => row.day);
  const mileagePoints = datedRows.map((row) => ({
    date: toIso(row.day).slice(0, 10),
    value: Number(toNumber(row.distance_km).toFixed(1))
  }));
  const efficiencyPoints = datedRows.map((row) => ({
    date: toIso(row.day).slice(0, 10),
    value: Number(toNumber(row.efficiency_wh_per_km).toFixed(0))
  }));
  const parkingDrainPoints = parkingDrainRows
    .filter((row) => row.day)
    .map((row) => ({
      date: toIso(row.day),
      value: Number(toNumber(row.parking_drain_percent).toFixed(1))
    }));
  const insideTemperaturePoints = mapTemperaturePoints(temperatureRows, "inside_temp");
  const outsideTemperaturePoints = mapTemperaturePoints(temperatureRows, "outside_temp");
  const lastDate = mileagePoints.at(-1)?.date || new Date().toISOString().slice(0, 10);

  return [
    {
      id: "mileage",
      label: "Mileage",
      unit: "km",
      points: mileagePoints
    },
    {
      id: "efficiency",
      label: "Efficiency",
      unit: "Wh/km",
      points: efficiencyPoints
    },
    {
      id: "parkingDrain",
      label: "Parking drain",
      unit: "%",
      points: parkingDrainPoints
    },
    {
      id: "temperatureInside",
      label: "Inside temperature",
      unit: "C",
      points: insideTemperaturePoints
    },
    {
      id: "temperatureOutside",
      label: "Outside temperature",
      unit: "C",
      points: outsideTemperaturePoints
    },
    {
      id: "rangeHealth",
      label: "Range health",
      unit: "%",
      points: [
        { date: lastDate, value: currentRangeHealthPercent }
      ]
    }
  ].filter((series) => series.points.length > 0);
}

function buildHealthEvents({ row, geofence, parkingDrain }) {
  const events = [
    {
      id: "postgres-snapshot",
      occurredAt: toIso(row.last_updated_at),
      severity: "normal",
      title: "Source Database snapshot",
      message: "Source database snapshot loaded successfully."
    }
  ];

  if (geofence?.available) {
    events.push({
      id: "geofence-snapshot",
      occurredAt: toIso(row.last_updated_at),
      severity: geofence.severity,
      title: "Geofence snapshot",
      message: geofence.status === "inside"
        ? `Vehicle is inside ${geofence.label}.`
        : `Vehicle is outside ${geofence.label}.`
    });
  }

  if (parkingDrain?.available) {
    events.push({
      id: "parking-drain",
      occurredAt: toIso(row.last_updated_at),
      severity: parkingDrain.severity,
      title: "Parking drain",
      message: `${parkingDrain.percent}% drain across ${parkingDrain.intervalCount} parked interval(s).`
    });
  }

  return events;
}

function mapVehicle(row, trips, charges, weeklySummary, latestChargeSample = null, dailyTrendRows = [], options = {}) {
  const estimatedKm = toInt(row.est_battery_range_km || row.ideal_battery_range_km || row.rated_battery_range_km);
  const ratedKm = toInt(row.rated_battery_range_km || row.ideal_battery_range_km || row.est_battery_range_km);
  const currentRangeHealthPercent = rangeHealthPercent(estimatedKm, ratedKm);
  const activeCharge = charges.find(isOpenChargeSession) || null;
  const completedCharges = charges.filter(isCompletedChargeSession);
  const latestCompletedCharge = completedCharges[0] || null;
  const hasOpenChargeSession = Boolean(activeCharge);
  const activeChargeEnergyAddedKwh = activeCharge && activeCharge.energyAddedKwh > 0
    ? activeCharge.energyAddedKwh
    : null;
  const insideTemp = toOptionalNumber(row.inside_temp);
  const outsideTemp = toOptionalNumber(row.outside_temp);
  const latestPowerKw = toOptionalNumber(latestChargeSample?.charger_power);
  const currentPowerKw = hasOpenChargeSession ? Number(toNumber(latestPowerKw, 0).toFixed(1)) : 0;
  const voltageV = toOptionalInt(latestChargeSample?.charger_voltage);
  const currentA = toOptionalNumber(latestChargeSample?.charger_actual_current);
  const phases = toOptionalInt(latestChargeSample?.charger_phases);
  const tirePressure = mapTirePressure(row);
  const parkingDrain = mapParkingDrain(options.parkingDrain || {});
  const parkingDrainTrendRows = options.parkingDrainTrendRows || [];
  const geofence = options.geofence || buildGeofenceForLocation(row, []);
  const locationLabel = geofence.available && geofence.status === "inside"
    ? geofence.label
    : (hasCoordinate(row.latitude, row.longitude) ? "Last known" : "Unknown");

  return {
    id: String(row.id),
    displayName: row.display_name || "Vehicle",
    vinSuffix: vinSuffix(row.vin, row.id),
    state: row.state || "unknown",
    lastUpdatedAt: toIso(row.last_updated_at),
    location: {
      label: locationLabel,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude)
    },
    details: {
      model: row.model ?? null,
      trimBadging: row.trim_badging ?? null,
      exteriorColor: row.exterior_color ?? null,
      wheelType: row.wheel_type ?? null,
      softwareVersion: null,
      updateAvailable: null,
      updateVersion: null,
      odometerKm: toOptionalNumber(row.odometer)
    },
    battery: {
      percent: clampPercent(row.battery_level),
      usablePercent: clampPercent(row.usable_battery_level || row.battery_level),
      estimatedKm,
      ratedKm
    },
    charging: {
      pluggedIn: hasOpenChargeSession,
      state: hasOpenChargeSession ? (currentPowerKw > 0 ? "Charging" : "Stopped") : "Unknown",
      powerKw: currentPowerKw,
      chargeLimitPercent: clampPercent(latestChargeSample?.charge_limit_soc || row.battery_level),
      minutesToFull: hasOpenChargeSession ? toOptionalInt(latestChargeSample?.minutes_to_full_charge) : null,
      chargerVoltage: voltageV,
      chargerActualCurrent: currentA,
      chargerPhases: phases,
      chargeEnergyAddedKwh: hasOpenChargeSession
        ? activeChargeEnergyAddedKwh
        : (latestCompletedCharge?.energyAddedKwh ?? null),
      chargePortDoorOpen: null,
      chargeCurrentRequest: null,
      chargeCurrentRequestMax: null,
      electrical: {
        available: voltageV !== null || currentA !== null || phases !== null,
        voltageV,
        currentA,
        phases
      },
      recentSessions: completedCharges
    },
    safety: {
      available: false,
      geofence,
      parkingDrainPercent: parkingDrain.percent,
      parkingDrain,
      tirePressureOk: tirePressure.available,
      tirePressure
    },
    climate: {
      insideTempC: insideTemp === null ? null : Number(insideTemp.toFixed(1)),
      outsideTempC: outsideTemp === null ? null : Number(outsideTemp.toFixed(1)),
      isClimateOn: Boolean(row.is_climate_on)
    },
    trips,
    frequentPlaces: buildFrequentPlaces(trips, completedCharges),
    trends: {
      weeklyDistanceKm: toInt(weeklySummary.distance_km),
      weeklyEnergyKwh: Number(toNumber(weeklySummary.energy_kwh).toFixed(1)),
      weeklyChargingEnergyKwh: Number(toNumber(weeklySummary.charging_energy_kwh).toFixed(1)),
      parkingDrainPercent: parkingDrain.percent,
      estimatedRangeHealthPercent: currentRangeHealthPercent,
      series: mapTrendSeries(dailyTrendRows, currentRangeHealthPercent, parkingDrainTrendRows, options.temperatureTrendRows || []),
      softwareUpdates: [],
      healthEvents: buildHealthEvents({ row, geofence, parkingDrain })
    }
  };
}

function schemaSupportFromRows(rows = []) {
  const columns = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const hasAll = (items) => items.every((item) => columns.has(item));

  return [
    {
      id: "schemaVehicleDetails",
      label: "Vehicle Details",
      status: hasAll(["cars.model", "cars.efficiency"]) ? "ok" : "limited",
      message: hasAll(["cars.model", "cars.efficiency"])
        ? "The source database includes vehicle model and efficiency fields."
        : "Vehicle model or efficiency columns were not detected."
    },
    {
      id: "schemaCharging",
      label: "Charging Data",
      status: hasAll(["charging_processes.charge_energy_added", "charges.charger_power"]) ? "ok" : "limited",
      message: hasAll(["charging_processes.charge_energy_added", "charges.charger_power"])
        ? "Charging sessions and latest charge samples can be read."
        : "Charging session or live charge sample columns were not detected."
    },
    {
      id: "schemaGeofences",
      label: "Geofences",
      status: hasAll(["geofences.name", "geofences.latitude", "geofences.longitude"]) ? "ok" : "limited",
      message: hasAll(["geofences.name", "geofences.latitude", "geofences.longitude"])
        ? "Source database geofences can be used for current location status."
        : "Geofence columns were not detected; current location can still use coordinates."
    },
    {
      id: "schemaParkingDrain",
      label: "Parking Drain",
      status: hasAll(["states.state", "states.start_date", "states.end_date", "positions.battery_level"]) ? "ok" : "limited",
      message: hasAll(["states.state", "states.start_date", "states.end_date", "positions.battery_level"])
        ? "Parked intervals and battery samples can be used for drain estimates."
        : "State intervals or battery samples were not detected."
    }
  ];
}

function buildPoolOptions(config) {
  const baseOptions = {
    connectionTimeoutMillis: config.queryTimeoutMs,
    statement_timeout: config.queryTimeoutMs
  };

  if (config.databaseUrl) {
    return {
      ...baseOptions,
      connectionString: config.databaseUrl
    };
  }

  return {
    ...baseOptions,
    ...config.database,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false
  };
}

class TeslaMateDataSource {
  constructor({ pool, queryTimeoutMs = 5000 }) {
    this.pool = pool;
    this.queryTimeoutMs = queryTimeoutMs;
  }

  async listVehicles() {
    const result = await this.pool.query(VEHICLES_SQL);
    return result.rows.map(vehicleSummaryFromRow);
  }

  async getVehicle(vehicleId) {
    return await this.getVehicleWithOptions(vehicleId, {
      tripLimit: DEFAULT_TRIP_LIMIT,
      includeCharges: true,
      includeWeeklySummary: true,
      includeChargeSample: true,
      includeDailyTrends: true,
      includeGeofences: true,
      includeParkingDrain: true,
      includeParkingDrainTrends: true,
      includeTemperatureTrends: true
    });
  }

  async getOverviewVehicle(vehicleId) {
    return await this.getVehicleWithOptions(vehicleId, {
      tripLimit: 2,
      includeCharges: true,
      includeWeeklySummary: true,
      includeChargeSample: true,
      includeGeofences: true,
      includeParkingDrain: true
    });
  }

  async getSafetyVehicle(vehicleId) {
    return await this.getVehicleWithOptions(vehicleId, {
      includeGeofences: true,
      includeParkingDrain: true
    });
  }

  async getChargingVehicle(vehicleId) {
    return await this.getVehicleWithOptions(vehicleId, {
      includeCharges: true,
      includeChargeSample: true
    });
  }

  async getTrendsVehicle(vehicleId) {
    return await this.getVehicleWithOptions(vehicleId, {
      includeWeeklySummary: true,
      includeDailyTrends: true,
      includeParkingDrain: true,
      includeParkingDrainTrends: true,
      includeTemperatureTrends: true
    });
  }

  async getVehicleWithOptions(vehicleId, options = {}) {
    const carId = Number.parseInt(vehicleId, 10);
    if (!Number.isInteger(carId)) {
      return null;
    }

    const [
      vehicleResult,
      tripsResult,
      chargesResult,
      weeklyResult,
      chargeSampleResult,
      dailyTrendsResult,
      geofencesResult,
      parkingDrainResult,
      parkingDrainTrendsResult,
      temperatureTrendsResult
    ] = await Promise.all([
      this.pool.query(VEHICLE_SQL, [carId]),
      options.tripLimit > 0
        ? this.pool.query(TRIPS_PAGE_SQL, [carId, options.tripLimit, 0])
        : Promise.resolve({ rows: [] }),
      options.includeCharges
        ? this.pool.query(RECENT_CHARGES_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeWeeklySummary
        ? this.pool.query(WEEKLY_SUMMARY_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeChargeSample
        ? this.queryOptional(LATEST_CHARGE_SAMPLE_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeDailyTrends
        ? this.queryOptional(DAILY_TRENDS_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeGeofences
        ? this.queryOptional(GEOFENCES_SQL)
        : Promise.resolve({ rows: [] }),
      options.includeParkingDrain
        ? this.queryOptional(PARKING_DRAIN_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeParkingDrainTrends
        ? this.queryOptional(PARKING_DRAIN_TRENDS_SQL, [carId])
        : Promise.resolve({ rows: [] }),
      options.includeTemperatureTrends
        ? this.queryOptional(TEMPERATURE_TRENDS_SQL, [carId])
        : Promise.resolve({ rows: [] })
    ]);

    const vehicleRow = vehicleResult.rows[0];
    if (!vehicleRow) {
      return null;
    }

    const trips = tripsResult.rows.map((trip) => mapTrip(trip, []));
    const charges = chargesResult.rows.map(mapCharge);
    const weeklySummary = weeklyResult.rows[0] || {};
    const latestChargeSample = chargeSampleResult.rows[0] || null;
    const geofence = buildGeofenceForLocation(vehicleRow, geofencesResult.rows);
    const parkingDrain = parkingDrainResult.rows[0] || {};

    return mapVehicle(vehicleRow, trips, charges, weeklySummary, latestChargeSample, dailyTrendsResult.rows, {
      geofence,
      parkingDrain,
      parkingDrainTrendRows: parkingDrainTrendsResult.rows,
      temperatureTrendRows: temperatureTrendsResult.rows
    });
  }

  async getTrips(vehicleId, options = {}) {
    const carId = Number.parseInt(vehicleId, 10);
    if (!Number.isInteger(carId)) {
      return null;
    }

    const { limit, offset } = tripPageOptions(options);
    const [tripsResult, countResult] = await Promise.all([
      this.pool.query(TRIPS_PAGE_SQL, [carId, limit, offset]),
      this.pool.query(TRIPS_COUNT_SQL, [carId])
    ]);
    const total = toInt(countResult.rows[0]?.count);
    const nextOffset = offset + tripsResult.rows.length;

    const recentTrips = tripsResult.rows.map(mapTripSummary);

    return {
      vehicleId: String(carId),
      recentTrips,
      frequentPlaces: buildFrequentPlaces(recentTrips, []),
      pagination: {
        limit,
        nextCursor: nextOffset < total ? String(nextOffset) : null,
        total,
        hasMore: nextOffset < total
      }
    };
  }

  async getTripNotificationState(vehicleId) {
    const carId = Number.parseInt(vehicleId, 10);
    if (!Number.isInteger(carId)) {
      return null;
    }

    const [activeResult, endedResult] = await Promise.all([
      this.pool.query(ACTIVE_DRIVE_SQL, [carId]),
      this.pool.query(LATEST_ENDED_DRIVE_SQL, [carId])
    ]);

    return {
      vehicleId: String(carId),
      activeDrive: mapNotificationDrive(activeResult.rows[0]),
      latestEndedDrive: mapNotificationDrive(endedResult.rows[0])
    };
  }

  async getTrip(vehicleId, tripId) {
    const carId = Number.parseInt(vehicleId, 10);
    const driveId = parseTripId(tripId);
    if (!Number.isInteger(carId) || !Number.isInteger(driveId)) {
      return null;
    }

    const tripResult = await this.pool.query(TRIP_DETAIL_SQL, [carId, driveId]);
    const tripRow = tripResult.rows[0];
    if (!tripRow) {
      return null;
    }

    const tripPointsResult = await this.pool.query(TRIP_POINTS_FOR_DRIVE_SQL, [driveId]);
    return mapTrip(tripRow, tripPointsResult.rows);
  }

  async queryOptional(text, params = []) {
    try {
      return await this.pool.query(text, params);
    } catch {
      return { rows: [] };
    }
  }

  async getDiagnostics() {
    const checks = [
      { id: "companion", label: "Companion Server", status: "ok", message: "Server is running." },
      { id: "dataSource", label: "Data Source", status: "ok", message: "Self-hosted vehicle data source is active." }
    ];

    try {
      await this.pool.query("SELECT 1");
      checks.push({ id: "postgres", label: "Source Database", status: "ok", message: "Source database connection succeeded." });
    } catch (error) {
      checks.push({ id: "postgres", label: "Source Database", status: "error", message: error.message });
      checks.push({ id: "vehicles", label: "Vehicle Data", status: "skipped", message: "Vehicle query skipped because the source database is unavailable." });
      return checks;
    }

    try {
      const result = await this.pool.query("SELECT COUNT(*)::int AS count FROM cars");
      const count = toInt(result.rows[0]?.count);
      checks.push({
        id: "vehicles",
        label: "Vehicle Data",
        status: count > 0 ? "ok" : "warning",
        message: count > 0 ? `${count} vehicle record(s) found in the source database.` : "No vehicle records found in the source database."
      });
    } catch (error) {
      checks.push({ id: "vehicles", label: "Vehicle Data", status: "error", message: error.message });
    }

    const schemaResult = await this.queryOptional(SCHEMA_SUPPORT_SQL);
    checks.push(...schemaSupportFromRows(schemaResult.rows));

    checks.push({
      id: "liveSafety",
      label: "Live Safety",
      status: "limited",
      message: "The source database provides historical data; live lock, door, and tire details require the live telemetry feed."
    });

    return checks;
  }

  async close() {
    await this.pool.end();
  }
}

function createTeslaMateDataSource(config) {
  return new TeslaMateDataSource({
    pool: new Pool(buildPoolOptions(config)),
    queryTimeoutMs: config.queryTimeoutMs
  });
}

module.exports = {
  TeslaMateDataSource,
  createTeslaMateDataSource,
  mapVehicle,
  vehicleSummaryFromRow
};
