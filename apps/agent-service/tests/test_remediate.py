"""agent-remediate: the scoped writer identity for the on-call agent's seven
remediation tools incl. update_db_secret. Every one dry-runs first and
fingerprints its action; executing for real is gated server-side
(`_execute_gate`) on a Postgres approval row this run actually collected —
the model asserting "approved" in its own text is worth nothing without a
matching row. `validate_remediation` is the hard-deny layer: unknown
workload/action, out-of-bounds params, or a malformed name refuses
regardless of anything else (checked BEFORE any kubectl subprocess is ever
built, so an injection attempt never reaches argv)."""

from __future__ import annotations

import base64
import dataclasses
import json
from types import SimpleNamespace

import pytest

from agent_service.tools import remediate


@pytest.fixture(autouse=True)
def _clear_dryrun_stash():
    """`_DRYRUN_STASH` is a module-level registry keyed by run_id — clear it
    around every test so leftover entries from one test (or a previous run)
    can never leak into another's assertions."""
    remediate._DRYRUN_STASH.clear()
    yield
    remediate._DRYRUN_STASH.clear()


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


def test_workload_regex_is_anchored_with_z_not_dollar():
    """`$` (without re.MULTILINE) still matches just before a trailing
    newline — `gateway\\n` would satisfy `^...$` even though it carries an
    embedded newline. `\\Z` anchors to the true end of the string only."""
    assert remediate.validate_remediation("rollout_undo", "gateway\n") is not None
    assert remediate.validate_remediation("rollout_undo", "gateway\nrm -rf") is not None


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


async def test_gate_forged_bare_fingerprint_without_marker_is_denied(approvals):
    """A model could paste the bare action_id into its own request_approval
    prompt — that alone must NOT satisfy the gate. Only the server-authored
    marker (written by request_approval when it finds a matching stashed
    dry-run) proves the diff on the card is real."""
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "approved",
        "summary": "scale gateway 2 -> 4 — action deadbeefdeadbeef",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", "deadbeefdeadbeef")
    assert "error" in result


async def test_gate_approved_with_server_marker_but_no_stash_is_replay_denied(approvals):
    """The marker text alone (e.g. a stale approval whose dry-run has since
    been popped by an earlier execute) is not enough without a live stash
    entry — this is the single-use replay guard."""
    aid = "deadbeefdeadbeef"
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "approved",
        "summary": f"scale gateway{remediate.server_verified_marker(aid)}",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", aid)
    assert "error" in result
    assert "re-run dry_run" in result["error"]


async def test_gate_approved_matching_marker_and_stash_passes(approvals):
    aid = "deadbeefdeadbeef"
    remediate._stash_dryrun(_FakeCtx(), aid, "scale_deployment", "gateway", "2 -> 4")
    approvals["apr-1"] = {
        "run_id": "run-1", "decision": "approved",
        "summary": f"scale gateway{remediate.server_verified_block('run-1', aid)}",
    }
    result = await remediate._execute_gate(_FakeCtx(), "apr-1", aid)
    assert result is None
    # stash entry is still present after gate passes; it will be consumed by
    # _consume_dryrun after a successful execute
    assert remediate.server_verified_block("run-1", aid) is not None


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
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}
    result = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True
    assert fake_kubectl[-1][3:] == ["scale", "deployment/gateway", "--replicas=4", "-n", "subject"]


async def test_scale_replay_of_same_approval_is_rejected_after_execute(fake_kubectl, approvals):
    """A second dry_run=false call reusing the same approval_id must fail —
    the stash entry that made the first execute's marker meaningful was
    consumed single-use by _consume_dryrun."""
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}
    first = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert first.get("executed") is True

    replay = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert "error" in replay
    assert "re-run dry_run" in replay["error"]


