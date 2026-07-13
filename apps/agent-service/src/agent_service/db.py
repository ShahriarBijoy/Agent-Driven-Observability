"""Postgres persistence — the durable audit trail for every agent run.

asyncpg pool + idempotent schema bootstrap (mirrors infra/postgres/init/
03-agents.sql so a pre-existing volume gets the tables without a wipe). The
in-memory hub serves live streams; this module is the source of truth for
`GET /runs` and `GET /runs/:id`, reconstructing AgentRun from the five tables.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import asyncpg

from .config import config
from .models import AgentRun, Approval, Artifact, RunMessage, ToolCall

_pool: asyncpg.Pool | None = None

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, tenant TEXT NOT NULL,
  status TEXT NOT NULL, title TEXT NOT NULL, trigger TEXT, summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx ON agent_runs (tenant, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_runs_created_idx ON agent_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(), role TEXT NOT NULL, content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_messages_run_idx ON agent_messages (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(), tool TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb, output TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), ended_at TIMESTAMPTZ,
  duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS agent_tool_calls_run_idx ON agent_tool_calls (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  summary TEXT NOT NULL, payload JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision TEXT, decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS agent_approvals_run_idx ON agent_approvals (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs (id) ON DELETE CASCADE,
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL, media_type TEXT NOT NULL, content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_artifacts_run_idx ON agent_artifacts (run_id, seq);

CREATE TABLE IF NOT EXISTS agent_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', tenant TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ,
  summary TEXT, postmortem_md TEXT,
  run_id TEXT REFERENCES agent_runs (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_opened_idx ON incidents (opened_at DESC);
"""


def _dsn() -> str:
    # asyncpg accepts postgres:// and postgresql:// but not extra query params
    # it doesn't know; the lab DSN is plain, so pass it through.
    return config.database_url


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def init_pool() -> None:
    global _pool
    if _pool is not None:
        return
    _pool = await asyncpg.create_pool(dsn=_dsn(), min_size=1, max_size=8)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _require_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("db pool not initialised")
    return _pool


async def create_run(run: AgentRun, trigger: str | None) -> None:
    pool = _require_pool()
    await pool.execute(
        """INSERT INTO agent_runs (id, agent, tenant, status, title, trigger)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING""",
        run.id, run.agent, run.tenant, run.status, run.title, trigger,
    )


async def set_status(run_id: str, status: str, *, summary: str | None = None,
                     ended: bool = False) -> None:
    pool = _require_pool()
    await pool.execute(
        """UPDATE agent_runs
           SET status = $2,
               summary = COALESCE($3, summary),
               updated_at = now(),
               ended_at = CASE WHEN $4 THEN now() ELSE ended_at END
           WHERE id = $1""",
        run_id, status, summary, ended,
    )


async def touch(run_id: str) -> None:
    await _require_pool().execute(
        "UPDATE agent_runs SET updated_at = now() WHERE id = $1", run_id
    )


async def add_message(run_id: str, msg: RunMessage) -> None:
    await _require_pool().execute(
        """INSERT INTO agent_messages (id, run_id, role, content)
           VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING""",
        msg.id, run_id, msg.role, msg.content,
    )
    await touch(run_id)


async def upsert_tool_call(run_id: str, tc: ToolCall, duration_ms: int | None = None) -> None:
    await _require_pool().execute(
        """INSERT INTO agent_tool_calls
             (id, run_id, tool, input, output, status, ended_at, duration_ms)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6,
                   CASE WHEN $6 = 'pending' THEN NULL ELSE now() END, $7)
           ON CONFLICT (id) DO UPDATE
             SET output = EXCLUDED.output,
                 status = EXCLUDED.status,
                 ended_at = COALESCE(EXCLUDED.ended_at, agent_tool_calls.ended_at),
                 duration_ms = COALESCE(EXCLUDED.duration_ms, agent_tool_calls.duration_ms)""",
        tc.id, run_id, tc.name, json.dumps(tc.args), tc.result, tc.status, duration_ms,
    )
    await touch(run_id)


async def add_approval(run_id: str, approval: Approval) -> None:
    await _require_pool().execute(
        """INSERT INTO agent_approvals (id, run_id, summary)
           VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING""",
        approval.id, run_id, approval.summary,
    )
    await touch(run_id)


async def decide_approval(run_id: str, approval_id: str, decision: str) -> bool:
    row = await _require_pool().fetchrow(
        """UPDATE agent_approvals
           SET decision = $3, decided_at = now()
           WHERE run_id = $1 AND id = $2 AND decision IS NULL
           RETURNING id""",
        run_id, approval_id, decision,
    )
    return row is not None


