"""Postgres access for the dq-runner: schema bootstrap, reads, and violation writes.

The dq-runner owns the data-observability schema (`inferences`, `dq_violations`)
and ensures it exists at startup so it works even on a pre-existing volume; the
postgres init script provisions the same tables for a fresh database.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

import psycopg
from psycopg.types.json import Json

# Columns the distribution check may sample. Fixed allow-list — never user input.
DISTRIBUTION_COLUMNS = {
    "prompt_chars": "prompt_chars",
    "retrieval_score": "retrieval_score_mean",
    "completion_tokens": "completion_tokens",
}

_SCHEMA_DDL = [
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS inferences_tenant_created_idx ON inferences (tenant, created_at)",
    "CREATE INDEX IF NOT EXISTS inferences_created_idx ON inferences (created_at)",
    """
    CREATE TABLE IF NOT EXISTS dq_violations (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      check_name TEXT NOT NULL,
      signal TEXT,
      severity TEXT NOT NULL,
      dataset TEXT,
      ts TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload JSONB NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS dq_violations_ts_idx ON dq_violations (ts)",
    "CREATE INDEX IF NOT EXISTS dq_violations_severity_ts_idx ON dq_violations (severity, ts)",
]


def connect(database_url: str) -> psycopg.Connection:
    """Open an autocommit connection. libpq accepts both postgres:// and postgresql://."""
    return psycopg.connect(database_url, autocommit=True)


def ensure_schema(conn: psycopg.Connection) -> None:
    for stmt in _SCHEMA_DDL:
        conn.execute(stmt)


def last_inference_per_tenant(conn: psycopg.Connection) -> dict[str, datetime]:
    rows = conn.execute(
        "SELECT tenant, max(created_at) FROM inferences GROUP BY tenant"
    ).fetchall()
    return {row[0]: row[1] for row in rows}


def max_created_at(conn: psycopg.Connection, table: str) -> datetime | None:
    # `table` is a fixed code constant (chunks / inferences), never user input.
    row = conn.execute(f"SELECT max(created_at) FROM {table}").fetchone()
    return row[0] if row else None


def inference_counts(conn: psycopg.Connection, window_seconds: int) -> dict[str, int]:
    rows = conn.execute(
        "SELECT tenant, count(*) FROM inferences "
        "WHERE created_at > now() - (%s * interval '1 second') GROUP BY tenant",
        (window_seconds,),
    ).fetchall()
    return {row[0]: row[1] for row in rows}


def distribution_samples(conn: psycopg.Connection, column: str, window_seconds: int) -> list[float]:
    if column not in DISTRIBUTION_COLUMNS.values():
        raise ValueError(f"disallowed distribution column: {column}")
    rows = conn.execute(
        f"SELECT {column} FROM inferences "
        f"WHERE {column} IS NOT NULL AND created_at > now() - (%s * interval '1 second')",
        (window_seconds,),
    ).fetchall()
    return [float(row[0]) for row in rows]


def recent_responses(conn: psycopg.Connection, limit: int) -> list[Any]:
    rows = conn.execute(
        "SELECT response FROM inferences WHERE response IS NOT NULL "
        "ORDER BY created_at DESC LIMIT %s",
        (limit,),
    ).fetchall()
    return [row[0] for row in rows]


def cache_stats(conn: psycopg.Connection, window_seconds: int) -> dict[str, tuple[int, int]]:
    rows = conn.execute(
        "SELECT tenant, count(*) FILTER (WHERE cache_hit), count(*) FROM inferences "
        "WHERE created_at > now() - (%s * interval '1 second') GROUP BY tenant",
        (window_seconds,),
    ).fetchall()
    return {row[0]: (row[1], row[2]) for row in rows}


def insert_violation(
    conn: psycopg.Connection,
    check_name: str,
    signal: str | None,
    severity: str,
    dataset: str | None,
    payload: dict[str, Any],
) -> None:
    conn.execute(
        "INSERT INTO dq_violations (check_name, signal, severity, dataset, payload) "
        "VALUES (%s, %s, %s, %s, %s)",
        (check_name, signal, severity, dataset, Json(payload)),
    )


def recent_violations(conn: psycopg.Connection, limit: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, check_name, signal, severity, dataset, ts, payload "
        "FROM dq_violations ORDER BY ts DESC LIMIT %s",
        (limit,),
    ).fetchall()
    return [
        {
            "id": row[0],
            "check": row[1],
            "signal": row[2],
            "severity": row[3],
            "dataset": row[4],
            "ts": row[5].isoformat() if row[5] else None,
            "payload": row[6],
        }
        for row in rows
    ]
