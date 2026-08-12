"""Tests for the deterministic pre-check battery (PLAN-2 P11 Task 5): five
checks that seed the oncall investigation with leads BEFORE the LLM's first
tool call (the Grafana Sift pattern). Structured as `_fetch_*` (I/O) +
`_shape_*` (pure) per check so these tests never need live backends."""

from __future__ import annotations

import dataclasses
from datetime import datetime, timedelta, timezone

from agent_service import config as config_module
from agent_service.ingress import AlertEvent
from agent_service.precheck import (
    PRECHECK_BUDGET,
    CheckResult,
    _ATTRIBUTION_WINDOW,
    _LEAD_CHAR_CAP,
    _LEADS_CAP,
    _SECTION_MARKER_ALLOWANCE,
    _fetch_attribution,
    _fetch_log_spike,
    _shape_attribution,
    _shape_kube_scan,
    _shape_log_spike,
    _shape_recent_deploys,
    _shape_rollout_state,
    _shape_secret_age,
    _truncate,
    render_report,
    run_prechecks,
)


def _alert(**overrides) -> AlertEvent:
    base = dict(
        status="firing", alertname="slo-avail-fast", workload="gateway", severity="sev1",
        tenant="test-bench", starts_at=None, fingerprint="abc123", summary="availability burn",
    )
    base.update(overrides)
    return AlertEvent(**base)


# ---- render_report -----------------------------------------------------------


def test_render_report_flags_leads_first_and_budgets():
    r = [CheckResult("kube_scan", "ok", "all pods Ready", []),
         CheckResult("log_spike", "lead", "1 log_spike lead",
                     ["error spike 12x baseline at 01:59:30Z"])]
    out = render_report(r)
    assert out.index("log_spike") < out.index("kube_scan")
    assert len(out) < 3000 and "error spike 12x" in out


def test_render_report_truncates_oversized_summary_even_at_the_cost_of_leads():
    # An oversized summary alone (independent of the whole-section cap) is
    # still budgeted to PRECHECK_BUDGET — the per-field truncation this test
    # covered before the whole-section enforcement was added.
    r = [CheckResult("log_spike", "lead", "x" * 5000, ["error spike 12x baseline at 01:59:30Z"])]
    out = render_report(r)
    assert len(out) < PRECHECK_BUDGET + _SECTION_MARKER_ALLOWANCE + 100


def test_render_report_is_a_markdown_leads_section():
    out = render_report([CheckResult("kube_scan", "ok", "all pods Ready", [])])
    assert out.startswith("## Pre-check leads")


def test_render_report_orders_unavailable_last():
    r = [CheckResult("secret_age", "unavailable", "kubeconfig missing", []),
         CheckResult("kube_scan", "ok", "all pods Ready", []),
         CheckResult("log_spike", "lead", "spike", ["onset at 01:59:30Z"])]
    out = render_report(r)
    assert out.index("log_spike") < out.index("kube_scan") < out.index("secret_age")


def test_truncate_never_overshoots_limit_with_marker_included():
    marker = "… (truncated)"
    out = _truncate("x" * 5000, 800, marker)
    assert len(out) <= 800
    assert out.endswith(marker)


def test_render_report_caps_leads_at_eight_bullets():
    leads = [f"lead-{i}" for i in range(12)]
    r = [CheckResult("kube_scan", "lead", "12 kube-scan leads", leads)]
    out = render_report(r)
    bullet_lines = [ln for ln in out.splitlines() if ln.startswith("- lead-")]
    assert len(bullet_lines) == _LEADS_CAP
    assert "+4 more leads omitted" in out


def test_render_report_truncates_long_lead_bullets_within_char_cap():
    long_lead = "y" * 500
    r = [CheckResult("kube_scan", "lead", "1 kube-scan lead", [long_lead])]
    out = render_report(r)
    bullet_line = next(ln for ln in out.splitlines() if ln.startswith("- "))
    assert len(bullet_line) - 2 <= _LEAD_CHAR_CAP
    assert bullet_line.rstrip().endswith("(truncated)")


