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

    monkeypatch.setattr(db, "incident_was_remediated", _incident_was_remediated)
    monkeypatch.setattr(db, "mark_verified", _mark_verified)
    monkeypatch.setattr(db, "add_timeline", _add_timeline)
    monkeypatch.setattr(db, "ensure_verify_deadline", _ensure_verify_deadline)
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