async def test_scale_failed_execute_retains_stash_for_retry(fake_kubectl, approvals, monkeypatch):
    """When a kubectl execute fails (error in result), the stash entry is
    retained, allowing a retry with the same approval_id to pass the gate and
    try the mutation again."""
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}

    # First execute fails: stub kubectl to return an error
    def _run_fails(argv, capture_output, text, timeout):
        return SimpleNamespace(returncode=1, stdout="", stderr="kubectl error: connection refused")

    monkeypatch.setattr(remediate.subprocess, "run", _run_fails)
    failed = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert "error" in failed
    # stash entry is still there because execute failed
    assert remediate.server_verified_block(ctx.run_id, aid) is not None

    # Second attempt with same approval succeeds: stash was retained
    def _run_succeeds(argv, capture_output, text, timeout):
        return SimpleNamespace(returncode=0, stdout="deployment.apps/gateway scaled", stderr="")

    monkeypatch.setattr(remediate.subprocess, "run", _run_succeeds)
    retry = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert retry.get("executed") is True
    # now stash is gone
    assert remediate.server_verified_block(ctx.run_id, aid) is None


# ---- machine-recorded remediation (PLAN-2 P11 Task 10) ----------------------


@pytest.fixture
def recorder(monkeypatch):
    """Stub db.incident_for_run/add_timeline/set_verify_deadline with an
    in-memory recorder the test can assert against."""
    calls = {"incident_for_run": [], "add_timeline": [], "set_verify_deadline": []}
    incident_id_box = {"value": "inc_1"}

    async def _incident_for_run(run_id):
        calls["incident_for_run"].append(run_id)
        return incident_id_box["value"]

    async def _add_timeline(incident_id, entries):
        calls["add_timeline"].append((incident_id, entries))

    async def _set_verify_deadline(incident_id, deadline):
        calls["set_verify_deadline"].append((incident_id, deadline))

    monkeypatch.setattr(remediate.db, "incident_for_run", _incident_for_run)
    monkeypatch.setattr(remediate.db, "add_timeline", _add_timeline)
    monkeypatch.setattr(remediate.db, "set_verify_deadline", _set_verify_deadline)
    calls["incident_id_box"] = incident_id_box
    return calls


async def test_successful_execute_records_timeline_and_deadline(fake_kubectl, approvals, recorder):
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}
    result = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True

    assert recorder["incident_for_run"] == ["run-1"]
    assert len(recorder["add_timeline"]) == 1
    incident_id, entries = recorder["add_timeline"][0]
    assert incident_id == "inc_1"
    assert len(entries) == 1
    _ts, source, label = entries[0]
    assert source == "remediation"
    assert "scale_deployment gateway executed (run run-1)" == label
    assert len(recorder["set_verify_deadline"]) == 1
    assert recorder["set_verify_deadline"][0][0] == "inc_1"


async def test_failed_execute_does_not_record_remediation(fake_kubectl, approvals, recorder, monkeypatch):
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}

    def _run_fails(argv, capture_output, text, timeout):
        return SimpleNamespace(returncode=1, stdout="", stderr="kubectl error")

    monkeypatch.setattr(remediate.subprocess, "run", _run_fails)
    result = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert "error" in result
    assert recorder["incident_for_run"] == []
    assert recorder["add_timeline"] == []
    assert recorder["set_verify_deadline"] == []


async def test_no_linked_incident_skips_timeline_and_deadline(fake_kubectl, approvals, recorder):
    recorder["incident_id_box"]["value"] = None
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}
    result = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True
    assert recorder["incident_for_run"] == ["run-1"]
    assert recorder["add_timeline"] == []
    assert recorder["set_verify_deadline"] == []