def test_render_report_section_never_exceeds_budget_plus_marker_allowance():
    # Many long leads: even after the per-lead/per-summary caps this would
    # still overflow (8 bullets * 200 chars alone is already >> PRECHECK_BUDGET)
    # without the whole-section enforcement.
    leads = [f"lead-{i}-" + "x" * 190 for i in range(20)]
    r = [CheckResult("kube_scan", "lead", "20 kube-scan leads", leads)]
    out = render_report(r)
    body = out[len("## Pre-check leads\n\n"):].rstrip("\n")
    assert len(body) <= PRECHECK_BUDGET + _SECTION_MARKER_ALLOWANCE


# ---- recent_deploys -----------------------------------------------------------


def test_recent_deploys_shaping_flags_deploy_in_window():
    annotations = {
        "range": "60m", "count": 1,
        "annotations": [{"time": "2026-07-22T01:50:00", "tags": ["deployment"], "text": "gateway v1.2.3"}],
    }
    apps = {"apps": [{"app": "gateway", "sync": "Synced", "health": "Healthy", "revision": "abc123"}]}
    res = _shape_recent_deploys(annotations, apps)
    assert res.status == "lead"
    assert "gateway v1.2.3" in res.summary or any("gateway v1.2.3" in lead for lead in res.leads)


def test_recent_deploys_shaping_surfaces_load_bearing_negative():
    annotations = {"range": "60m", "count": 0, "annotations": []}
    apps = {"apps": [{"app": "gateway", "sync": "Synced", "health": "Healthy", "revision": "abc123"}]}
    res = _shape_recent_deploys(annotations, apps)
    assert "No deploy in the last 60m" in res.summary
    assert "rule out the reflex answer" in res.summary


# ---- kube_scan -----------------------------------------------------------


def test_kube_scan_shaping_flags_crashloop():
    pods = {"argv": ["get", "pods"], "output":
            "NAME               READY   STATUS             RESTARTS   AGE\n"
            "gateway-abc123     0/1     CrashLoopBackOff   5          10m\n"
            "model-proxy-xyz    1/1     Running            0          2h\n"}
    events = {"events": []}
    res = _shape_kube_scan(pods, events)
    assert res.status == "lead"
    assert any("CrashLoopBackOff" in lead and "gateway-abc123" in lead for lead in res.leads)


def test_kube_scan_shaping_ok_when_all_healthy():
    pods = {"argv": ["get", "pods"], "output":
            "NAME               READY   STATUS    RESTARTS   AGE\n"
            "gateway-abc123     1/1     Running   0          10m\n"}
    events = {"events": []}
    res = _shape_kube_scan(pods, events)
    assert res.status == "ok"
    assert res.leads == []


def test_kube_scan_shaping_flags_event_reasons():
    pods = {"argv": ["get", "pods"], "output":
            "NAME               READY   STATUS    RESTARTS   AGE\n"
            "gateway-abc123     1/1     Running   0          10m\n"}
    events = {"events": [
        {"time": "01:55:00", "reason": "BackOff", "object": "Pod/gateway-abc123",
         "message": "Back-off restarting failed container"},
    ]}
    res = _shape_kube_scan(pods, events)
    assert res.status == "lead"
    assert any("BackOff" in lead for lead in res.leads)


# ---- log_spike -----------------------------------------------------------


def test_log_spike_shaping_detects_onset():
    res = _shape_log_spike(now_count=120, baseline_count=8,
                           first_line='{"msg":"password authentication failed"}',
                           first_ts="2026-07-22T01:58:02Z")
    assert res.status == "lead" and "password authentication failed" in res.summary


def test_log_spike_shaping_ok_when_no_spike():
    res = _shape_log_spike(now_count=3, baseline_count=4, first_line="", first_ts="")
    assert res.status == "ok"


