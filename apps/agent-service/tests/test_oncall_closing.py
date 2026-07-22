"""Tests for the on-call agent's verify-then-close step (PLAN-2 P11 Task 10):
`agents.oncall._close_incident`, run AFTER the model's session ends and
BEFORE ctx.end. Incidents may only close on OBSERVED recovery — decided by
`closing_decision` (code), never by anything the model merely reports."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_service import db
from agent_service.agents import oncall
from agent_service.tools import backends

ALERT = SimpleNamespace(alertname="GatewayHighErrorRate")


class _FakeCtx:
    def __init__(self, run_id: str = "run-1") -> None:
        self.run_id = run_id


@pytest.fixture
def recorder(monkeypatch):
    calls = {
        "mark_verified": [],
        "add_timeline": [],
        "ensure_verify_deadline": [],
        "remediated": False,
        "alert_status": {"alertname": ALERT.alertname, "active": False, "count": 0, "since": None},
        "incident_status": "open",
    }

    async def _incident_was_remediated(incident_id):
        return calls["remediated"]

    async def _mark_verified(incident_id, ts, summary=None):
        calls["mark_verified"].append((incident_id, ts, summary))

    async def _add_timeline(incident_id, entries):
        calls["add_timeline"].append((incident_id, entries))

    async def _ensure_verify_deadline(incident_id, deadline):
        calls["ensure_verify_deadline"].append((incident_id, deadline))

    async def _grafana_active_alerts(alertname):
        return calls["alert_status"]

    async def _get_incident_status(incident_id):
        return calls["incident_status"]

    monkeypatch.setattr(db, "incident_was_remediated", _incident_was_remediated)
    monkeypatch.setattr(db, "mark_verified", _mark_verified)
    monkeypatch.setattr(db, "add_timeline", _add_timeline)
    monkeypatch.setattr(db, "ensure_verify_deadline", _ensure_verify_deadline)
    monkeypatch.setattr(db, "get_incident_status", _get_incident_status)
    monkeypatch.setattr(backends, "grafana_active_alerts", _grafana_active_alerts)
    return calls


async def test_verify_when_remediated_and_alert_cleared(recorder):
    recorder["remediated"] = True
    recorder["alert_status"] = {"active": False}
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert recorder["mark_verified"] == [("inc_1", recorder["mark_verified"][0][1], None)]
    assert len(recorder["add_timeline"]) == 1
    incident_id, entries = recorder["add_timeline"][0]
    assert incident_id == "inc_1"
    source, label = entries[0][1], entries[0][2]
    assert source == "verification"
    assert "recovery verified" in label and ALERT.alertname in label
    assert recorder["ensure_verify_deadline"] == []


async def test_resolve_when_not_remediated_and_alert_cleared(recorder):
    recorder["remediated"] = False
    recorder["alert_status"] = {"active": False}
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert len(recorder["mark_verified"]) == 1
    incident_id, _ts, summary = recorder["mark_verified"][0]
    assert incident_id == "inc_1"
    assert summary == "alert cleared without remediation"
    assert recorder["ensure_verify_deadline"] == []
    # The resolve branch must also leave a timeline trace — otherwise an
    # incident that never got remediated (alert cleared on its own) shows no
    # verification evidence in the machine timeline at all.
    assert len(recorder["add_timeline"]) == 1
    tl_incident_id, entries = recorder["add_timeline"][0]
    assert tl_incident_id == "inc_1"
    _ts, source, label = entries[0]
    assert source == "verification"
    assert label == "alert cleared without remediation"


async def test_deadline_when_remediated_but_still_active(recorder):
    recorder["remediated"] = True
    recorder["alert_status"] = {"active": True}
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert recorder["mark_verified"] == []
    assert len(recorder["ensure_verify_deadline"]) == 1
    assert recorder["ensure_verify_deadline"][0][0] == "inc_1"
    incident_id, entries = recorder["add_timeline"][0]
    assert "NOT verified" in entries[0][2]


async def test_leave_open_when_not_remediated_and_still_active(recorder):
    recorder["remediated"] = False
    recorder["alert_status"] = {"active": True}
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert recorder["mark_verified"] == []
    assert len(recorder["ensure_verify_deadline"]) == 1
    incident_id, entries = recorder["add_timeline"][0]
    assert "NOT verified" in entries[0][2]


async def test_alert_status_error_is_treated_as_active_conservatively(recorder):
    """An unknown alert_status (backend error) must never let a not-yet-
    verified incident close — treat it as still active."""
    recorder["remediated"] = True
    recorder["alert_status"] = {"error": "grafana unreachable"}
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert recorder["mark_verified"] == []  # did NOT verify/resolve
    assert len(recorder["ensure_verify_deadline"]) == 1


async def test_closing_step_never_raises_on_db_failure(recorder, monkeypatch):
    async def _boom(incident_id):
        raise RuntimeError("db pool not initialised")

    monkeypatch.setattr(db, "incident_was_remediated", _boom)
    # Must not raise — degrades to leaving the incident open.
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)


async def test_no_op_when_incident_already_resolved(recorder):
    """When a webhook already closed the incident (status='resolved'),
    _close_incident must not mutate it — no mark_verified, add_timeline,
    or ensure_verify_deadline calls."""
    recorder["incident_status"] = "resolved"
    await oncall._close_incident(_FakeCtx(), "inc_1", ALERT)

    assert recorder["mark_verified"] == []
    assert recorder["add_timeline"] == []
    assert recorder["ensure_verify_deadline"] == []


# ---- run_oncall must close out even when the session itself crashes --------


class _SessionCtx:
    """Minimal ctx stand-in for run_oncall — only the methods it calls before
    (and, on the happy path, after) the agent session."""

    run_id = "run-1"

    def __init__(self) -> None:
        self.ended: tuple[str, str | None] | None = None

    async def begin(self, trigger=None):
        pass

    async def add_user_message(self, content):
        pass

    async def add_artifact(self, name, media_type, content):
        pass

    async def end(self, status, summary=None):
        self.ended = (status, summary)


async def test_run_oncall_runs_closing_step_when_session_raises(monkeypatch):
    """A session that raises (AgentSessionError from a crashed/max-turns run,
    same as `_guard_run`/`_guarded` catch elsewhere) must still run the
    verify-then-close step — otherwise a crashed investigation's incident
    never gets a verify_deadline and the escalation watcher can never find
    it to re-escalate. The exception must still propagate afterwards."""
    from agent_service.agents.base import AgentSessionError

    calls = {"closed_for": [], "session_ran": False, "ended": False}

    async def _fake_prechecks(alert):
        return []

    def _fake_render(results):
        return ""

    async def _fake_lookup(alertname):
        return {"match": None, "available": []}

    async def _fake_session(ctx, kind, prompt, *, max_turns, allowed_override=None):
        calls["session_ran"] = True
        raise AgentSessionError("boom")

    async def _fake_close(ctx, incident_id, alert):
        calls["closed_for"].append(incident_id)

    monkeypatch.setattr(oncall.precheck, "run_prechecks", _fake_prechecks)
    monkeypatch.setattr(oncall.precheck, "render_report", _fake_render)
    monkeypatch.setattr(oncall.backends, "runbook_lookup", _fake_lookup)
    monkeypatch.setattr(oncall, "run_agent_session", _fake_session)
    monkeypatch.setattr(oncall, "_close_incident", _fake_close)

    alert = SimpleNamespace(alertname="gw-5xx", severity="page", summary="x", tenant="acme")
    ctx = _SessionCtx()

    with pytest.raises(AgentSessionError):
        await oncall.run_oncall(ctx, "inc_1", alert)

    assert calls["session_ran"] is True
    assert calls["closed_for"] == ["inc_1"]
    assert ctx.ended is None  # ctx.end never reached — the exception propagated