async def add_artifact(run_id: str, artifact: Artifact) -> None:
    created = datetime.fromisoformat(artifact.created_at.replace("Z", "+00:00"))
    await _require_pool().execute(
        """INSERT INTO agent_artifacts (id, run_id, name, media_type, content, created_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING""",
        artifact.id, run_id, artifact.name, artifact.media_type, artifact.content, created,
    )
    await touch(run_id)


async def get_settings() -> dict | None:
    row = await _require_pool().fetchrow(
        "SELECT value FROM agent_settings WHERE key = 'global'"
    )
    if row is None:
        return None
    value = row["value"]
    return json.loads(value) if isinstance(value, str) else value


async def save_settings(value: dict) -> None:
    await _require_pool().execute(
        """INSERT INTO agent_settings (key, value) VALUES ('global', $1::jsonb)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()""",
        json.dumps(value),
    )


async def get_run(run_id: str) -> AgentRun | None:
    pool = _require_pool()
    run_row = await pool.fetchrow("SELECT * FROM agent_runs WHERE id = $1", run_id)
    if run_row is None:
        return None
    msgs = await pool.fetch(
        "SELECT * FROM agent_messages WHERE run_id = $1 ORDER BY seq", run_id
    )
    tools = await pool.fetch(
        "SELECT * FROM agent_tool_calls WHERE run_id = $1 ORDER BY seq", run_id
    )
    arts = await pool.fetch(
        "SELECT * FROM agent_artifacts WHERE run_id = $1 ORDER BY seq", run_id
    )
    apprs = await pool.fetch(
        "SELECT * FROM agent_approvals WHERE run_id = $1 ORDER BY seq", run_id
    )
    return AgentRun(
        id=run_row["id"],
        agent=run_row["agent"],
        tenant=run_row["tenant"],
        status=run_row["status"],
        title=run_row["title"],
        created_at=_iso(run_row["created_at"]) or "",
        updated_at=_iso(run_row["updated_at"]) or "",
        messages=[
            RunMessage(id=m["id"], role=m["role"], content=m["content"],
                       created_at=_iso(m["ts"]) or "")
            for m in msgs
        ],
        tool_calls=[
            ToolCall(
                id=t["id"], name=t["tool"],
                args=json.loads(t["input"]) if isinstance(t["input"], str) else t["input"],
                status=t["status"], started_at=_iso(t["started_at"]) or "",
                ended_at=_iso(t["ended_at"]), result=t["output"],
            )
            for t in tools
        ],
        artifacts=[
            Artifact(id=a["id"], name=a["name"], media_type=a["media_type"],
                     content=a["content"], created_at=_iso(a["created_at"]) or "")
            for a in arts
        ],
        approvals=[
            Approval(id=p["id"], summary=p["summary"], requested_at=_iso(p["requested_at"]) or "",
                     decision=p["decision"], decided_at=_iso(p["decided_at"]))
            for p in apprs
        ],
    )


async def list_runs(tenant: str | None) -> list[dict]:
    pool = _require_pool()
    if tenant is None:
        rows = await pool.fetch(
            "SELECT id, agent, tenant, status, title, created_at, updated_at "
            "FROM agent_runs ORDER BY created_at DESC LIMIT 200"
        )
    else:
        rows = await pool.fetch(
            "SELECT id, agent, tenant, status, title, created_at, updated_at "
            "FROM agent_runs WHERE tenant = $1 ORDER BY created_at DESC LIMIT 200",
            tenant,
        )
    return [
        {
            "id": r["id"], "agent": r["agent"], "tenant": r["tenant"],
            "status": r["status"], "title": r["title"],
            "createdAt": _iso(r["created_at"]), "updatedAt": _iso(r["updated_at"]),
        }
        for r in rows
    ]


async def record_incident(
    *,
    incident_id: str,
    title: str,
    severity: str,
    tenant: str,
    summary: str,
    postmortem_md: str | None,
    run_id: str,
    status: str = "open",
) -> None:
    await _require_pool().execute(
        """INSERT INTO incidents
             (id, title, severity, status, tenant, summary, postmortem_md, run_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING""",
        incident_id, title, severity, status, tenant, summary, postmortem_md, run_id,
    )


async def run_select(sql: str, params: list, limit: int = 200) -> list[dict]:
    """Execute a read-only SELECT in a read-only transaction. Callers MUST have
    validated the SQL against the allow-list first (tools.validation)."""
    pool = _require_pool()
    async with pool.acquire() as conn:
        async with conn.transaction(readonly=True):
            rows = await conn.fetch(sql, *params)
    return [dict(r) for r in rows[:limit]]