def test_log_spike_shaping_handles_zero_baseline():
    res = _shape_log_spike(now_count=5, baseline_count=0,
                           first_line='{"msg":"boom"}', first_ts="2026-07-22T01:58:02Z")
    assert res.status == "lead"


async def test_log_spike_fetch_queries_now_and_baseline_as_separate_windows(monkeypatch):
    """The bug this guards against: loki_query sends direction=backward, so a
    single range="70m" call has its line budget filled from the newest lines
    first — during a real burst the 60-70min-ago baseline slice starves to
    ~0, inflating "Nx baseline". Fetching the two windows as separate calls
    (each with its own start/end) means the baseline always gets its own
    budget regardless of how busy the last 10 minutes are."""
    from agent_service.tools import backends

    calls: list[dict] = []

    async def fake_loki_query(logql, range="1h", limit=100, *, start=None, end=None):
        calls.append({"range": range, "limit": limit, "start": start, "end": end})
        if start is not None or end is not None:
            return {"count": 2, "lines": []}
        return {"count": 5, "lines": []}

    monkeypatch.setattr(backends, "loki_query", fake_loki_query)

    now_count, baseline_count, first_line, first_ts = await _fetch_log_spike()

    assert len(calls) == 2
    now_call, baseline_call = calls
    # "now" window: unchanged relative range, no explicit start/end.
    assert now_call["range"] == "10m"
    assert now_call["start"] is None and now_call["end"] is None
    # baseline window: explicit start/end 60-70 minutes ago, distinct from "now".
    assert baseline_call["start"] is not None and baseline_call["end"] is not None
    baseline_start = datetime.fromisoformat(baseline_call["start"])
    baseline_end = datetime.fromisoformat(baseline_call["end"])
    now = datetime.now(timezone.utc)
    assert baseline_end < now - timedelta(minutes=59)
    assert baseline_start < baseline_end
    assert (baseline_end - baseline_start) - timedelta(minutes=10) < timedelta(seconds=5)
    assert now_count == 5
    assert baseline_count == 2


# ---- attribution --------------------------------------------------------------


def _vector(*rows: tuple[dict, float]) -> dict:
    """A Mimir instant-vector payload, shaped exactly as `mimir_query` returns
    it (values are strings in Prometheus JSON, which is half the point)."""
    return {
        "query": "…", "range": "instant",
        "data": {
            "resultType": "vector",
            "result": [{"metric": labels, "value": [1785846757.4, str(value)]}
                       for labels, value in rows],
        },
    }


def _spans(*rows: tuple[str, str, str, float]) -> dict:
    """A span-latency payload: (service, span_name, kind, p95 seconds)."""
    return _vector(*(
        ({"service": service, "span_name": name, "span_kind": f"SPAN_KIND_{kind}"}, value)
        for service, name, kind, value in rows
    ))


def test_attribution_ranks_the_downstream_above_the_alerting_workload():
    """The finding `02-error-storm` was lost on: the gateway is the front door,
    so a downstream failure reaches a human as "gateway 5xx"."""
    services = _vector(
        ({"service": "retriever"}, 30.4),
        ({"service": "gateway"}, 4.9),
        ({"service": "embedder"}, 0.0),
    )
    edges = _vector(({"service": "gateway", "span_name": "POST retriever"}, 29.8))
    res = _shape_attribution(services, edges, _vector())
    assert res.status == "lead"
    assert "errors concentrate on retriever" in res.summary
    assert res.leads[0].startswith("retriever: 30.4%")
    # The alerting workload is still reported — ranked, not hidden.
    assert any("gateway: 4.9%" in lead for lead in res.leads)


def test_attribution_names_the_failing_dependency_edge():
    services = _vector(({"service": "gateway"}, 5.0))
    edges = _vector(
        ({"service": "gateway", "span_name": "POST model-proxy"}, 12.5),
        ({"service": "gateway", "span_name": "POST embedder"}, 0.2),
    )
    res = _shape_attribution(services, edges, _vector())
    assert any("gateway → POST model-proxy: 12.5%" in lead for lead in res.leads)
    assert not any("POST embedder" in lead for lead in res.leads)  # below the floor


