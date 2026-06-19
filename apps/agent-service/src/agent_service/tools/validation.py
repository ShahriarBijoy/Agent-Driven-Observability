"""Pure validators — the guardrails on the tool layer.

Kept side-effect-free so they're cheap to unit test: time-range parsing, the
read-only SQL allow-list (pg_select must never mutate), and runbook path safety
(no traversal outside RUNBOOKS_DIR). Heuristic, not a full SQL parser — the goal
is a strong fence for a lab, not a production policy engine.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone

# Tables pg_select may read. Everything the agents legitimately need to reason
# about lives here; anything else (or a write) is refused.
PG_ALLOWLIST: frozenset[str] = frozenset(
    {
        "inferences",
        "dq_violations",
        "usage_events",
        "chunks",
        "agent_runs",
        "agent_messages",
        "agent_tool_calls",
        "agent_approvals",
        "agent_artifacts",
    }
)

_RANGE_RE = re.compile(r"^\s*(\d+)\s*([smhdw])\s*$", re.IGNORECASE)
_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800}

_FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|"
    r"copy|merge|call|do|vacuum|analyze|comment|reindex|cluster|lock)\b",
    re.IGNORECASE,
)
# Table references after FROM / JOIN, capturing an optional schema-qualified name.
_TABLE_RE = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][\w.]*)", re.IGNORECASE)


def parse_range(range_str: str | None, default: str = "1h") -> tuple[datetime, datetime]:
    """Parse '15m' / '1h' / '24h' / '7d' into (start, end) UTC datetimes."""
    raw = (range_str or "").strip() or default
    match = _RANGE_RE.match(raw)
    if not match:
        # Fall back to the default rather than raising — tools never raise.
        match = _RANGE_RE.match(default)
        assert match is not None
    qty = int(match.group(1))
    seconds = qty * _UNIT_SECONDS[match.group(2).lower()]
    end = datetime.now(timezone.utc)
    return end - timedelta(seconds=seconds), end


def validate_select_sql(sql: str, allowlist: frozenset[str] = PG_ALLOWLIST) -> tuple[bool, str]:
    """Return (ok, reason). Enforces: a single read-only SELECT/WITH statement
    that touches only allow-listed tables."""
    text = sql.strip().rstrip(";").strip()
    if text == "":
        return False, "empty query"
    if ";" in text:
        return False, "multiple statements are not allowed"
    head = text.lstrip("(").lstrip()
    if not re.match(r"^(select|with)\b", head, re.IGNORECASE):
        return False, "only SELECT (or WITH ... SELECT) queries are allowed"
    forbidden = _FORBIDDEN.search(text)
    if forbidden:
        return False, f"forbidden keyword: {forbidden.group(1).lower()}"
    tables = {t.split(".")[-1].lower() for t in _TABLE_RE.findall(text)}
    # Strip CTE names (WITH x AS (...)) so they don't count as unknown tables.
    cte_names = {
        m.lower()
        for m in re.findall(r"\b([a-zA-Z_]\w*)\s+as\s*\(", text, re.IGNORECASE)
    }
    unknown = {t for t in tables - cte_names if t not in allowlist}
    if unknown:
        return False, f"table(s) not in allow-list: {', '.join(sorted(unknown))}"
    return True, "ok"


_ARTIFACT_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")


def safe_artifact_name(name: str | None, default: str) -> str | None:
    """Reduce a model-supplied artifact name to a single safe basename, or None
    if it can't be made safe. Blocks path traversal in save_artifact's file copy."""
    candidate = os.path.basename((name or default).strip())
    if _ARTIFACT_NAME_RE.fullmatch(candidate):
        return candidate
    return None


def safe_runbook_path(path: str, root: str) -> tuple[str | None, str]:
    """Resolve `path` inside `root`, refusing traversal and non-Markdown files.
    Returns (absolute_path, 'ok') or (None, reason)."""
    root_abs = os.path.realpath(root)
    candidate = path.strip()
    if candidate == "":
        return None, "empty path"
    # Treat the path as relative to the runbooks root regardless of leading slash.
    candidate = candidate.lstrip("/\\")
    target = os.path.realpath(os.path.join(root_abs, candidate))
    if target != root_abs and not target.startswith(root_abs + os.sep):
        return None, "path escapes the runbooks directory"
    if not target.lower().endswith(".md"):
        return None, "only .md runbooks may be read"
    return target, "ok"
