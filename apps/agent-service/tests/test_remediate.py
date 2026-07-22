"""agent-remediate: the scoped writer identity for the on-call agent's six
remediation tools. Every one dry-runs first and fingerprints its action;
executing for real is gated server-side (`_execute_gate`) on a Postgres
approval row this run actually collected — the model asserting "approved" in
its own text is worth nothing without a matching row. `validate_remediation`
is the hard-deny layer: unknown workload/action, out-of-bounds params, or a
malformed name refuses regardless of anything else (checked BEFORE any
kubectl subprocess is ever built, so an injection attempt never reaches
argv)."""

from __future__ import annotations

import dataclasses
from types import SimpleNamespace

import pytest

from agent_service.tools import remediate


# ---- Step 1 (brief, verbatim): pure validation + fingerprint ----------------


def test_hard_deny_unknown_workload_and_bounds():
    assert remediate.validate_remediation("scale_deployment", "postgres", replicas=2)  # postgres NOT scalable
    assert remediate.validate_remediation("scale_deployment", "gateway", replicas=99)
    assert remediate.validate_remediation("patch_memory_limit", "gateway", memory_mi=16)
    assert remediate.validate_remediation("rollout_undo", "gateway; rm -rf") is not None
    assert remediate.validate_remediation("rollout_undo", "gateway") is None


def test_action_id_stable_and_param_sensitive():
    a = remediate.action_id("scale_deployment", "gateway", {"replicas": 3})
    assert a == remediate.action_id("scale_deployment", "gateway", {"replicas": 3})
    assert a != remediate.action_id("scale_deployment", "gateway", {"replicas": 4})


# ---- more validation edges ---------------------------------------------------


def test_unknown_action_is_denied():
    assert remediate.validate_remediation("delete_everything", "gateway") is not None


def test_scale_bounds_are_inclusive():
    assert remediate.validate_remediation("scale_deployment", "gateway", replicas=0) is None
    assert remediate.validate_remediation("scale_deployment", "gateway", replicas=6) is None
    assert remediate.validate_remediation("scale_deployment", "gateway", replicas=-1) is not None
    assert remediate.validate_remediation("scale_deployment", "gateway", replicas=7) is not None


def test_memory_bounds_are_inclusive():
    assert remediate.validate_remediation("patch_memory_limit", "gateway", memory_mi=64) is None
    assert remediate.validate_remediation("patch_memory_limit", "gateway", memory_mi=2048) is None
    assert remediate.validate_remediation("patch_memory_limit", "gateway", memory_mi=63) is not None
    assert remediate.validate_remediation("patch_memory_limit", "gateway", memory_mi=2049) is not None


def test_malformed_workload_names_are_denied():
    for bad in ("Gateway", "gate way", "-gateway", "gateway-", "gateway/../etc", "", "a" * 64):
        assert remediate.validate_remediation("rollout_undo", bad) is not None, bad


def test_every_allowed_workload_is_a_valid_dns_label():
    for name in remediate.ALLOWED_WORKLOADS:
        assert remediate.validate_remediation("rollout_undo", name) is None, name


def test_action_id_is_16_hex_chars():
    aid = remediate.action_id("restart_workload", "gateway", {})
    assert len(aid) == 16
    int(aid, 16)  # raises if not hex


# ---- the server-side execution gate ------------------------------------------


class _FakeCtx:
    def __init__(self, run_id: str = "run-1") -> None:
        self.run_id = run_id


@pytest.fixture
def approvals(monkeypatch):
    """Stub db.get_approval with an in-memory table the test controls."""
    store: dict[str, dict] = {}

    async def _get(run_id: str, approval_id: str):
        row = store.get(approval_id)
        if row is None or row.get("run_id") != run_id:
            return None
        return row

    monkeypatch.setattr(remediate.db, "get_approval", _get)
    return store