def test_attribution_flags_a_callee_that_reports_nothing():
    """The case a server-side ranking cannot see: a workload that is DOWN emits
    no series at all, so it sorts nowhere. Its callers are the witnesses."""
    services = _vector(({"service": "gateway"}, 6.0), ({"service": "model-proxy"}, 0.1))
    edges = _vector(({"service": "model-proxy", "span_name": "POST retriever"}, 100.0))
    res = _shape_attribution(services, edges, _vector())
    assert res.status == "lead"
    assert any("retriever reported no server-side requests at all" in lead for lead in res.leads)


def test_attribution_ignores_an_unknown_peer_as_a_silent_service():
    services = _vector(({"service": "gateway"}, 6.0))
    edges = _vector(({"service": "gateway", "span_name": "POST api.openai.com"}, 40.0))
    res = _shape_attribution(services, edges, _vector())
    assert any("POST api.openai.com" in lead for lead in res.leads)
    assert not any("reported no server-side requests" in lead for lead in res.leads)


def test_attribution_names_the_service_whose_own_handler_holds_the_time():
    """The finding `01-latency` was lost on. Latency was injected into ONE
    service's handler; everything above it in the call graph is slow too, and
    the agent named two services that were merely waiting."""
    spans = _spans(
        ("gateway", "POST /v1/chat", "SERVER", 8.0),
        ("gateway", "POST model-proxy", "CLIENT", 7.3),
        ("gateway", "POST retriever", "CLIENT", 2.2),
        ("model-proxy", "POST /v1/complete", "SERVER", 7.3),
        ("retriever", "POST /v1/search", "SERVER", 2.2),
    )
    res = _shape_attribution(_vector(), _vector(), spans)
    assert res.status == "lead"
    # gateway is slowest end to end (8.0s) but spends 7.3s of it waiting.
    assert "time concentrates in model-proxy's own handler" in res.summary
    assert "~7.3s of 7.3s" in res.summary
    ranking = next(lead for lead in res.leads if lead.startswith("own-handler p95"))
    assert ranking.index("model-proxy") < ranking.index("gateway")
    # And it says what the number is, because quantiles do not subtract exactly.
    assert "a ranking, not a measurement" in ranking


def test_attribution_ignores_spans_below_the_latency_floor():
    spans = _spans(
        ("gateway", "POST /v1/chat", "SERVER", 0.4),
        ("gateway", "POST model-proxy", "CLIENT", 0.3),
    )
    res = _shape_attribution(_vector(), _vector(), spans)
    assert not any("own-handler" in lead for lead in res.leads)
    assert "not a broad service-level failure" in res.summary


def test_attribution_reports_errors_and_latency_together():
    services = _vector(({"service": "retriever"}, 12.0))
    spans = _spans(
        ("gateway", "POST /v1/chat", "SERVER", 6.0),
        ("gateway", "POST retriever", "CLIENT", 5.5),
        ("retriever", "POST /v1/search", "SERVER", 5.5),
    )
    res = _shape_attribution(services, _vector(), spans)
    assert "errors concentrate on retriever" in res.summary
    assert "time concentrates in retriever's own handler" in res.summary


def test_attribution_negative_is_load_bearing():
    services = _vector(({"service": "gateway"}, 0.2), ({"service": "retriever"}, 0.0))
    edges = _vector(({"service": "gateway", "span_name": "POST retriever"}, 0.1))
    res = _shape_attribution(services, edges, _vector())
    # Not "ok": "nothing is broadly broken" is itself a lead, in the same way
    # recent_deploys' "no deploy in the last 60m" is.
    assert res.status == "lead"
    assert "not a broad service-level failure" in res.summary
    assert "gateway 0.2%" in res.summary
    # An incident that is not request-shaped at all reaches this branch too, so
    # the negative must not send every quiet investigation hunting a small
    # error-rate failure that does not exist.
    assert "a stuck rollout, a pipeline, a credential" in res.summary


