"""Scoped remediation tools for the on-call agent (PLAN-2 P11 Task 8).

Two identities do two different jobs: the READ tools (kubectl_read, k8s_events,
rollout_status, ...) run as `agent-ro` — cluster-wide view, no writes. These
seven tools are the only place the on-call agent can ever MUTATE the cluster,
and they run as a second, far narrower identity: `agent-remediate`
(infra/k8s/cluster/agent-remediate.yaml), whose Role is scoped to namespace
`subject` and to exactly the verbs each tool needs (deployments/scale,
deployments/rollouts patch, and get+patch on ONE named Secret,
subject-db-credentials, used only by `update_db_secret`). Every kubectl
invocation here is a fixed argv, no shell — same pattern as
`backends.kubectl_read` — with `-n subject` hard-coded; nothing here ever
takes a namespace argument from the model.

Two independent gates sit in front of every mutation:

1. `validate_remediation` (pure, hard-deny): unknown action, a workload
   outside `ALLOWED_WORKLOADS`, an out-of-bounds param, or a malformed name
   refuses BEFORE any subprocess is ever built — an injection-shaped workload
   string never reaches argv.
2. `_execute_gate` (server-side, stateful): every tool defaults to
   `dry_run=True`, which only reads live state, returns a diff + an
   `action_id` fingerprint (sha256 of action+workload+params), AND stashes
   that diff server-side (`_stash_dryrun`) keyed by (run_id, action_id).
   Executing for real requires an `approval_id` naming a row in
   `agent_approvals` for THIS run, with `decision == "approved"` and a
   `summary` that contains the SERVER-authored marker
   (`server_verified_marker`) for that action_id — not merely the bare
   fingerprint. Only `request_approval` (tools/sdk.py), given an `action_id`
   with a matching stashed dry-run, ever writes that marker, by appending the
   stashed diff to the model's prompt before the approval is persisted. A
   model asserting approval — or pasting a bare action_id — in its own text
   satisfies neither the marker check nor the stash, which is popped
   single-use on a successful execute so an approval can't be replayed.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import re
import subprocess
from typing import Any

from .. import db
from ..config import config
from ..context import RunContext
from . import backends

# ---- hard-deny surface -------------------------------------------------------

ALLOWED_WORKLOADS = {"gateway", "model-proxy", "retriever", "embedder", "load-generator"}
SCALE_MIN, SCALE_MAX = 0, 6
MEM_MIN_MI, MEM_MAX_MI = 64, 2048
HARD_DENY_MESSAGE = "denied: outside the remediation allow-list"

# DNS-1123 label — the same shape a Kubernetes object name must have. Anything
# that doesn't match (spaces, `;`, path separators, leading/trailing `-`, over
# length) is refused before it can be interpolated into an argv element.
_WORKLOAD_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\Z")

_ACTIONS = {
    "rollout_undo",
    "rollout_abort",
    "rollout_promote",
    "scale_deployment",
    "patch_memory_limit",
    "restart_workload",
}


def validate_remediation(action: str, workload: str, **params: Any) -> str | None:
    """Pure hard-deny gate. Returns an error string (any of: unknown action,
    malformed/unknown workload, out-of-bounds param) or None when the call is
    allowed to proceed to a dry-run/execute. Checked FIRST, unconditionally —
    nothing downstream can override a deny here."""
    if action not in _ACTIONS:
        return f"denied: unknown remediation action {action!r}"
    if not workload or not _WORKLOAD_RE.match(workload):
        return f"denied: invalid workload name {workload!r}"
    if workload not in ALLOWED_WORKLOADS:
        return HARD_DENY_MESSAGE
    if action == "scale_deployment":
        replicas = params.get("replicas")
        if not isinstance(replicas, int) or isinstance(replicas, bool) or not (
            SCALE_MIN <= replicas <= SCALE_MAX
        ):
            return f"denied: replicas must be an integer between {SCALE_MIN} and {SCALE_MAX}"
    if action == "patch_memory_limit":
        memory_mi = params.get("memory_mi")
        if not isinstance(memory_mi, int) or isinstance(memory_mi, bool) or not (
            MEM_MIN_MI <= memory_mi <= MEM_MAX_MI
        ):
            return f"denied: memory_mi must be an integer between {MEM_MIN_MI} and {MEM_MAX_MI}"
    return None


def action_id(action: str, workload: str, params: dict) -> str:
    """Pure fingerprint of one proposed mutation: sha256(action, workload,
    sorted params)[:16]. Stable for identical inputs, sensitive to any param
    change — this is the string `_execute_gate` requires an approval's summary
    to quote back verbatim."""
    payload = json.dumps(
        {"action": action, "workload": workload, "params": params}, sort_keys=True, default=str
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


# ---- server-side dry-run registry -------------------------------------------
#
# Every dry-run's diff is recorded here, server-side, keyed by (run_id,
# action_id). This is what lets `request_approval` attach a SERVER-authored
# verified block to the approval card instead of trusting whatever diff text
# the model chose to paste into its own prompt, and what lets `_execute_gate`
# demand that the approved summary actually carries that server marker —
# forging the bare action_id into a summary is no longer enough. Bounded per
# run (a stuck/looping run can't grow this without bound) and single-use
# (`_execute_gate` pops the entry on a successful execute, so a replayed
# approval_id can't authorize a second real mutation without a fresh dry-run).

_DRYRUN_STASH: dict[str, dict[str, dict]] = {}
_STASH_CAP_PER_RUN = 16


def _stash_dryrun(ctx: RunContext, action_id: str, action: str, target: str, diff: str) -> None:
    """Record one dry-run result for this run. Caps at `_STASH_CAP_PER_RUN`
    entries per run, evicting the oldest when a NEW action_id would exceed
    it (re-dry-running an already-stashed action_id just refreshes its
    value in place, without consuming a slot)."""
    run_stash = _DRYRUN_STASH.setdefault(ctx.run_id, {})
    run_stash[action_id] = {"action": action, "target": target, "diff": diff}
    while len(run_stash) > _STASH_CAP_PER_RUN:
        oldest = next(iter(run_stash))
        del run_stash[oldest]


def _peek_dryrun(run_id: str, action_id: str) -> dict | None:
    return _DRYRUN_STASH.get(run_id, {}).get(action_id)


def _pop_dryrun(run_id: str, action_id: str) -> dict | None:
    run_stash = _DRYRUN_STASH.get(run_id)
    if not run_stash:
        return None
    return run_stash.pop(action_id, None)


def _consume_dryrun(ctx: RunContext, action_id: str, result: dict) -> dict:
    """Pop the dry-run stash entry only when the mutation succeeded. If result
    contains an "error" key, the stash entry is retained so a retry with the
    same approval can proceed. Returns result unchanged."""
    if "error" not in result:
        _pop_dryrun(ctx.run_id, action_id)
    return result


def server_verified_marker(action_id: str) -> str:
    """The server-controlled substring `_execute_gate` requires an approved
    summary to contain — a model can paste this text into its own prompt,
    but only `request_approval`-with-a-matching-stashed-`action_id` ever
    puts it there for real, and only alongside the real diff."""
    return f"--- server-verified dry-run [{action_id}] ---"


def server_verified_block(run_id: str, action_id: str) -> str | None:
    """The block `request_approval` appends to the model's prompt summary
    when it's given an `action_id` that has a stashed dry-run for this run.
    Returns None when nothing is stashed (unknown action_id, wrong run, or
    never dry-run) — the caller should refuse rather than fabricate one."""
    entry = _peek_dryrun(run_id, action_id)
    if entry is None:
        return None
    return (
        f"\n\n{server_verified_marker(action_id)}\n"
        f"{entry['action']} {entry['target']}\n"
        f"{entry['diff']}"
    )


# ---- fixed-argv kubectl against the agent-remediate identity ----------------


async def _kubectl(args: list[str]) -> dict:
    """One kubectl call, fixed argv (no shell), the agent-remediate
    kubeconfig, namespace always hard-coded by the caller (never taken from
    the model)."""
    kubeconfig = config.k8s_remediate_kubeconfig
    if not os.path.exists(kubeconfig):
        return {"error": "no remediation credentials: run `obs k8s agent-remediate-kubeconfig` first"}
    argv = ["kubectl", "--kubeconfig", kubeconfig, *args]
    try:
        proc = await asyncio.to_thread(
            subprocess.run, argv, capture_output=True, text=True, timeout=30
        )
    except subprocess.TimeoutExpired:
        return {"error": "kubectl timed out after 30s"}
    except FileNotFoundError:
        return {"error": "kubectl is not installed on the agent-service host"}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"kubectl failed: {exc}"}
    out = (proc.stdout or "").strip()
    if proc.returncode != 0:
        return {"error": (proc.stderr or "").strip()[:500] or f"kubectl exited {proc.returncode}"}
    return {"output": out}


# ---- the server-side execution gate ------------------------------------------


async def _execute_gate(ctx: RunContext, approval_id: str | None, expected_action_id: str) -> dict | None:
    """Returns None when execution may proceed, else the `{"error": ...}` dict
    the caller should return verbatim. Loads the approval row for THIS run
    from Postgres (db.get_approval) — never trusts anything the model merely
    claims — and requires decision == 'approved' AND the row's summary to
    contain the SERVER marker (`server_verified_marker`) for the exact
    dry-run action_id, not merely the bare fingerprint: a model can paste a
    bare action_id into its own prompt, but only `request_approval` ever
    writes the marker, and only when a real dry-run for that action_id was
    stashed for this run. Single-use semantics preserved by `_consume_dryrun`,
    which pops the stash entry only after the mutation succeeds."""
    deny = {
        "error": "execution requires an approved request_approval whose summary "
        "includes the server-verified dry-run marker for this action_id"
    }
    if not approval_id:
        return deny
    approval = await db.get_approval(ctx.run_id, approval_id)
    if approval is None:
        return deny
    if approval.get("decision") != "approved":
        return deny
    marker = server_verified_marker(expected_action_id)
    if marker not in (approval.get("summary") or ""):
        return deny
    if _peek_dryrun(ctx.run_id, expected_action_id) is None:
        return {"error": "no server-verified dry-run pending; re-run dry_run"}
    return None


def _dry_run_result(action: str, workload: str, aid: str, diff: str) -> dict:
    return {
        "action": action,
        "target": workload,
        "dry_run": True,
        "action_id": aid,
        "diff": diff,
        "next": "call request_approval with a one-sentence summary AND this action_id (the "
                "server attaches the verified diff for you — do not paste the diff yourself), "
                "then re-call with dry_run=false, this action_id, and the returned approval_id",
    }


def _executed_result(action: str, workload: str, result: str) -> dict:
    return {"action": action, "target": workload, "executed": True, "result": result}


# ---- diff builders (dry-run: read live state, never mutate) -----------------


async def _scale_diff(workload: str, replicas: int) -> str:
    current = await _kubectl(
        ["get", "deployment", workload, "-n", "subject", "-o", "jsonpath={.spec.replicas}"]
    )
    if "error" in current:
        return f"could not read current replicas ({current['error']}); proposed: {replicas}"
    cur = current.get("output", "").strip() or "?"
    return f"spec.replicas: {cur} -> {replicas}"


async def _memory_diff(workload: str, memory_mi: int) -> str:
    jsonpath = (
        "jsonpath={.spec.template.spec.containers[?(@.name==\"" + workload + "\")]"
        ".resources.limits.memory}"
    )
    current = await _kubectl(["get", "deployment", workload, "-n", "subject", "-o", jsonpath])
    if "error" in current:
        return f"could not read current memory limit ({current['error']}); proposed: {memory_mi}Mi"
    cur = current.get("output", "").strip() or "(none)"
    return f"limits.memory: {cur} -> {memory_mi}Mi"


_REVISION_RE = re.compile(r"^(\d+)\s", re.MULTILINE)
_IMAGE_RE = re.compile(r"Image:\s*(\S+)")


async def _rollout_undo_diff(workload: str) -> str:
    hist = await _kubectl(["rollout", "history", f"deployment/{workload}", "-n", "subject"])
    if "error" in hist:
        return f"could not read rollout history: {hist['error']}"
    revisions = sorted({int(m) for m in _REVISION_RE.findall(hist.get("output", ""))})
    if len(revisions) < 2:
        return "only one revision on record; deployment/{} has no previous revision to undo to".format(
            workload
        )
    current, previous = revisions[-1], revisions[-2]

    async def _image_at(rev: int) -> str:
        detail = await _kubectl(
            ["rollout", "history", f"deployment/{workload}", "-n", "subject", f"--revision={rev}"]
        )
        match = _IMAGE_RE.search(detail.get("output", ""))
        return match.group(1) if match else "?"

    current_image, previous_image = await asyncio.gather(_image_at(current), _image_at(previous))
    return (
        f"revision {current} ({current_image}) -> revision {previous} ({previous_image}) "
        "[undo target: rolls back to the previous revision]"
    )


async def _rollout_phase_diff(workload: str, patch_desc: str) -> str:
    status = await backends.rollout_status(workload)
    if "error" in status:
        state = f"could not read rollout status ({status['error']})"
    else:
        state = f"phase={status.get('phase')} step={status.get('step')} aborted={status.get('aborted')}"
    return f"{state}; {patch_desc}"


# ---- the seven remediation tools ---------------------------------------------


async def rollout_undo(ctx: RunContext, workload: str, dry_run: bool = True,
                        approval_id: str | None = None) -> dict:
    """Roll `deployment/<workload>` back to its previous revision
    (`kubectl rollout undo`)."""
    action = "rollout_undo"
    err = validate_remediation(action, workload)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {})
    if dry_run:
        diff = await _rollout_undo_diff(workload)
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    res = await _kubectl(["rollout", "undo", f"deployment/{workload}", "-n", "subject"])
    final_result = res if "error" in res else _executed_result(action, workload, res.get("output", ""))
    return _consume_dryrun(ctx, aid, final_result)


async def rollout_abort(ctx: RunContext, workload: str, dry_run: bool = True,
                         approval_id: str | None = None) -> dict:
    """Abort the canary in progress: merge-patch the Rollout's status
    subresource with `{"status":{"abort":true}}` (confirmed against the
    kubectl-argo-rollouts plugin source — this is exactly what
    `kubectl argo rollouts abort` issues)."""
    action = "rollout_abort"
    err = validate_remediation(action, workload)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {})
    patch = '{"status":{"abort":true}}'
    if dry_run:
        diff = await _rollout_phase_diff(
            workload, f'would patch Rollout status (merge, --subresource=status): {patch}'
        )
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    res = await _kubectl(
        ["patch", "rollout", workload, "-n", "subject", "--subresource=status",
         "--type", "merge", "-p", patch]
    )
    final_result = res if "error" in res else _executed_result(action, workload, res.get("output", ""))
    return _consume_dryrun(ctx, aid, final_result)


async def rollout_promote(ctx: RunContext, workload: str, dry_run: bool = True,
                           approval_id: str | None = None) -> dict:
    """Fully promote a paused/canarying Rollout, skipping remaining
    steps/analysis (the `--full` behaviour of `kubectl argo rollouts
    promote`): merge-patch `spec.paused=false` on the main resource, then
    `status.promoteFull=true` on the status subresource — confirmed against
    the plugin source, which issues these as two separate merge patches."""
    action = "rollout_promote"
    err = validate_remediation(action, workload)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {})
    spec_patch = '{"spec":{"paused":false}}'
    status_patch = '{"status":{"promoteFull":true}}'
    if dry_run:
        diff = await _rollout_phase_diff(
            workload,
            f"would patch Rollout spec (merge): {spec_patch}, then status "
            f"(merge, --subresource=status): {status_patch}",
        )
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    spec_res = await _kubectl(
        ["patch", "rollout", workload, "-n", "subject", "--type", "merge", "-p", spec_patch]
    )
    if "error" in spec_res:
        return _consume_dryrun(ctx, aid, spec_res)
    status_res = await _kubectl(
        ["patch", "rollout", workload, "-n", "subject", "--subresource=status",
         "--type", "merge", "-p", status_patch]
    )
    if "error" in status_res:
        return _consume_dryrun(ctx, aid, status_res)
    combined = "\n".join(t for t in (spec_res.get("output", ""), status_res.get("output", "")) if t)
    return _consume_dryrun(ctx, aid, _executed_result(action, workload, combined))


async def scale_deployment(ctx: RunContext, workload: str, replicas: int, dry_run: bool = True,
                            approval_id: str | None = None) -> dict:
    """Scale `deployment/<workload>` to `replicas` (0..6) via the scale
    subresource (`kubectl scale`)."""
    action = "scale_deployment"
    err = validate_remediation(action, workload, replicas=replicas)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {"replicas": replicas})
    if dry_run:
        diff = await _scale_diff(workload, replicas)
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    res = await _kubectl(
        ["scale", f"deployment/{workload}", f"--replicas={replicas}", "-n", "subject"]
    )
    final_result = res if "error" in res else _executed_result(action, workload, res.get("output", ""))
    return _consume_dryrun(ctx, aid, final_result)


async def patch_memory_limit(ctx: RunContext, workload: str, memory_mi: int, dry_run: bool = True,
                              approval_id: str | None = None) -> dict:
    """Patch `deployment/<workload>`'s container memory LIMIT (64..2048 Mi;
    the container name is assumed to match the workload name, true for every
    entry in ALLOWED_WORKLOADS)."""
    action = "patch_memory_limit"
    err = validate_remediation(action, workload, memory_mi=memory_mi)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {"memory_mi": memory_mi})
    if dry_run:
        diff = await _memory_diff(workload, memory_mi)
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    patch = json.dumps({
        "spec": {"template": {"spec": {"containers": [
            {"name": workload, "resources": {"limits": {"memory": f"{memory_mi}Mi"}}}
        ]}}}
    })
    res = await _kubectl(["patch", "deployment", workload, "-n", "subject", "--type", "merge", "-p", patch])
    final_result = res if "error" in res else _executed_result(action, workload, res.get("output", ""))
    return _consume_dryrun(ctx, aid, final_result)


async def restart_workload(ctx: RunContext, workload: str, dry_run: bool = True,
                            approval_id: str | None = None) -> dict:
    """Rolling-restart `deployment/<workload>` (stamps the
    `kubectl.kubernetes.io/restartedAt` pod-template annotation — no spec
    change, so this never needs a live read to describe)."""
    action = "restart_workload"
    err = validate_remediation(action, workload)
    if err:
        return {"error": err}
    aid = action_id(action, workload, {})
    if dry_run:
        diff = (
            "would patch spec.template annotation kubectl.kubernetes.io/restartedAt "
            "(rolling restart, no spec change)"
        )
        _stash_dryrun(ctx, aid, action, workload, diff)
        return _dry_run_result(action, workload, aid, diff)
    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    res = await _kubectl(["rollout", "restart", f"deployment/{workload}", "-n", "subject"])
    final_result = res if "error" in res else _executed_result(action, workload, res.get("output", ""))
    return _consume_dryrun(ctx, aid, final_result)


# ---- update_db_secret: sync the K8s Secret from the lab vault ---------------
#
# The flagship stale-secret incident (PLAN-2 P11 Task 9): `obs fail
# stale-secret` rotates the in-cluster Postgres password WITHOUT touching the
# K8s Secret; pooled connections keep working until the pool's max_lifetime
# (60s) recycles them, then gateway/retriever start failing auth. This tool
# is the remediation — it syncs the Secret from the lab's "vault" (a
# host-side file standing in for a real secrets vault), behind the same
# dry-run/approval-gate/execute flow as the other six. Unlike those six, it
# takes no `workload` param: the target is always the one Secret RBAC allows
# (get/patch, resourceNames: [subject-db-credentials]).

_DB_SECRET_NAME = "subject-db-credentials"


def _sha8(value: str) -> str:
    """First 8 hex chars of sha256(value) — enough to prove a value changed
    (or didn't) across a diff without ever printing the value itself."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:8]


def _b64(value: str) -> str:
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _read_vault() -> str | None:
    """Read the rotated password `obs fail stale-secret` wrote to the lab
    vault file, or None when there's nothing there (file missing, or empty
    after stripping whitespace)."""
    path = config.vault_file
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            password = fh.read().strip()
    except OSError:
        return None
    return password or None


async def _current_db_password() -> tuple[str | None, str | None]:
    """Read the CURRENT (stale) POSTGRES_PASSWORD off the live Secret via the
    agent-remediate identity, for the masked before/after diff. Returns
    (password, error) — never raises; a read failure just degrades the diff
    to an unknown old value rather than blocking the dry-run."""
    current = await _kubectl(["get", "secret", _DB_SECRET_NAME, "-n", "subject", "-o", "json"])
    if "error" in current:
        return None, current["error"]
    try:
        secret_json = json.loads(current.get("output", "") or "{}")
    except json.JSONDecodeError:
        return None, "kubectl returned unparseable JSON for the current secret"
    encoded = (secret_json.get("data") or {}).get("POSTGRES_PASSWORD", "")
    if not encoded:
        return None, "current secret has no POSTGRES_PASSWORD key"
    try:
        return base64.b64decode(encoded).decode("utf-8"), None
    except Exception as exc:  # noqa: BLE001
        return None, f"could not decode current POSTGRES_PASSWORD: {exc}"


async def update_db_secret(ctx: RunContext, dry_run: bool = True,
                            approval_id: str | None = None) -> dict:
    """Sync `secret/subject-db-credentials`'s POSTGRES_PASSWORD + DATABASE_URL
    from the rotated credential in the lab's vault file. The literal
    password is read here and used ONLY to build the base64 patch payload
    sent to kubectl on execute — it is never put into a diff, a stash entry,
    an approval summary, or any returned dict; every human/model-facing
    value is a masked `****<sha8>`."""
    action = "update_db_secret"
    target = f"secret/{_DB_SECRET_NAME}"

    new_password = _read_vault()
    if new_password is None:
        return {"error": "no rotated credential found in the vault — nothing to sync"}

    aid = action_id(action, _DB_SECRET_NAME, {})

    if dry_run:
        old_password, read_err = await _current_db_password()
        new_sha = _sha8(new_password)
        if read_err:
            diff = (
                f"POSTGRES_PASSWORD: (could not read current value: {read_err}) -> ****{new_sha}\n"
                "DATABASE_URL: (rebuilt with rotated password)"
            )
        else:
            old_sha = _sha8(old_password)
            diff = (
                f"POSTGRES_PASSWORD: ****{old_sha} -> ****{new_sha}\n"
                "DATABASE_URL: (rebuilt with rotated password)"
            )
        _stash_dryrun(ctx, aid, action, target, diff)
        result = _dry_run_result(action, target, aid, diff)
        result["vault_checked"] = True
        return result

    gate = await _execute_gate(ctx, approval_id, aid)
    if gate:
        return gate
    new_database_url = f"postgres://lab:{new_password}@postgres:5432/observability_lab"
    patch = json.dumps({
        "data": {
            "POSTGRES_PASSWORD": _b64(new_password),
            "DATABASE_URL": _b64(new_database_url),
        }
    })
    res = await _kubectl(
        ["patch", "secret", _DB_SECRET_NAME, "-n", "subject", "--type", "merge", "-p", patch]
    )
    if "error" in res:
        return _consume_dryrun(ctx, aid, res)
    final_result = _executed_result(
        action, target,
        "secret patched; restart dependent workloads (gateway, retriever) to pick it up",
    )
    return _consume_dryrun(ctx, aid, final_result)
