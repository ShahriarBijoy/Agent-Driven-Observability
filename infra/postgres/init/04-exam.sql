-- The chaos exam's results (PLAN-2 P12). Runs once on first boot of the
-- postgres container, after 03-agents.sql has created agent_runs/incidents
-- (init scripts run in filename order, and both are referenced below).
-- agent-service also ensures these tables at startup (db.py SCHEMA_SQL), so an
-- existing volume gets them without a wipe; this script provisions them
-- eagerly for a fresh database, exactly as 03-agents.sql does.

-- One row per invocation of `obs exam` — a group, a single scenario, or --all.
-- `git_sha` is what makes two runs comparable: a scorecard trend is only
-- meaningful if you can see which prompts/runbooks were in the tree.
--
-- NOTE: "group" is a reserved word in SQL. It is quoted here and in every
-- query in db.py because it is the name ADR-006 gives the column and the key
-- the wire uses; an unquoted reference is a syntax error, which is loud.
CREATE TABLE IF NOT EXISTS exam_runs (
  id          TEXT PRIMARY KEY,
  "group"     TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  git_sha     TEXT NOT NULL DEFAULT '',
  notes       TEXT
);

CREATE INDEX IF NOT EXISTS exam_runs_started_idx ON exam_runs (started_at DESC);

-- One row per scenario asked. `status` separates the agent being wrong from
-- the harness failing: only `graded` rows carry a verdict and a score;
-- `not_run` (session died at preflight), `no_alert` (nothing fired inside 2x
-- the expected window — an observability finding) and `error` (inject/revert
-- failed) leave every judged column NULL and are excluded from accuracy
-- rather than counted as zeros.
--
-- `score` is DERIVED, never judged: it is written from ExamResult.score
-- (models.py), which counts the four booleans and forces 0 on `cheated`. It
-- is stored rather than computed in SQL so /scorecard can aggregate without
-- restating the rule — models.py stays the one definition of it.
--
-- agent_run_id / judge_run_id both point at agent_runs: the investigation and
-- the grading are ordinary agent runs, fully auditable through the same
-- tables as everything else.
CREATE TABLE IF NOT EXISTS exam_results (
  id                      TEXT PRIMARY KEY,
  exam_run_id             TEXT NOT NULL REFERENCES exam_runs (id) ON DELETE CASCADE,
  scenario_id             TEXT NOT NULL,
  status                  TEXT NOT NULL,
  incident_id             TEXT REFERENCES incidents (id) ON DELETE SET NULL,
  agent_run_id            TEXT REFERENCES agent_runs (id) ON DELETE SET NULL,
  judge_run_id            TEXT REFERENCES agent_runs (id) ON DELETE SET NULL,
  component_correct       BOOLEAN,
  cause_category_correct  BOOLEAN,
  evidence_cited          BOOLEAN,
  remediation_appropriate BOOLEAN,
  cheated                 BOOLEAN,
  score                   INTEGER,
  time_to_alert_s         INTEGER,
  time_to_diagnosis_s     INTEGER,
  turns                   INTEGER,
  tool_calls              INTEGER,
  input_tokens            INTEGER,
  output_tokens           INTEGER,
  cost_usd                DOUBLE PRECISION,
  judge_rationale         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_results_run_idx ON exam_results (exam_run_id, created_at);
CREATE INDEX IF NOT EXISTS exam_results_scenario_idx ON exam_results (scenario_id, created_at DESC);
