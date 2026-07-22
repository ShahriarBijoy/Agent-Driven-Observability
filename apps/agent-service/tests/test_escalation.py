"""Tests for the re-escalation watcher (PLAN-2 P11, Task 4): a still-firing
alert past its verification deadline spawns a NEW linked investigation
instead of being silently swallowed by /webhook/alerts' dedupe."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from agent_service.escalation import MAX_ESCALATIONS, closing_decision, escalation_due

NOW = datetime(2026, 7, 22, 2, 0, tzinfo=timezone.utc)
BASE = {"id": "inc_1", "status": "open", "verify_deadline": NOW - timedelta(minutes=1), "escalations": 0}


def test_due_when_past_deadline_and_still_firing():
    assert escalation_due(BASE, {"last_firing": NOW, "last_resolved": None}, NOW)


def test_not_due_when_resolved_after_last_firing():
    st = {"last_firing": NOW - timedelta(minutes=5), "last_resolved": NOW}
    assert not escalation_due(BASE, st, NOW)


def test_not_due_before_deadline_or_no_deadline_or_maxed():
    assert not escalation_due({**BASE, "verify_deadline": NOW + timedelta(minutes=5)}, {"last_firing": NOW, "last_resolved": None}, NOW)
    assert not escalation_due({**BASE, "verify_deadline": None}, {"last_firing": NOW, "last_resolved": None}, NOW)
    assert not escalation_due({**BASE, "escalations": MAX_ESCALATIONS}, {"last_firing": NOW, "last_resolved": None}, NOW)


# ---- latest_run_status: skip incidents an investigation is already working -


def test_not_due_when_latest_linked_run_is_in_flight():
    state = {"last_firing": NOW, "last_resolved": None}
    for status in ("queued", "running", "awaiting_approval"):
        assert not escalation_due(BASE, state, NOW, latest_run_status=status), status


def test_due_when_latest_linked_run_is_terminal_or_unknown():
    state = {"last_firing": NOW, "last_resolved": None}
    for status in ("completed", "failed", "denied", None):
        assert escalation_due(BASE, state, NOW, latest_run_status=status), status


# ---- closing_decision: incidents close on OBSERVED recovery only (Task 10) --


def test_closing_decision_matrix():
    # not remediated + inactive -> alert cleared on its own / was transient
    assert closing_decision(remediated=False, alert_active=False) == "resolve"
    # not remediated + active -> diagnosed but not fixed; deadline stands
    assert closing_decision(remediated=False, alert_active=True) == "leave-open"
    # remediated + inactive -> verified recovery
    assert closing_decision(remediated=True, alert_active=False) == "verify"
    # remediated + active -> fix didn't take yet; watcher re-escalates
    assert closing_decision(remediated=True, alert_active=True) == "deadline"
