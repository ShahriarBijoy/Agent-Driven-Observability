-- Agent control-plane schema (Phase 5). Runs once on first boot of the postgres
-- container. agent-service writes every run, message, tool call, approval, and
-- artifact here in real time — this is the audit trail that survives the run.
-- The service also ensures these tables at startup (CREATE ... IF NOT EXISTS),
-- so an existing volume gets them without a wipe; this script just provisions
-- them eagerly for a fresh database.

CREATE TABLE IF NOT EXISTS agent_runs (
  id          TEXT PRIMARY KEY,
  agent       TEXT NOT NULL,
  tenant      TEXT NOT NULL,
  status      TEXT NOT NULL,
  title       TEXT NOT NULL,
  trigger     TEXT,
  summary     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx ON agent_runs (tenant, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_created_idx ON agent_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  role        TEXT NOT NULL,
  content     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_messages_run_idx ON agent_messages (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  tool        TEXT NOT NULL,
  input       JSONB NOT NULL DEFAULT '{}'::jsonb,
  output      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS agent_tool_calls_run_idx ON agent_tool_calls (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq          BIGINT GENERATED ALWAYS AS IDENTITY,
  summary      TEXT NOT NULL,
  payload      JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision     TEXT,
  decided_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_approvals_run_idx ON agent_approvals (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq         BIGINT GENERATED ALWAYS AS IDENTITY,
  name        TEXT NOT NULL,
  media_type  TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_artifacts_run_idx ON agent_artifacts (run_id, seq);

-- Runtime agent settings the web settings page edits (model, per-agent tool
-- grants). One JSONB row under key 'global'; agent-service reads it per run.
CREATE TABLE IF NOT EXISTS agent_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The incident inbox the web control plane reads. The incident-reporter agent
-- writes one row per investigated alert (postmortem_md holds the Markdown), and
-- links it back to the agent run that produced it.
CREATE TABLE IF NOT EXISTS incidents (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  severity      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  tenant        TEXT NOT NULL,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  summary       TEXT,
  postmortem_md TEXT,
  run_id        TEXT REFERENCES agent_runs (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incidents_opened_idx ON incidents (opened_at DESC);