async def test_db_failure_during_recording_does_not_fail_the_tool_result(
    fake_kubectl, approvals, monkeypatch
):
    """A DB hiccup while machine-recording the remediation must degrade to a
    log line, not surface as an error on the already-successful tool result."""
    async def _boom(*a, **k):
        raise RuntimeError("db pool not initialised")

    monkeypatch.setattr(remediate.db, "incident_for_run", _boom)
    ctx = _FakeCtx()
    dry = await remediate.scale_deployment(ctx, "gateway", replicas=4, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"scale gateway{block}"}
    result = await remediate.scale_deployment(
        ctx, "gateway", replicas=4, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True


async def test_request_approval_action_id_without_stash_errors():
    """What sdk.py's request_approval tool does when the model passes an
    action_id that was never dry-run for this run: server_verified_block
    returns None, and the tool must surface an error instead of persisting
    an approval with nothing verified behind it."""
    assert remediate.server_verified_block("run-1", "never-dry-run") is None


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
        # Simulate a prior dry-run having stashed a diff for this action_id —
        # the diff-builder itself (which calls backends.rollout_status, not
        # remediate._kubectl) is exercised separately; this test's focus is
        # the merge-patch argv shape.
        remediate._stash_dryrun(_FakeCtx(), aid, name, "gateway", "would patch ...")
        approvals["apr-1"] = {
            "run_id": "run-1", "decision": "approved",
            "summary": f"{name}{remediate.server_verified_block('run-1', aid)}",
        }
        await action(_FakeCtx(), "gateway", dry_run=False, approval_id="apr-1")
        patch_calls = [c for c in fake_kubectl if "patch" in c]
        assert any(
            "--subresource=status" in c and "merge" in c and expected_patch in c
            for c in patch_calls
        ), (name, fake_kubectl)


# ---- rollout_undo's dry-run diff builder (kubectl rollout history parsing) --


@pytest.fixture
def fake_kubectl_rollout_history(monkeypatch, tmp_path):
    """Canned `kubectl rollout history` output (the revision list, then one
    `--revision=N` detail call per revision) so `_rollout_undo_diff`'s regex
    parsing (`_REVISION_RE`, `_IMAGE_RE`) runs against realistic text."""
    kubeconfig = tmp_path / "agent-remediate.yaml"
    kubeconfig.write_text("apiVersion: v1\nkind: Config\n", encoding="utf-8")
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(remediate.config, k8s_remediate_kubeconfig=str(kubeconfig)),
    )
    calls: list[list[str]] = []

    def _run(argv, capture_output, text, timeout):
        calls.append(argv)
        joined = " ".join(argv)
        if "--revision=2" in joined:
            out = (
                "deployment.apps/gateway with revision #2\n"
                "Pod Template:\n"
                "  Containers:\n"
                "   gateway:\n"
                "    Image:\tregistry.local/gateway:v2\n"
            )
        elif "--revision=1" in joined:
            out = (
                "deployment.apps/gateway with revision #1\n"
                "Pod Template:\n"
                "  Containers:\n"
                "   gateway:\n"
                "    Image:\tregistry.local/gateway:v1\n"
            )
        else:
            out = (
                "deployment.apps/gateway\n"
                "REVISION  CHANGE-CAUSE\n"
                "1         <none>\n"
                "2         <none>\n"
            )
        return SimpleNamespace(returncode=0, stdout=out, stderr="")

    monkeypatch.setattr(remediate.subprocess, "run", _run)
    return calls


async def test_rollout_undo_dry_run_diff_names_both_revisions_and_images(
    fake_kubectl_rollout_history,
):
    result = await remediate.rollout_undo(_FakeCtx(), "gateway", dry_run=True)
    assert result["dry_run"] is True
    diff = result["diff"]
    assert "revision 2" in diff and "revision 1" in diff
    assert "registry.local/gateway:v2" in diff
    assert "registry.local/gateway:v1" in diff
    # stashed for a later request_approval/execute round
    stashed = remediate.server_verified_block("run-1", result["action_id"])
    assert stashed is not None
    assert diff in stashed


async def test_rollout_undo_dry_run_with_only_one_revision_reports_no_previous(
    fake_kubectl_rollout_history, monkeypatch
):
    def _one_revision(argv, capture_output, text, timeout):
        return SimpleNamespace(
            returncode=0,
            stdout="deployment.apps/gateway\nREVISION  CHANGE-CAUSE\n1         <none>\n",
            stderr="",
        )

    monkeypatch.setattr(remediate.subprocess, "run", _one_revision)
    result = await remediate.rollout_undo(_FakeCtx(), "gateway", dry_run=True)
    assert result["dry_run"] is True
    assert "no previous revision" in result["diff"]


# ---- patch_memory_limit: dry-run diff + execute merge-patch body ------------


