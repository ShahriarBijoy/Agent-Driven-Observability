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


def _k8s_payload(namespace, alertname="KubeDeploymentReplicasMismatch", deployment="coredns"):
    """A k8s-rules.yaml alert, which (unlike the app rules) carries a namespace."""
    return {
        "alerts": [{
            "status": "firing",
            "labels": {"alertname": alertname, "namespace": namespace,
                       "deployment": deployment, "severity": "warning"},
            "annotations": {"summary": f"{namespace}/{deployment} available replicas != spec"},
            "startsAt": "2026-07-22T01:00:00Z", "fingerprint": "def456",
        }],
        "status": "firing",
    }


def test_normalize_extracts_the_namespace_label():
    ev = ingress.normalize(_k8s_payload("kube-system"))[0]
    assert ev.namespace == "kube-system"


def test_app_alerts_have_no_namespace_and_stay_actionable():
    """rules.yaml aggregates with sum()/max(), which drops every label — the
    SLO/app alerts carry no namespace. They must NOT be filtered out: this is
    the case a policy-level `namespace = subject` matcher would have broken."""
    ev = ingress.normalize(_grafana_payload())[0]
    assert ev.namespace == ""
    assert ingress.is_actionable(ev, {"subject"})


def test_platform_namespaces_are_not_actionable():
    """The 33-PR pile: one k3d restart, one rule, four kube-system deployments."""
    for ns, dep in (("kube-system", "coredns"), ("kube-system", "traefik"),
                    ("kube-system", "metrics-server"), ("kube-system", "local-path-provisioner"),
                    ("argocd", "argocd-applicationset-controller")):
        ev = ingress.normalize(_k8s_payload(ns, deployment=dep))[0]
        assert not ingress.is_actionable(ev, {"subject"}), f"{ns}/{dep}"


def test_subject_namespace_is_actionable():
    ev = ingress.normalize(_k8s_payload("subject", deployment="gateway"))[0]
    assert ingress.is_actionable(ev, {"subject"})


def test_cluster_scoped_alerts_pass_having_no_namespace():
    """KubeNodeNotReady aggregates by (node) and KubeFailedScheduling by
    nothing at all, so neither carries a namespace. Both are genuinely
    cluster-level and keep paging — the raised `for:` is what stops a
    deliberate restart from tripping them."""
    payload = {"alerts": [{"status": "firing",
                           "labels": {"alertname": "KubeNodeNotReady", "node": "k3d-obs-lab-agent-1"},
                           "annotations": {"summary": "node not Ready"}}], "status": "firing"}
    ev = ingress.normalize(payload)[0]
    assert ev.namespace == "" and ingress.is_actionable(ev, {"subject"})


def test_namespace_allowlist_is_configurable():
    ev = ingress.normalize(_k8s_payload("staging"))[0]
    assert not ingress.is_actionable(ev, {"subject"})
    assert ingress.is_actionable(ev, {"subject", "staging"})
