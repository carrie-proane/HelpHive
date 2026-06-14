CREATE TABLE IF NOT EXISTS dispatch_outcomes (
  id VARCHAR PRIMARY KEY,
  task_id VARCHAR NOT NULL,
  volunteer_id VARCHAR,
  assignment_id VARCHAR,
  outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('accepted', 'declined', 'completed', 'cancelled', 'false')),
  notes TEXT,
  correction JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dispatch_outcomes_task_idx ON dispatch_outcomes (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dispatch_outcomes_volunteer_idx ON dispatch_outcomes (volunteer_id, created_at DESC);