async def test_memory_dry_run_reads_live_limit_first(fake_kubectl):
    result = await remediate.patch_memory_limit(_FakeCtx(), "gateway", memory_mi=512, dry_run=True)
    assert result["dry_run"] is True
    assert "action_id" in result and len(result["action_id"]) == 16
    assert "limits.memory: 128Mi -> 512Mi" in result["diff"]
    assert fake_kubectl[0][3:] == [
        "get", "deployment", "gateway", "-n", "subject", "-o",
        'jsonpath={.spec.template.spec.containers[?(@.name=="gateway")].resources.limits.memory}',
    ]


async def test_memory_execute_sends_merge_patch_with_container_name_and_limit(
    fake_kubectl, approvals
):
    ctx = _FakeCtx()
    dry = await remediate.patch_memory_limit(ctx, "gateway", memory_mi=512, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"bump gateway memory{block}"}
    result = await remediate.patch_memory_limit(
        ctx, "gateway", memory_mi=512, dry_run=False, approval_id="apr-1"
    )
    assert result.get("executed") is True

    patch_call = fake_kubectl[-1]
    assert patch_call[3:8] == ["patch", "deployment", "gateway", "-n", "subject"]
    assert "--type" in patch_call
    assert patch_call[patch_call.index("--type") + 1] == "merge"
    body = json.loads(patch_call[patch_call.index("-p") + 1])
    assert body == {
        "spec": {"template": {"spec": {"containers": [
            {"name": "gateway", "resources": {"limits": {"memory": "512Mi"}}}
        ]}}}
    }


# ---- update_db_secret: reads the lab vault, never leaks the password -------


async def test_update_db_secret_vault_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(remediate.config, vault_file=str(tmp_path / "no-such-vault.txt")),
    )
    result = await remediate.update_db_secret(_FakeCtx(), dry_run=True)
    assert result == {"error": "no rotated credential found in the vault — nothing to sync"}


@pytest.fixture
def fake_kubectl_secret(monkeypatch, tmp_path):
    """A kubeconfig that exists (so `_kubectl` proceeds) plus a stubbed
    `kubectl get secret ... -o json` response with a known OLD password, and
    a vault file holding a known NEW (rotated) password — neither of which
    may ever appear in a returned dict or stash entry."""
    kubeconfig = tmp_path / "agent-remediate.yaml"
    kubeconfig.write_text("apiVersion: v1\nkind: Config\n", encoding="utf-8")
    vault = tmp_path / "db-vault.txt"
    new_password = "rotated-secretpw123"
    vault.write_text(f"{new_password}\n", encoding="utf-8")
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(
            remediate.config,
            k8s_remediate_kubeconfig=str(kubeconfig),
            vault_file=str(vault),
        ),
    )
    old_password = "old-plaintextpw"
    secret_json = {
        "data": {
            "POSTGRES_PASSWORD": base64.b64encode(old_password.encode()).decode(),
            "DATABASE_URL": base64.b64encode(
                f"postgres://lab:{old_password}@postgres:5432/observability_lab".encode()
            ).decode(),
        }
    }
    calls: list[list[str]] = []

    def _run(argv, capture_output, text, timeout):
        calls.append(argv)
        return SimpleNamespace(returncode=0, stdout=json.dumps(secret_json), stderr="")

    monkeypatch.setattr(remediate.subprocess, "run", _run)
    return calls, old_password, new_password


async def test_update_db_secret_dry_run_masks_password_everywhere(fake_kubectl_secret):
    calls, old_password, new_password = fake_kubectl_secret
    result = await remediate.update_db_secret(_FakeCtx(), dry_run=True)
    assert result["dry_run"] is True
    assert result["vault_checked"] is True
    assert result["target"] == "secret/subject-db-credentials"
    assert "action_id" in result and len(result["action_id"]) == 16
    assert "POSTGRES_PASSWORD: ****" in result["diff"]
    assert "DATABASE_URL: (rebuilt with rotated password)" in result["diff"]

    dumped = json.dumps(result)
    assert new_password not in dumped
    assert old_password not in dumped

    # the server-side stash (what request_approval quotes back) must be clean too
    stash_entry = remediate._DRYRUN_STASH["run-1"][result["action_id"]]
    stash_dumped = json.dumps(stash_entry)
    assert new_password not in stash_dumped
    assert old_password not in stash_dumped

    assert calls[0][3:] == [
        "get", "secret", "subject-db-credentials", "-n", "subject", "-o", "json",
    ]


