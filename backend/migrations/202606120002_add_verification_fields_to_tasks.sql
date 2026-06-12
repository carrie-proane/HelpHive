ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS confirmation_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS gps_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_status_check'
      AND conrelid = 'tasks'::regclass
  ) THEN
    ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  END IF;
END $$;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('open', 'in_progress', 'completed', 'resolved', 'pending_review', 'pending', 'confirmed', 'rejected', 'auto_accepted'));

ALTER TABLE tasks
  ALTER COLUMN status SET DEFAULT 'pending';
