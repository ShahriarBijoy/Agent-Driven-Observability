"""Unit tests for the tool-layer guardrails: SQL allow-list, runbook path
safety, and range parsing. These are the fence around pg_select and runbook_read."""

from __future__ import annotations

import os

from agent_service.tools.validation import (
    parse_range,
    safe_artifact_name,
    safe_runbook_path,
    validate_select_sql,
)


def test_safe_artifact_name() -> None:
    assert safe_artifact_name("postmortem.md", "x.md") == "postmortem.md"
    assert safe_artifact_name(None, "default.json") == "default.json"
    # Traversal / absolute / sneaky names are rejected or reduced to a basename.
    for bad in ["../../etc/passwd", "/etc/cron.d/x", "..", ".hidden", "a/b.md", "a\\b.md"]:
        result = safe_artifact_name(bad, "d.md")
        assert result is None or ("/" not in result and "\\" not in result and result != "..")


def test_select_allowed_tables_pass() -> None:
    ok, _ = validate_select_sql("SELECT tenant, count(*) FROM inferences GROUP BY tenant")
    assert ok
    ok, _ = validate_select_sql(
        "WITH recent AS (SELECT * FROM dq_violations) SELECT * FROM recent"
    )
    assert ok


def test_select_rejects_writes() -> None:
    for bad in [
        "UPDATE inferences SET tenant='x'",
        "DELETE FROM inferences",
        "DROP TABLE inferences",
        "INSERT INTO inferences (tenant) VALUES ('x')",
        "SELECT 1; DELETE FROM inferences",
        "TRUNCATE inferences",
    ]:
        ok, reason = validate_select_sql(bad)
        assert not ok, f"should reject: {bad}"


def test_select_rejects_unknown_table() -> None:
    ok, reason = validate_select_sql("SELECT * FROM pg_user")
    assert not ok
    assert "allow-list" in reason


def test_runbook_path_safety() -> None:
    root = os.path.realpath("runbooks")
    good, reason = safe_runbook_path("gateway-high-error-rate.md", root)
    assert good is not None and reason == "ok"

    for bad in ["../secrets.md", "../../etc/passwd", "notes.txt", "/etc/shadow"]:
        path, _ = safe_runbook_path(bad, root)
        assert path is None, f"should reject: {bad}"


def test_parse_range() -> None:
    start, end = parse_range("15m")
    assert (end - start).total_seconds() == 15 * 60
    start, end = parse_range("2h")
    assert (end - start).total_seconds() == 2 * 3600
    # Garbage falls back to the default rather than raising.
    start, end = parse_range("not-a-range")
    assert (end - start).total_seconds() == 3600