def test_attribution_drops_nan_ratios():
    """A ratio whose denominator was zero all window comes back "NaN"; printed
    as a lead it reads like a finding."""
    services = _vector(({"service": "gateway"}, 8.0), ({"service": "embedder"}, float("nan")))
    res = _shape_attribution(services, _vector(), _vector())
    assert any("gateway: 8.0%" in lead for lead in res.leads)
    assert not any("embedder" in lead for lead in res.leads)
    assert "nan" not in res.summary.lower()


def test_attribution_unavailable_when_every_query_fails():
    failed = {"error": "mimir query failed: connection refused"}
    assert _shape_attribution(failed, failed, failed).status == "unavailable"


def test_attribution_survives_one_query_failing():
    res = _shape_attribution(_vector(({"service": "retriever"}, 22.0)),
                             {"error": "mimir query failed: connection refused"},
                             _vector())
    assert res.status == "lead"
    assert any("retriever: 22.0%" in lead for lead in res.leads)


def test_attribution_unavailable_when_the_lab_is_silent():
    res = _shape_attribution(_vector(), _vector(), _vector())
    assert res.status == "unavailable"


async def test_attribution_fetch_asks_mimir_for_all_three_views(monkeypatch):
    from agent_service.tools import backends

    queries: list[str] = []

    async def fake_mimir_query(promql, range="", step="60s"):
        queries.append(promql)
        return _vector()

    monkeypatch.setattr(backends, "mimir_query", fake_mimir_query)
    await _fetch_attribution()

    assert len(queries) == 3
    server, client, latency = queries
    assert "request_duration_seconds_count" in server and 'http_status_code=~"5.."' in server
    assert "traces_spanmetrics_calls_total" in client and 'span_kind="SPAN_KIND_CLIENT"' in client
    assert "traces_spanmetrics_latency_bucket" in latency and "histogram_quantile" in latency
    # All three views must cover the SAME window or the rankings are not
    # comparable, which is the only reason to show them side by side.
    assert server.count(f"[{_ATTRIBUTION_WINDOW}]") == 2
    assert client.count(f"[{_ATTRIBUTION_WINDOW}]") == 2
    assert latency.count(f"[{_ATTRIBUTION_WINDOW}]") == 1


# ---- rollout_state -----------------------------------------------------------


def test_rollout_state_shaping_flags_degraded():
    data = {
        "gateway": (
            {"rollout": "gateway", "phase": "Degraded", "message": "canary failed health checks",
             "step": "2/5"},
            {"runs": []},
        ),
        "model-proxy": (
            {"rollout": "model-proxy", "phase": "Healthy", "message": "", "step": "5/5"},
            {"runs": []},
        ),
    }
    res = _shape_rollout_state(data)
    assert res.status == "lead"
    assert any("gateway" in lead and "Degraded" in lead for lead in res.leads)


def test_rollout_state_shaping_flags_failed_analysis():
    data = {
        "gateway": (
            {"rollout": "gateway", "phase": "Healthy", "message": "", "step": "5/5"},
            {"runs": [{"name": "gateway-run-1", "phase": "Failed", "message": "error rate too high"}]},
        ),
        "model-proxy": (
            {"rollout": "model-proxy", "phase": "Healthy", "message": "", "step": "5/5"},
            {"runs": []},
        ),
    }
    res = _shape_rollout_state(data)
    assert res.status == "lead"
    assert any("Failed" in lead for lead in res.leads)


def test_rollout_state_shaping_ok_when_stable():
    data = {
        "gateway": ({"rollout": "gateway", "phase": "Healthy", "message": "", "step": "5/5"}, {"runs": []}),
        "model-proxy": ({"rollout": "model-proxy", "phase": "Healthy", "message": "", "step": "5/5"}, {"runs": []}),
    }
    res = _shape_rollout_state(data)
    assert res.status == "ok"
    assert res.leads == []


# ---- secret_age -----------------------------------------------------------


