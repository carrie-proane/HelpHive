ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS match_score NUMERIC(10, 3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignments_status_check'
      AND conrelid = 'assignments'::regclass
  ) THEN
    ALTER TABLE assignments DROP CONSTRAINT assignments_status_check;
  END IF;
END $$;

ALTER TABLE assignments
  ADD CONSTRAINT assignments_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'cancelled', 'declined')) NOT VALID;

CREATE INDEX IF NOT EXISTS assignments_task_status_idx ON assignments (task_id, status);
CREATE INDEX IF NOT EXISTS volunteers_available_idx ON volunteers (is_available);
