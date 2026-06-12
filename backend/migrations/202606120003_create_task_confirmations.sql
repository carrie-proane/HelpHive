CREATE TABLE IF NOT EXISTS task_confirmations (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR REFERENCES tasks(id) ON DELETE CASCADE,
  reporter_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  reported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, reporter_id)
);