async def test_gate_requires_approval_id(approvals):
    result = await remediate._execute_gate(_FakeCtx(), None, "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_missing_approval_is_denied(approvals):
    result = await remediate._execute_gate(_FakeCtx(), "apr-nope", "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_wrong_run_id_is_denied(approvals):
    approvals["apr-1"] = {
        "run_id": "some-other-run", "decision": "approved",
        "summary": "scale gateway — action deadbeefdeadbeef",
    }
    result = await remediate._execute_gate(_FakeCtx("run-1"), "apr-1", "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_denied_decision_is_denied(approvals):
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "denied",
        "summary": "scale gateway — action deadbeefdeadbeef",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_wrong_fingerprint_is_denied(approvals):
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "approved",
        "summary": "scale gateway — action cafebabecafebabe",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_approved_matching_fingerprint_passes(approvals):
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "approved",
        "summary": "scale gateway 2 -> 4 — action deadbeefdeadbeef",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", "deadbeefdeadbeef")
    assert result is None


# ---- tool-level dry-run / execute wiring (fixed-argv, no shell) --------------


@pytest.fixture
def fake_kubectl(monkeypatch, tmp_path):
    kubeconfig = tmp_path / "agent-remediate.yaml"
    kubeconfig.write_text("apiVersion: v1\nkind: Config\n", encoding="utf-8")
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(remediate.config, k8s_remediate_kubeconfig=str(kubeconfig)),
    )
    calls: list[list[str]] = []

    def _run(argv, capture_output, text, timeout):
        calls.append(argv)
        out = "128Mi" if "jsonpath" in " ".join(argv) and "memory" in " ".join(argv) else "2"
        return SimpleNamespace(returncode=0, stdout=out, stderr="")

    monkeypatch.setattr(remediate.subprocess, "run", _run)
    return calls


async def test_scale_dry_run_reads_live_replicas_first(fake_kubectl):
    result = await remediate.scale_deployment(_FakeCtx(), "gateway", replicas=4, dry_run=True)
    assert result["dry_run"] is True
    assert "action_id" in result and len(result["action_id"]) == 16
    assert "2 -> 4" in result["diff"]
    assert fake_kubectl[0][3:] == ["get", "deployment", "gateway", "-n", "subject",
                                    "-o", "jsonpath={.spec.replicas}"]


async def test_scale_hard_deny_never_calls_kubectl(fake_kubectl):
    result = await remediate.scale_deployment(_FakeCtx(), "postgres", replicas=2, dry_run=True)
    assert "error" in result
    assert not fake_kubectl


async def test_scale_execute_requires_gate(fake_kubectl):
    result = await remediate.scale_deployment(_FakeCtx(), "gateway", replicas=4, dry_run=False)
    assert "error" in result
    assert not fake_kubectl  # gate rejected before any kubectl call


async def test_scale_execute_with_valid_approval_runs_scale(fake_kubectl, approvals, monkeypatch):
    aid = remediate.action_id("scale_deployment", "gateway", {"replicas": 4})
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway — action {aid}"}
    result = await remediate.scale_deployment(
        _FakeCtx(), "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True
    assert fake_kubectl[-1][3:] == ["scale", "deployment/gateway", "--replicas=4", "-n", "subject"]


async def test_restart_workload_dry_run_has_no_live_read(fake_kubectl):
    result = await remediate.restart_workload(_FakeCtx(), "gateway", dry_run=True)
    assert result["dry_run"] is True
    assert "restartedAt" in result["diff"]
    assert not fake_kubectl  # static diff — no kubectl needed for this one


async def test_rollout_abort_and_promote_use_status_subresource_merge_patch(fake_kubectl, approvals):
    for action, expected_patch in (
        (remediate.rollout_abort, '{"status":{"abort":true}}'),
        (remediate.rollout_promote, '{"status":{"promoteFull":true}}'),
    ):
        fake_kubectl.clear()
        approvals.clear()
        name = action.__name__
        aid = remediate.action_id(name, "gateway", {})
        approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                               "summary": f"{name} — action {aid}"}
        await action(_FakeCtx(), "gateway", dry_run=False, approval_id="apr-1")
        patch_calls = [c for c in fake_kubectl if "patch" in c]
        assert any(
            "--subresource=status" in c and "merge" in c and expected_patch in c
            for c in patch_calls
        ), (name, fake_kubectl)
