"""The deterministic pre-check battery (PLAN-2 P11 Task 5) — the Grafana Sift
pattern applied to this lab: before the LLM ever takes a turn, six fast,
non-agentic checks run against the telemetry/gitops/cluster planes and hand
back a leads-first Markdown report. `run_oncall` prepends that report to the
model's first prompt, so the investigation starts from real signal instead of
a blank page.

Each check is structured as `_fetch_*` (I/O against `tools.backends` or a
fixed-argv kubectl subprocess) + `_shape_*` (pure decision logic), so the
shaping — the actual "is this a lead?" judgement — is unit-testable with
canned payloads and never touches a live backend. `_check_*` wires fetch to
shape and is the only place exceptions are expected to be caught; `run_prechecks`
additionally gathers with `return_exceptions=True` as a second guard so a bug
in one check can never take down the other four or the run itself.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import config
from .tools import backends

PRECHECK_BUDGET = 800

_SECRET_NAME = "subject-db-credentials"
_ROLLOUT_WORKLOADS = ("gateway", "model-proxy")

_TS_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z")
_POD_ISSUE_RE = re.compile(
    r"\b(CrashLoopBackOff|ImagePullBackOff|ErrImagePull|OOMKilled|Pending|NotReady)\b"
)
_EVENT_REASON_RE = re.compile(
    r"\b(BackOff|Failed|FailedScheduling|Unhealthy|OOMKilling|FailedMount|BackOffPullImage)\b",
    re.IGNORECASE,
)


@dataclass
class CheckResult:
    name: str
    status: str  # "ok" | "lead" | "unavailable"
    summary: str  # <= PRECHECK_BUDGET chars, enforced by render_report
    leads: list[str]


def _lead_count_summary(noun: str, leads: list[str]) -> str:
    """A short count-style summary (e.g. '3 deploy-window leads') for checks
    whose leads are itemized in bullets — keeps the summary line from just
    re-joining (and duplicating) the exact same content as the bullets."""
    n = len(leads)
    return f"{n} {noun} lead{'' if n == 1 else 's'}"


# ---- recent_deploys -----------------------------------------------------------


async def _fetch_recent_deploys() -> tuple[dict, dict]:
    annotations, apps = await asyncio.gather(
        backends.grafana_annotations(range="60m", tags=["deployment"]),
        backends.argo_app(),
    )
    return annotations, apps


def _shape_recent_deploys(annotations: dict, apps: dict) -> CheckResult:
    if "error" in annotations:
        return CheckResult("recent_deploys", "unavailable", annotations["error"], [])
    leads: list[str] = []
    for ann in annotations.get("annotations", []):
        leads.append(f"deploy annotation at {ann.get('time')}: {ann.get('text')}")
    if "error" not in apps:
        for app in apps.get("apps", []):
            if app.get("sync") not in (None, "Synced") or app.get("health") not in (None, "Healthy"):
                leads.append(
                    f"argo app {app.get('app')}: sync={app.get('sync')} health={app.get('health')} "
                    f"(revision {app.get('revision')})"
                )
    if leads:
        return CheckResult("recent_deploys", "lead", _lead_count_summary("deploy-window", leads), leads)
    negative = "No deploy in the last 60m — rule out the reflex answer."
    return CheckResult("recent_deploys", "lead", negative, [negative])


async def _check_recent_deploys(alert: Any) -> CheckResult:
    try:
        annotations, apps = await _fetch_recent_deploys()
        return _shape_recent_deploys(annotations, apps)
    except Exception as exc:  # noqa: BLE001
        return CheckResult("recent_deploys", "unavailable", f"pre-check failed: {exc}", [])


# ---- kube_scan -----------------------------------------------------------


async def _fetch_kube_scan() -> tuple[dict, dict]:
    pods, events = await asyncio.gather(
        backends.kubectl_read("get", "pods", namespace="subject"),
        backends.k8s_events(limit=30),
    )
    return pods, events


def _shape_kube_scan(pods: dict, events: dict) -> CheckResult:
    if "error" in pods:
        return CheckResult("kube_scan", "unavailable", pods["error"], [])
    leads: list[str] = []
    for line in (pods.get("output") or "").splitlines():
        matches = _POD_ISSUE_RE.findall(line)
        if not matches:
            continue
        pod_name = line.split()[0] if line.split() else "?"
        for issue in dict.fromkeys(matches):  # de-dupe, preserve order
            leads.append(f"pod {pod_name}: {issue}")
    if "error" not in events:
        for event in events.get("events", []):
            reason = event.get("reason") or ""
            message = event.get("message") or ""
            if _EVENT_REASON_RE.search(reason) or _EVENT_REASON_RE.search(message):
                leads.append(
                    f"event {event.get('object')}: {reason} — {message} (at {event.get('time')})"
                )
    if leads:
        return CheckResult("kube_scan", "lead", _lead_count_summary("kube-scan", leads), leads)
    return CheckResult("kube_scan", "ok", "all pods Ready, no notable cluster events", [])


async def _check_kube_scan(alert: Any) -> CheckResult:
    try:
        pods, events = await _fetch_kube_scan()
        return _shape_kube_scan(pods, events)
    except Exception as exc:  # noqa: BLE001
        return CheckResult("kube_scan", "unavailable", f"pre-check failed: {exc}", [])


# ---- log_spike -----------------------------------------------------------

_LOG_SPIKE_QUERY = '{namespace="subject"} |~ "(?i)error|failed"'


def _shape_log_spike(now_count: int, baseline_count: int, first_line: str, first_ts: str) -> CheckResult:
    threshold = max(baseline_count, 1) * 3
    is_spike = now_count > threshold and now_count >= 3
    if not is_spike:
        return CheckResult(
            "log_spike", "ok",
            f"error/failed log rate normal: {now_count}/10min vs baseline {baseline_count}/10min",
            [],
        )
    multiple = now_count / max(baseline_count, 1)
    onset = f" — onset: {first_line} at {first_ts}" if first_line else ""
    summary = (
        f"error/failed log rate {now_count}/10min vs baseline {baseline_count}/10min "
        f"({multiple:.0f}x baseline){onset}"
    )
    return CheckResult("log_spike", "lead", summary, [summary])


async def _fetch_log_spike() -> tuple[int, int, str, str]:
    """Query the "now" and "baseline" windows as two SEPARATE Loki calls.

    loki_query sends `direction: backward`, so a single wide-range call (as
    this used to be: range="70m", limit=500) has its 500-line budget filled
    from the newest lines first — during a real error burst the 60-70min-ago
    baseline slice gets starved out entirely (baseline_count ~0), inflating
    "Nx baseline" leads. Querying the baseline window directly (its own
    start/end, its own limit) means it always gets its full budget regardless
    of how busy the last 10 minutes are."""
    now = datetime.now(timezone.utc)
    baseline_start = now - timedelta(minutes=70)
    baseline_end = now - timedelta(minutes=60)
    now_result, baseline_raw = await asyncio.gather(
        backends.loki_query(_LOG_SPIKE_QUERY, range="10m", limit=200),
        backends.loki_query(
            _LOG_SPIKE_QUERY,
            start=baseline_start.isoformat(),
            end=baseline_end.isoformat(),
            limit=500,
        ),
    )
    if "error" in now_result:
        raise RuntimeError(now_result["error"])
    if "error" in baseline_raw:
        raise RuntimeError(baseline_raw["error"])
    now_lines = now_result.get("lines", [])
    now_count = now_result.get("count", len(now_lines))
    baseline_count = baseline_raw.get("count", len(baseline_raw.get("lines", [])))
    first_line = first_ts = ""
    if now_lines:
        earliest = min(now_lines, key=lambda ln: ln["ts"])
        first_line = earliest.get("line", "")
        first_ts = datetime.fromtimestamp(int(earliest["ts"]) / 1e9, tz=timezone.utc).isoformat()
    return now_count, baseline_count, first_line, first_ts


async def _check_log_spike(alert: Any) -> CheckResult:
    try:
        now_count, baseline_count, first_line, first_ts = await _fetch_log_spike()
        return _shape_log_spike(now_count, baseline_count, first_line, first_ts)
    except Exception as exc:  # noqa: BLE001
        return CheckResult("log_spike", "unavailable", f"pre-check failed: {exc}", [])


# ---- attribution --------------------------------------------------------------

# ATTRIBUTE THE SYMPTOM BEFORE EXPLAINING IT. Every request enters through the
# gateway, so every downstream failure reaches a human as "the gateway is
# failing" or "the gateway is slow". Two exam questions were lost to exactly
# that, in the same way:
#
#   02-error-storm — a downstream failed 30% of calls; the agent stayed inside
#   the gateway, built a story from gateway CPU and a lineage-timeout log
#   flood, and proposed restarting the gateway.
#   01-latency — latency was injected into ONE service's handler; the agent
#   named two other services, called it a single-replica queueing bottleneck,
#   and proposed scaling them.
#
# Neither was a reasoning failure downstream of good data. Both skipped the
# breakdown that decides which service you are even talking about, so this
# check does that breakdown first and hands over the ranking.
#
# Three views, because no single one is sufficient:
#   * SERVER side (`request_duration_seconds_count`) — what each service says
#     about its OWN responses. A service returning 500s indicts itself.
#   * CLIENT side (`traces_spanmetrics_calls_total`, span_kind=CLIENT) — what
#     each caller says about the hop it made. This is the only view that sees
#     a callee which is DOWN: a dead workload emits no server-side series at
#     all, and silence ranks nowhere in a ranking built from server metrics.
#   * SPAN LATENCY (`traces_spanmetrics_latency_bucket`) — where the time goes,
#     with each service's own handler separated from what it spends waiting on
#     someone else. "Slow because it waits on X" and "slow in its own code" are
#     different incidents with different fixes, and the p95 of a front door
#     cannot tell them apart.
_ATTRIBUTION_WINDOW = "10m"
# Percent of requests. Measured, not guessed: under a steady 40 qps load window
# with no fault injected the gateway sits at 0.0-0.6% 5xx, and the availability
# alert fires at 2%. 1% is therefore "above the lab's own noise but below the
# thing that paged us" — a lead worth a sentence, not proof of anything.
_ERROR_FLOOR_PCT = 1.0
_SUBJECT_SERVICES = ("gateway", "model-proxy", "retriever", "embedder")

_SERVICE_ERROR_QUERY = (
    '100 * sum by (service) '
    f'(rate(request_duration_seconds_count{{http_status_code=~"5.."}}[{_ATTRIBUTION_WINDOW}]))'
    ' / clamp_min(sum by (service) '
    f'(rate(request_duration_seconds_count[{_ATTRIBUTION_WINDOW}])), 0.001)'
)
_EDGE_ERROR_QUERY = (
    '100 * sum by (service, span_name) (rate(traces_spanmetrics_calls_total'
    f'{{span_kind="SPAN_KIND_CLIENT", status_code="STATUS_CODE_ERROR"}}[{_ATTRIBUTION_WINDOW}]))'
    ' / clamp_min(sum by (service, span_name) (rate(traces_spanmetrics_calls_total'
    f'{{span_kind="SPAN_KIND_CLIENT"}}[{_ATTRIBUTION_WINDOW}])), 0.001)'
)
# Seconds. The gateway's latency SLO is 1.5s end to end, so a span at or above
# 1s is worth ranking; below that the breakdown is noise about a healthy lab.
_LATENCY_FLOOR_S = 1.0
_SPAN_P95_QUERY = (
    'histogram_quantile(0.95, sum by (service, span_name, span_kind, le) '
    f'(rate(traces_spanmetrics_latency_bucket[{_ATTRIBUTION_WINDOW}])))'
)


def _vector_rows(payload: dict) -> list[tuple[dict, float]]:
    """Flatten a Mimir instant-vector payload into (labels, value) pairs.

    Non-finite values are dropped rather than carried: a ratio over a
    denominator that was zero for the whole window comes back as "NaN", and a
    NaN sorts unpredictably and formats as a lead that reads like a finding."""
    rows: list[tuple[dict, float]] = []
    for entry in (payload.get("data") or {}).get("result") or []:
        raw = (entry.get("value") or [None, None])[-1]
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value != value or value in (float("inf"), float("-inf")):  # NaN / ±Inf
            continue
        rows.append((entry.get("metric") or {}, value))
    return rows


def _callee_of(span_name: str) -> str:
    """The client span names this lab emits are `<METHOD> <peer>` (e.g.
    "POST model-proxy"), so the last token is the callee. Anything that does
    not resolve to a known subject service is left alone — the span name is
    still reported, just not treated as a service that ought to have metrics."""
    tail = span_name.strip().split()[-1] if span_name.strip() else ""
    return tail if tail in _SUBJECT_SERVICES else ""


def _self_time_ranking(spans: list[tuple[str, str, str, float]]) -> list[tuple[str, float, float]]:
    """(service, own-handler p95, end-to-end p95), slowest own-handler first.

    "Own handler" is the service's slowest SERVER span minus its slowest CLIENT
    span: time it did not spend waiting on somebody else. That subtraction is
    what separates the origin of a latency incident from every service above it
    in the call graph — all of which are slow, and none of which is the answer.

    Quantiles do not subtract exactly (the p95 request of a caller is not the
    one that made the p95 downstream call), so this is a RANKING, not a
    measurement, and every caller says so."""
    server: dict[str, float] = {}
    client: dict[str, float] = {}
    for service, _span_name, span_kind, value in spans:
        bucket = server if span_kind.endswith("SERVER") else client if span_kind.endswith("CLIENT") else None
        if bucket is None:
            continue
        bucket[service] = max(bucket.get(service, 0.0), value)
    ranked = [
        (service, max(total - client.get(service, 0.0), 0.0), total)
        for service, total in server.items()
    ]
    return sorted(ranked, key=lambda row: -row[1])


def _shape_attribution(services: dict, edges: dict, spans: dict) -> CheckResult:
    if "error" in services and "error" in edges and "error" in spans:
        return CheckResult("attribution", "unavailable", services["error"], [])

    service_rows = sorted(
        ((str(m.get("service", "?")), v) for m, v in _vector_rows(services)),
        key=lambda row: -row[1],
    )
    edge_rows = sorted(
        ((str(m.get("service", "?")), str(m.get("span_name", "?")), v) for m, v in _vector_rows(edges)),
        key=lambda row: -row[2],
    )
    span_rows = [
        (str(m.get("service", "?")), str(m.get("span_name", "?")), str(m.get("span_kind", "")), v)
        for m, v in _vector_rows(spans)
    ]
    if not service_rows and not edge_rows and not span_rows:
        return CheckResult(
            "attribution", "unavailable",
            f"no request or span series in the last {_ATTRIBUTION_WINDOW}", [],
        )

    reporting = {name for name, _ in service_rows}
    # A callee somebody is calling that reports nothing of its own. Ordered by
    # how badly its callers are failing, so the worst edge leads.
    silent = list(dict.fromkeys(
        callee for _, span_name, _ in edge_rows
        if (callee := _callee_of(span_name)) and callee not in reporting
    ))

    error_leads = [
        f"{name}: {pct:.1f}% of its OWN responses are 5xx ({_ATTRIBUTION_WINDOW})"
        for name, pct in service_rows if pct >= _ERROR_FLOOR_PCT
    ][:3]
    error_leads += [
        f"{caller} → {span_name}: {pct:.1f}% of those outbound calls failed"
        for caller, span_name, pct in edge_rows if pct >= _ERROR_FLOOR_PCT
    ][:2]

    self_times = [row for row in _self_time_ranking(span_rows) if row[2] >= _LATENCY_FLOOR_S]
    latency_leads: list[str] = []
    if self_times:
        latency_leads.append(
            "own-handler p95 (server p95 minus its slowest outbound call — a ranking, not a "
            "measurement): " + ", ".join(
                f"{service} ~{own:.1f}s of {total:.1f}s end to end" for service, own, total in self_times[:4]
            )
        )
        latency_leads += [
            f"{service} → {span_name}: p95 {value:.1f}s outbound"
            for service, span_name, span_kind, value in
            sorted((r for r in span_rows if r[2].endswith("CLIENT") and r[3] >= _LATENCY_FLOOR_S),
                   key=lambda row: -row[3])[:2]
        ]

    leads = error_leads + latency_leads
    for callee in silent:
        leads.append(
            f"{callee} reported no server-side requests at all — a workload that is down or "
            f"unscheduled emits nothing, and its CALLERS carry its errors"
        )

    if leads:
        heads: list[str] = []
        if error_leads:
            top_service = service_rows[0] if service_rows and service_rows[0][1] >= _ERROR_FLOOR_PCT else None
            top_edge = edge_rows[0] if edge_rows and edge_rows[0][2] >= _ERROR_FLOOR_PCT else None
            if top_service and (not top_edge or top_service[1] >= top_edge[2]):
                heads.append(f"errors concentrate on {top_service[0]} ({top_service[1]:.1f}%)")
            elif top_edge:
                heads.append(f"errors concentrate on {top_edge[0]} → {top_edge[1]} ({top_edge[2]:.1f}%)")
        if self_times:
            service, own, total = self_times[0]
            heads.append(f"time concentrates in {service}'s own handler (~{own:.1f}s of {total:.1f}s)")
        summary = (
            "; ".join(heads) + f" over the last {_ATTRIBUTION_WINDOW} — which is not necessarily "
            "the workload named on the alert:"
        )
        return CheckResult("attribution", "lead", summary, leads)

    highest = ""
    if service_rows:
        highest = f" (highest: {service_rows[0][0]} {service_rows[0][1]:.1f}%)"
    negative = (
        f"No service or dependency edge above {_ERROR_FLOOR_PCT:.0f}% errors or "
        f"{_LATENCY_FLOOR_S:.0f}s p95 in the last {_ATTRIBUTION_WINDOW}{highest} — whatever "
        f"paged us is not a broad service-level failure. Look for something too narrow to move "
        f"a service-wide number (one route, one tenant, one pod) or something that is not "
        f"request-shaped at all (a stuck rollout, a pipeline, a credential)."
    )
    return CheckResult("attribution", "lead", negative, [negative])


async def _fetch_attribution() -> tuple[dict, dict, dict]:
    services, edges, spans = await asyncio.gather(
        backends.mimir_query(_SERVICE_ERROR_QUERY),
        backends.mimir_query(_EDGE_ERROR_QUERY),
        backends.mimir_query(_SPAN_P95_QUERY),
    )
    return services, edges, spans


async def _check_attribution(alert: Any) -> CheckResult:
    try:
        services, edges, spans = await _fetch_attribution()
        return _shape_attribution(services, edges, spans)
    except Exception as exc:  # noqa: BLE001
        return CheckResult("attribution", "unavailable", f"pre-check failed: {exc}", [])


# ---- rollout_state -----------------------------------------------------------


async def _fetch_rollout_state() -> dict[str, tuple[dict, dict]]:
    results: dict[str, tuple[dict, dict]] = {}
    for name in _ROLLOUT_WORKLOADS:
        rollout, runs = await asyncio.gather(
            backends.rollout_status(name, namespace="subject"),
            backends.analysisrun_get(rollout=name, namespace="subject"),
        )
        results[name] = (rollout, runs)
    return results


def _shape_rollout_state(data: dict[str, tuple[dict, dict]]) -> CheckResult:
    leads: list[str] = []
    errors: list[str] = []
    for name, (rollout, runs) in data.items():
        if "error" in rollout:
            errors.append(f"{name}: {rollout['error']}")
        else:
            phase = rollout.get("phase")
            if phase in ("Progressing", "Degraded", "Failed"):
                leads.append(
                    f"rollout {name}: {phase} — {rollout.get('message') or 'no message'} "
                    f"(step {rollout.get('step')})"
                )
        if "error" in runs:
            errors.append(f"{name} analysis: {runs['error']}")
        else:
            for run in runs.get("runs", []):
                if run.get("phase") in ("Failed", "Error"):
                    leads.append(
                        f"analysisrun for {name} ({run.get('name')}): {run.get('phase')} — "
                        f"{run.get('message') or 'no message'}"
                    )
    if leads:
        return CheckResult("rollout_state", "lead", _lead_count_summary("rollout-state", leads), leads)
    if errors:
        return CheckResult("rollout_state", "unavailable", "; ".join(errors), [])
    return CheckResult(
        "rollout_state", "ok",
        f"{' and '.join(_ROLLOUT_WORKLOADS)} rollouts stable, no failed analysis", [],
    )


async def _check_rollout_state(alert: Any) -> CheckResult:
    try:
        data = await _fetch_rollout_state()
        return _shape_rollout_state(data)
    except Exception as exc:  # noqa: BLE001
        return CheckResult("rollout_state", "unavailable", f"pre-check failed: {exc}", [])


# ---- secret_age (server-side only) -------------------------------------------


def _format_age(delta: timedelta) -> str:
    seconds = int(delta.total_seconds())
    if seconds < 0:
        seconds = 0
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes, _ = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def _parse(ts: str) -> datetime:
    """Parse a Kubernetes timestamp (`...Z`, with or without fractional
    seconds — the exact shape `_TS_RE` matches) into a tz-aware datetime."""
    iso = ts[:-1] + "+00:00" if ts.endswith("Z") else ts
    return datetime.fromisoformat(iso)


def _shape_secret_age(secret_json: dict, *, now: datetime | None = None) -> CheckResult:
    """Pure shaping over a `kubectl get secret ... -o json` payload: no
    jsonpath, no shell-escaping footguns — just dict access + a timestamp
    parse. `metadata.creationTimestamp` plus the newest `managedFields[].time`
    give both "how old" and "when last touched"."""
    now = now or datetime.now(timezone.utc)
    metadata = secret_json.get("metadata") or {}
    created_ts = (metadata.get("creationTimestamp") or "").strip()
    managed_fields = metadata.get("managedFields") or []
    timestamps = [mf.get("time", "").strip() for mf in managed_fields if mf.get("time")]
    if created_ts:
        timestamps.append(created_ts)
    if not timestamps:
        return CheckResult(
            "secret_age", "unavailable",
            f"could not parse timestamps for secret {_SECRET_NAME}", [],
        )

    created = _parse(created_ts) if created_ts else _parse(min(timestamps))
    last_update = _parse(max(timestamps))
    created_age = _format_age(now - created)
    updated_age = _format_age(now - last_update)
    summary = (
        f"Secret {_SECRET_NAME} last modified {updated_age} ago (created {created_age} ago)."
    )
    # A modification inside the last 60m — the same window the other checks
    # scan — is itself a lead: a rotated credential can look exactly like the
    # downstream symptom (e.g. auth failures) that paged us.
    if now - last_update <= timedelta(minutes=60):
        summary += " Recent rotation could explain new auth failures — worth ruling out."
        return CheckResult("secret_age", "lead", summary, [summary])
    return CheckResult("secret_age", "ok", summary, [])


async def _fetch_secret_age() -> CheckResult:
    kubeconfig = config.k8s_remediate_kubeconfig
    if not os.path.exists(kubeconfig):
        return CheckResult(
            "secret_age", "unavailable",
            "agent-remediate kubeconfig not found — server-side secret_age check skipped "
            "(minted separately; agent-ro cannot read Secrets)",
            [],
        )
    argv = [
        "kubectl", "--kubeconfig", kubeconfig, "get", "secret", _SECRET_NAME, "-n", "subject",
        "-o", "json",
    ]
    try:
        proc = await asyncio.to_thread(subprocess.run, argv, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        return CheckResult("secret_age", "unavailable", "kubectl timed out after 30s", [])
    except FileNotFoundError:
        return CheckResult("secret_age", "unavailable", "kubectl is not installed on this host", [])
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()[:200] or f"kubectl exited {proc.returncode}"
        return CheckResult("secret_age", "unavailable", err, [])
    try:
        secret_json = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        return CheckResult("secret_age", "unavailable", "kubectl returned unparseable JSON", [])
    return _shape_secret_age(secret_json)


async def _check_secret_age(alert: Any) -> CheckResult:
    try:
        return await _fetch_secret_age()
    except Exception as exc:  # noqa: BLE001
        return CheckResult("secret_age", "unavailable", f"pre-check failed: {exc}", [])


# ---- battery + report ---------------------------------------------------------

_CHECK_NAMES = (
    "recent_deploys", "kube_scan", "log_spike", "attribution", "rollout_state", "secret_age",
)


async def run_prechecks(alert: Any) -> list[CheckResult]:
    """Run all six checks concurrently. `return_exceptions=True` is a second
    guard on top of each `_check_*`'s own try/except — nothing thrown here can
    ever prevent the other checks (or the oncall run) from proceeding.

    Check functions are looked up by name from the module globals (rather than
    a fixed tuple of function objects) at call time, so tests can monkeypatch
    `precheck._check_<name>` directly."""
    module_globals = globals()
    outcomes = await asyncio.gather(
        *(module_globals[f"_check_{name}"](alert) for name in _CHECK_NAMES),
        return_exceptions=True,
    )
    results: list[CheckResult] = []
    for name, outcome in zip(_CHECK_NAMES, outcomes):
        if isinstance(outcome, BaseException):
            results.append(CheckResult(name, "unavailable", f"pre-check failed: {outcome}", []))
        else:
            results.append(outcome)
    return results


_STATUS_ORDER = {"lead": 0, "ok": 1, "unavailable": 2}
_STATUS_LABEL = {"lead": "LEAD", "ok": "OK", "unavailable": "UNAVAILABLE"}

# Per-check budget knobs. Leads are unbounded in principle (kube_scan can find
# one lead per pod/event), so without a cap a single check can still blow out
# the model's first prompt even with the summary line itself budgeted.
_LEADS_CAP = 8
_LEAD_CHAR_CAP = 200
_TRUNC_MARKER = "… (truncated)"
_SECTION_TRUNC_MARKER = "\n… (section truncated)"
# Small slack on top of PRECHECK_BUDGET for the whole rendered section (header
# + summary + bullets): enough room for the section marker itself, never more.
_SECTION_MARKER_ALLOWANCE = max(len(_TRUNC_MARKER), len(_SECTION_TRUNC_MARKER))


def _truncate(text: str, limit: int, marker: str) -> str:
    """Truncate `text` to at most `limit` chars, marker INCLUDED — never
    overshoots `limit` (unlike appending the marker after an already-full
    slice, which overshoots by len(marker))."""
    if len(text) <= limit:
        return text
    keep = max(limit - len(marker), 0)
    return text[:keep].rstrip() + marker


def render_report(results: list[CheckResult]) -> str:
    """Markdown "## Pre-check leads" section, leads-first. Per check: the
    summary is capped to PRECHECK_BUDGET chars, leads are capped at
    `_LEADS_CAP` bullets each truncated to `_LEAD_CHAR_CAP` chars, and the
    check's ENTIRE rendered section (header + summary + bullets) is enforced
    to never exceed PRECHECK_BUDGET + a small marker allowance — so five
    checks, however many leads each finds, can never blow out the model's
    first prompt."""
    ordered = sorted(results, key=lambda r: _STATUS_ORDER.get(r.status, 3))
    lines = ["## Pre-check leads", ""]
    for result in ordered:
        header = f"### {result.name} — {_STATUS_LABEL.get(result.status, result.status.upper())}"
        summary = _truncate(result.summary, PRECHECK_BUDGET, _TRUNC_MARKER)
        section_lines = [header, summary]
        shown_leads = result.leads[:_LEADS_CAP]
        omitted = len(result.leads) - len(shown_leads)
        for lead in shown_leads:
            section_lines.append(f"- {_truncate(lead, _LEAD_CHAR_CAP, _TRUNC_MARKER)}")
        if omitted > 0:
            section_lines.append(f"- … (+{omitted} more lead{'' if omitted == 1 else 's'} omitted)")
        section = "\n".join(section_lines)
        section = _truncate(section, PRECHECK_BUDGET + _SECTION_MARKER_ALLOWANCE, _SECTION_TRUNC_MARKER)
        lines.append(section)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
