"""Tests for incident-reporter helpers: alert parsing + inbox summary
extraction. incident.py itself stays alive as a chat-only agent (CHAT_AGENTS'
`incident-reporter`) post-cutover — these pure-function tests are unaffected.

The webhook cutover (PLAN-2 P11 Task 3) is covered below: the legacy
`/webhook/grafana-alert` URL (still provisioned by older Grafana contact
points) is now a delegating shim to the unified `/webhook/alerts` ingress,
which spawns exactly one `oncall` investigation per deduped incident — the
incident-reporter's `run_incident_reporter` is no longer reachable from any
webhook."""

from __future__ import annotations

import asyncio
import dataclasses
import json

import pytest
from starlette.requests import Request

from agent_service import app as app_module
from agent_service import db
from agent_service.agents.incident import _inbox_summary, summarize_alert


def test_summarize_alert_grafana_payload() -> None:
    payload = {
        "status": "firing",
        "alerts": [
            {
                "status": "firing",
                "labels": {"alertname": "Gateway 5xx rate > 2%", "severity": "page"},
                "annotations": {"summary": "gateway 5xx rate above 2%"},
            }
        ],
        "commonLabels": {"alertname": "Gateway 5xx rate > 2%", "severity": "page"},
    }
    info = summarize_alert(payload)
    assert info["alertname"] == "Gateway 5xx rate > 2%"
    assert info["severity"] == "sev1"  # page -> sev1
    assert info["status"] == "firing"
    assert info["summary"] == "gateway 5xx rate above 2%"


def test_summarize_alert_tolerates_empty() -> None:
    info = summarize_alert({})
    assert info["severity"] == "sev2"  # default
    assert info["alertname"]


def test_inbox_summary_prefers_postmortem_section() -> None:
    pm = "# Postmortem\n\n## Summary\nThe gateway returned 5xx due to upstream timeouts.\n\n## Impact\n..."
    out = _inbox_summary(pm, "I'll investigate this. Let me load tools.", "fallback")
    assert out == "The gateway returned 5xx due to upstream timeouts."


def test_inbox_summary_falls_back_to_last_paragraph() -> None:
    final = "First I investigated.\n\nConclusion: it was a model-proxy timeout."
    out = _inbox_summary(None, final, "fallback")
    assert out == "Conclusion: it was a model-proxy timeout."


# ---- P11 cutover: /webhook/grafana-alert now feeds the unified ingress -----


def _request(body: bytes, headers: dict[str, str] | None = None) -> Request:
    raw_headers = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]

    async def receive() -> dict:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(
        {"type": "http", "method": "POST", "path": "/webhook/grafana-alert", "headers": raw_headers},
        receive,
    )


def _grafana_alert_body() -> dict:
    return {
        "status": "firing",
        "alerts": [
            {
                "status": "firing",
                "labels": {"alertname": "slo-avail-fast", "workload": "gateway", "severity": "critical"},
                "annotations": {"summary": "availability burn"},
                "startsAt": "2026-07-22T01:00:00Z",
                "fingerprint": "abc123",
            }
        ],
        "commonLabels": {"alertname": "slo-avail-fast"},
    }


def _body(response) -> dict:
    return json.loads(bytes(response.body))


def _patch_no_secret(monkeypatch) -> None:
    monkeypatch.setattr(
        app_module, "config", dataclasses.replace(app_module.config, alert_webhook_secret="")
    )


