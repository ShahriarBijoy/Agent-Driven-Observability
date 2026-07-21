-- Data-observability schema (Phase 3). Runs once on first boot of the postgres
-- container. The gateway writes `inferences` (one row per successful chat); the
-- dq-runner writes `dq_violations`. The dq-runner also ensures these tables at
-- startup (CREATE ... IF NOT EXISTS), so an existing volume gets them without a
-- wipe — this script just provisions them eagerly for a fresh database.

CREATE TABLE IF NOT EXISTS inferences (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id UUID NOT NULL,
  tenant TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_chars INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  retrieved_count INTEGER NOT NULL,
  retrieval_score_mean DOUBLE PRECISION,
  retrieval_score_max DOUBLE PRECISION,
  cache_hit BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inferences_tenant_created_idx ON inferences (tenant, created_at);
CREATE INDEX IF NOT EXISTS inferences_created_idx ON inferences (created_at);

CREATE TABLE IF NOT EXISTS dq_violations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  check_name TEXT NOT NULL,
  signal TEXT,
  severity TEXT NOT NULL,
  dataset TEXT,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS dq_violations_ts_idx ON dq_violations (ts);
CREATE INDEX IF NOT EXISTS dq_violations_severity_ts_idx ON dq_violations (severity, ts);