def _secret_json(created: str, managed_time: str) -> dict:
    """A canned `kubectl get secret ... -o json` payload — the exact shape
    _shape_secret_age now parses directly (no jsonpath, no shell-escaping)."""
    return {
        "apiVersion": "v1",
        "kind": "Secret",
        "type": "Opaque",
        "data": {"password": "cGxhY2Vob2xkZXI="},
        "metadata": {
            "name": "subject-db-credentials",
            "namespace": "subject",
            "creationTimestamp": created,
            "managedFields": [
                {
                    "manager": "kubectl-client-side-apply",
                    "operation": "Update",
                    "time": managed_time,
                }
            ],
        },
    }


def test_secret_age_shaping_flags_recent_rotation():
    now = datetime(2026, 7, 22, 2, 0, tzinfo=timezone.utc)
    res = _shape_secret_age(
        _secret_json("2026-06-01T00:00:00Z", "2026-07-22T01:45:00Z"),
        now=now,
    )
    assert res.status == "lead"
    assert "subject-db-credentials" in res.summary
    assert "ago" in res.summary


def test_secret_age_shaping_ok_when_stable():
    now = datetime(2026, 7, 22, 2, 0, tzinfo=timezone.utc)
    res = _shape_secret_age(
        _secret_json("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
        now=now,
    )
    assert res.status == "ok"
    assert "subject-db-credentials" in res.summary


def test_secret_age_shaping_handles_fractional_second_timestamps():
    # _TS_RE already matched fractional seconds; _parse must too — a raw
    # kubectl JSON payload can carry them (e.g. server-side-apply managers).
    now = datetime(2026, 7, 22, 2, 0, tzinfo=timezone.utc)
    res = _shape_secret_age(
        _secret_json("2026-06-01T00:00:00.123456Z", "2026-01-01T00:00:00.000001Z"),
        now=now,
    )
    assert res.status == "ok"
    assert "subject-db-credentials" in res.summary


def test_secret_age_shaping_unavailable_when_no_timestamps():
    res = _shape_secret_age({"metadata": {}})
    assert res.status == "unavailable"


# ---- run_prechecks: gather with return_exceptions never raises ---------------


async def test_run_prechecks_reports_unavailable_on_backend_error(monkeypatch):
    from agent_service.tools import backends

    async def failing(*args, **kwargs):
        return {"error": "connection refused"}

    monkeypatch.setattr(backends, "grafana_annotations", failing)
    monkeypatch.setattr(backends, "argo_app", failing)
    monkeypatch.setattr(backends, "kubectl_read", failing)
    monkeypatch.setattr(backends, "k8s_events", failing)
    monkeypatch.setattr(backends, "loki_query", failing)
    monkeypatch.setattr(backends, "mimir_query", failing)
    monkeypatch.setattr(backends, "rollout_status", failing)
    monkeypatch.setattr(backends, "analysisrun_get", failing)
    monkeypatch.setattr(
        config_module, "config",
        dataclasses.replace(config_module.config, k8s_remediate_kubeconfig="/does/not/exist.yaml"),
    )
    from agent_service import precheck as precheck_module
    monkeypatch.setattr(precheck_module, "config", config_module.config)

    results = await run_prechecks(_alert())
    assert len(results) == 6
    assert all(isinstance(r, CheckResult) for r in results)
    names = {r.name for r in results}
    assert names == {"recent_deploys", "kube_scan", "log_spike", "attribution",
                     "rollout_state", "secret_age"}
    secret_result = next(r for r in results if r.name == "secret_age")
    assert secret_result.status == "unavailable"


async def test_run_prechecks_never_raises_on_unexpected_exception(monkeypatch):
    from agent_service import precheck as precheck_module

    async def boom(alert):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(precheck_module, "_check_kube_scan", boom)
    results = await run_prechecks(_alert())
    kube = next(r for r in results if r.name == "kube_scan")
    assert kube.status == "unavailable"


def test_precheck_budget_is_800():
    assert PRECHECK_BUDGET == 800
