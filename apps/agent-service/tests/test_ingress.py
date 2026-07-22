"""Tests for the unified alert ingress (P11 Task 3): HMAC verification,
payload normalization (Grafana + gitops shapes), and the dedupe/resolved-close
decision matrix."""

from __future__ import annotations

import hashlib
import hmac as hmac_mod
import json

from agent_service import ingress


def _grafana_payload(status="firing", alertname="slo-avail-fast", extra_alerts=0):
    alert = {"status": status, "labels": {"alertname": alertname, "workload": "gateway", "severity": "critical"},
             "annotations": {"summary": "availability burn"}, "startsAt": "2026-07-22T01:00:00Z",
             "fingerprint": "abc123"}
    return {"alerts": [alert] + [dict(alert) for _ in range(extra_alerts)],
            "commonLabels": {"alertname": alertname}, "status": status}


def test_verify_signature_roundtrip():
    body = json.dumps(_grafana_payload()).encode()
    sig = hmac_mod.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert ingress.verify_signature(body, sig, "s3cret")
    assert not ingress.verify_signature(body, sig, "wrong")
    assert not ingress.verify_signature(body, None, "s3cret")


def test_normalize_and_key():
    evs = ingress.normalize(_grafana_payload(extra_alerts=9))
    assert len(evs) == 10 and evs[0].alertname == "slo-avail-fast"
    assert ingress.alert_key(evs[0]) == "slo-avail-fast/gateway"


def test_gitops_shape_detected():
    assert ingress.payload_kind({"event": "on-rollout-aborted", "app": "gateway"}) == "gitops"
    ev = ingress.normalize({"event": "on-rollout-aborted", "app": "gateway"})[0]
    assert ev.alertname == "on-rollout-aborted" and ev.workload == "gateway" and ev.status == "firing"


def test_ingress_decision_matrix():
    ev_f = ingress.normalize(_grafana_payload())[0]
    ev_r = ingress.normalize(_grafana_payload(status="resolved"))[0]
    assert ingress.ingress_decision(ev_f, None) == "spawn"
    assert ingress.ingress_decision(ev_f, {"id": "inc_1"}) == "attach"
    assert ingress.ingress_decision(ev_r, {"id": "inc_1"}) == "close"
    assert ingress.ingress_decision(ev_r, None) == "ignore"
