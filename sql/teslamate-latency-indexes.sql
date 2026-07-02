-- Optional TeslaMate read-performance indexes for TTDeck Companion Server.
-- Run manually during a maintenance window after checking existing indexes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ttdeck_drives_car_end_date
  ON drives (car_id, end_date DESC)
  WHERE end_date IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ttdeck_positions_drive_date
  ON positions (drive_id, date ASC)
  WHERE drive_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ttdeck_positions_car_date
  ON positions (car_id, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ttdeck_charging_processes_car_start_date
  ON charging_processes (car_id, start_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ttdeck_states_car_end_date
  ON states (car_id, end_date DESC)
  WHERE end_date IS NOT NULL;