async def test_update_db_secret_execute_patches_secret_with_base64_data(
    fake_kubectl_secret, approvals
):
    calls, _old_password, new_password = fake_kubectl_secret
    ctx = _FakeCtx()
    dry = await remediate.update_db_secret(ctx, dry_run=True)
    aid = dry["action_id"]
    block = remediate.server_verified_block(ctx.run_id, aid)
    approvals["apr-1"] = {"run_id": "run-1", "decision": "approved",
                           "summary": f"sync db secret from vault{block}"}
    result = await remediate.update_db_secret(ctx, dry_run=False, approval_id="apr-1")
    assert result.get("executed") is True
    assert "restart" in result["result"]
    assert "gateway" in result["result"] and "retriever" in result["result"]

    dumped = json.dumps(result)
    assert new_password not in dumped

    patch_call = calls[-1]
    assert patch_call[3:7] == ["patch", "secret", "subject-db-credentials", "-n"]
    assert patch_call[patch_call.index("--type") + 1] == "merge"
    body = json.loads(patch_call[patch_call.index("-p") + 1])
    assert base64.b64decode(body["data"]["POSTGRES_PASSWORD"]).decode() == new_password
    expected_url = f"postgres://lab:{new_password}@postgres:5432/observability_lab"
    assert base64.b64decode(body["data"]["DATABASE_URL"]).decode() == expected_url


async def test_update_db_secret_vault_missing_at_execute_time_too(monkeypatch, tmp_path):
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(remediate.config, vault_file=str(tmp_path / "gone.txt")),
    )
    result = await remediate.update_db_secret(_FakeCtx(), dry_run=False, approval_id="whatever")
    assert result == {"error": "no rotated credential found in the vault — nothing to sync"}


async def test_update_db_secret_vault_empty_or_whitespace(monkeypatch, tmp_path):
    """Vault file exists but is empty or contains only whitespace — same
    'nothing to sync' error as if the file were missing."""
    vault = tmp_path / "db-vault.txt"
    vault.write_text("   \n  \n", encoding="utf-8")
    monkeypatch.setattr(
        remediate, "config",
        dataclasses.replace(remediate.config, vault_file=str(vault)),
    )
    result = await remediate.update_db_secret(_FakeCtx(), dry_run=True)
    assert result == {"error": "no rotated credential found in the vault — nothing to sync"}


async def test_update_db_secret_fingerprint_binds_to_vault_content(
    fake_kubectl_secret, approvals, monkeypatch
):
    """Vault password changes between dry-run and execute: the action_id
    changes, so the old approval is no longer valid for the new password."""
    calls, _old_password, original_password = fake_kubectl_secret

    # Step 1: dry-run with password A
    ctx = _FakeCtx()
    dry_a = await remediate.update_db_secret(ctx, dry_run=True)
    aid_a = dry_a["action_id"]
    block_a = remediate.server_verified_block(ctx.run_id, aid_a)
    approvals["apr-1"] = {
        "run_id": "run-1",
        "decision": "approved",
        "summary": f"sync db secret from vault{block_a}",
    }

    # Step 2: vault rotates to password B
    vault_path = remediate.config.vault_file
    new_password_b = "different-rotated-pw456"
    with open(vault_path, "w", encoding="utf-8") as fh:
        fh.write(new_password_b)

    # Step 3: re-dry-run yields a DIFFERENT action_id (bound to password B)
    dry_b = await remediate.update_db_secret(ctx, dry_run=True)
    aid_b = dry_b["action_id"]
    assert aid_b != aid_a, "action_id should change when vault content changes"

    # Step 4: try to execute with the OLD approval (for password A) → gate rejects
    # because aid_a is no longer valid (vault changed); the approval carries the
    # marker for aid_a, not for the current aid_b
    result = await remediate.update_db_secret(ctx, dry_run=False, approval_id="apr-1")
    assert "error" in result
    assert "requires an approved request_approval" in result["error"]