def _patch_db_and_spawn(monkeypatch) -> dict:
    calls: dict = {"attach": []}

    async def fake_find_open_incident_by_key(_key):
        return None

    async def fake_create_incident(incident_id, **kwargs):
        calls["incident_id"] = incident_id
        calls["create_incident_kwargs"] = kwargs
        return True

    async def fake_attach_alert(incident_id, **kwargs):
        calls["attach"].append((incident_id, kwargs))

    async def fake_create_run(run, trigger):
        calls["run_trigger"] = trigger

    async def fake_link_run(incident_id, run_id, kind="investigation"):
        calls["linked"] = (incident_id, run_id, kind)

    async def fake_set_status(run_id, status, *, summary=None, ended=False):
        calls.setdefault("statuses", []).append(status)

    async def fake_run_oncall(ctx, incident_id, alert, *, escalation=None):
        calls["run_oncall_called_with"] = (incident_id, alert.alertname)
        await ctx.end("completed", summary="test-complete")

    monkeypatch.setattr(db, "find_open_incident_by_key", fake_find_open_incident_by_key)
    monkeypatch.setattr(db, "create_incident", fake_create_incident)
    monkeypatch.setattr(db, "attach_alert", fake_attach_alert)
    monkeypatch.setattr(db, "create_run", fake_create_run)
    monkeypatch.setattr(db, "link_run", fake_link_run)
    monkeypatch.setattr(db, "set_status", fake_set_status)
    monkeypatch.setattr(app_module, "run_oncall", fake_run_oncall)
    return calls


@pytest.mark.asyncio
async def test_grafana_alert_shim_spawns_oncall_not_incident_reporter(monkeypatch):
    _patch_no_secret(monkeypatch)
    calls = _patch_db_and_spawn(monkeypatch)

    request = _request(json.dumps(_grafana_alert_body()).encode())
    response = await app_module.grafana_alert(request)

    assert response.status_code == 202
    results = _body(response)["results"]
    assert len(results) == 1
    assert results[0]["action"] == "spawn"
    assert "incidentId" in results[0] and "runId" in results[0]
    assert calls["create_incident_kwargs"]["severity"] == "sev1"  # critical -> sev1

    # Let the fire-and-forget oncall task run to completion.
    for _ in range(5):
        await asyncio.sleep(0)
    assert calls["run_oncall_called_with"] == (calls["incident_id"], "slo-avail-fast")


@pytest.mark.asyncio
async def test_webhook_alerts_lost_race_attaches_instead_of_spawning(monkeypatch):
    """Two near-simultaneous deliveries for the same alert_key: both see no
    open incident, but only one insert can win the unique open-incident index
    (db.create_incident returns False for the loser). The loser must attach
    to the winner's incident and spawn no run of its own."""
    _patch_no_secret(monkeypatch)
    calls: dict = {"attach": []}

    lookup_calls = {"n": 0}

    async def fake_find_open_incident_by_key(_key):
        lookup_calls["n"] += 1
        if lookup_calls["n"] == 1:
            return None  # initial lookup: nothing open yet
        return {"id": "inc-winner"}  # re-fetch after losing the race

    async def fake_create_incident(incident_id, **kwargs):
        return False  # lost the race

    async def fake_attach_alert(incident_id, **kwargs):
        calls["attach"].append((incident_id, kwargs))

    async def fake_run_oncall(ctx, incident_id, alert, *, escalation=None):
        calls["run_oncall_called"] = True
        await ctx.end("completed", summary="test-complete")

    monkeypatch.setattr(db, "find_open_incident_by_key", fake_find_open_incident_by_key)
    monkeypatch.setattr(db, "create_incident", fake_create_incident)
    monkeypatch.setattr(db, "attach_alert", fake_attach_alert)
    monkeypatch.setattr(app_module, "run_oncall", fake_run_oncall)

    request = _request(json.dumps(_grafana_alert_body()).encode())
    response = await app_module.webhook_alerts(request)

    assert response.status_code == 202
    results = _body(response)["results"]
    assert len(results) == 1
    assert results[0] == {"action": "attach", "incidentId": "inc-winner"}
    assert calls["attach"] == [("inc-winner", calls["attach"][0][1])]

    # Give any errantly-spawned task a chance to run before asserting absence.
    for _ in range(5):
        await asyncio.sleep(0)
    assert "run_oncall_called" not in calls


@pytest.mark.asyncio
async def test_webhook_alerts_rejects_bad_signature(monkeypatch):
    monkeypatch.setattr(
        app_module, "config",
        dataclasses.replace(app_module.config, alert_webhook_secret="s3cret"),
    )
    request = _request(
        json.dumps(_grafana_alert_body()).encode(),
        headers={"X-Grafana-Alerting-Signature": "not-a-real-signature"},
    )
    response = await app_module.webhook_alerts(request)
    assert response.status_code == 403
