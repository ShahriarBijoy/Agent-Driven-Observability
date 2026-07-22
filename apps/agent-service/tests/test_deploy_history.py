"""deploy_history / merge_history (PLAN-2 P11 Task 7) — the correlation
primitive: one merged chronological timeline across Grafana annotations, CI
runs, Argo sync history, and rollout revisions.

merge_history is pure (no I/O), so it's exercised directly with canned shapes
copied from the real backend outputs (grafana_annotations, gitea_ci_runs,
argo_app, rollout_status) in backends.py. deploy_history's async gather/skip
wiring gets a couple of monkeypatched integration tests on top.

merge_history takes an injectable `now` (defaults to the real current time)
so window-cutoff behavior is deterministic here instead of racing the wall
clock. The fixtures below all sit within ~4.5 hours of NOW and every
"non-filtering-focused" test uses a `now`/`window_minutes` pair wide enough
to keep every fixture entry inside the window — the window-exclusion
behavior itself gets its own dedicated tests further down.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from agent_service.tools import backends
from agent_service.tools.backends import deploy_history, merge_history

NOW = datetime(2026, 7, 22, 9, 0, 0, tzinfo=timezone.utc)

ANNOTATIONS = [
    {"time": "2026-07-22T09:00:00", "tags": ["deployment"], "text": "gateway deployed sha abc123abcd"},
    {"time": "2026-07-22T06:00:00", "tags": ["deployment"], "text": "model-proxy deployed sha def456abcd"},
]

CI_RUNS = [
    {
        "id": 501, "run_number": 42, "status": "completed", "conclusion": "success",
        "branch": "main", "sha": "abc123abcd", "title": "fix: gateway retry budget",
        "started_at": "2026-07-22T08:50:00", "url": "http://gitea.local/obs/obs-lab/actions/runs/501",
        "jobs": [{"name": "build", "conclusion": "success"}],
    },
]

ARGO_APPS = [
    {
        "app": "gateway", "sync": "Synced", "revision": "abc123abcde", "health": "Healthy",
        "operation": {"phase": "Succeeded", "message": "", "startedAt": None, "finishedAt": None,
                      "syncedRevision": "abc123abcde"},
        "history": [
            {"id": 12, "revision": "abc123abcde", "deployedAt": "2026-07-22T09:05:00",
             "deployStartedAt": "2026-07-22T09:04:30"},
            {"id": 11, "revision": "prevrev0001", "deployedAt": "2026-07-22T05:00:00",
             "deployStartedAt": "2026-07-22T04:59:00"},
        ],
        "conditions": [],
    },
    {
        "app": "model-proxy", "sync": "Synced", "revision": "def456abcde", "health": "Healthy",
        "operation": {"phase": "Succeeded", "message": "", "startedAt": None, "finishedAt": None,
                      "syncedRevision": "def456abcde"},
        "history": [
            {"id": 5, "revision": "def456abcde", "deployedAt": "2026-07-22T06:10:00",
             "deployStartedAt": "2026-07-22T06:09:00"},
        ],
        "conditions": [],
    },
]

ROLLOUTS = [
    {
        "rollout": "gateway", "phase": "Healthy", "message": "", "aborted": False,
        "step": "5/5", "steps": [], "stableHash": "abc123", "canaryHash": "abc123",
        "replicas": {"desired": 3, "updated": 3, "ready": 3, "available": 3},
        "conditions": [], "note": "…",
        "ts": "2026-07-22T09:10:00+00:00",
    },
    {
        "rollout": "model-proxy", "phase": "Progressing", "message": "", "aborted": False,
        "step": "2/5", "steps": [], "stableHash": "def456", "canaryHash": "def789",
        "replicas": {"desired": 3, "updated": 1, "ready": 3, "available": 3},
        "conditions": [], "note": "…",
        "ts": "2026-07-22T09:12:00+00:00",
    },
]


def test_interleaved_timestamps_sort_desc() -> None:
    result = merge_history(ANNOTATIONS, CI_RUNS, ARGO_APPS, ROLLOUTS, 180, None, now=NOW)
    tss = [e["ts"] for e in result["entries"]]
    assert tss == sorted(tss, reverse=True)
    assert result["window_minutes"] == 180
    assert result["count"] == len(result["entries"])
    # every source is represented
    assert {e["source"] for e in result["entries"]} == {"annotation", "ci", "argo", "rollout"}


def test_every_entry_has_all_four_keys() -> None:
    result = merge_history(ANNOTATIONS, CI_RUNS, ARGO_APPS, ROLLOUTS, 180, None, now=NOW)
    for entry in result["entries"]:
        assert entry.keys() >= {"ts", "source", "summary", "ref"}
        assert len(entry["summary"]) <= 200


def test_workload_filter_keeps_matching_and_source_agnostic_entries() -> None:
    result = merge_history(ANNOTATIONS, CI_RUNS, ARGO_APPS, ROLLOUTS, 180, "gateway", now=NOW)
    sources = {e["source"] for e in result["entries"]}
    # annotations + ci are source-agnostic: always kept regardless of workload
    assert "annotation" in sources
    assert "ci" in sources
    ann_texts = [e["summary"] for e in result["entries"] if e["source"] == "annotation"]
    assert any("model-proxy" in t for t in ann_texts)  # the non-matching one is still here

    argo_entries = [e for e in result["entries"] if e["source"] == "argo"]
    assert argo_entries and all("gateway" in e["summary"] for e in argo_entries)

    rollout_entries = [e for e in result["entries"] if e["source"] == "rollout"]
    assert rollout_entries and all("gateway" in e["summary"] for e in rollout_entries)
    assert not any("model-proxy" in e["summary"] for e in rollout_entries)


def test_workload_filter_excludes_non_matching_argo_and_rollout() -> None:
    result = merge_history(ANNOTATIONS, CI_RUNS, ARGO_APPS, ROLLOUTS, 180, "model-proxy", now=NOW)
    argo_apps_seen = {e["summary"].split()[0] for e in result["entries"] if e["source"] == "argo"}
    assert argo_apps_seen == {"model-proxy"}


def test_cap_at_40_entries() -> None:
    many_annotations = [
        {"time": f"2026-07-22T{h:02d}:00:00", "tags": ["deployment"], "text": f"deploy #{h}"}
        for h in range(24)
    ]
    many_ci = [
        {
            "id": i, "run_number": i, "status": "completed", "conclusion": "success",
            "branch": "main", "sha": f"sha{i:04d}", "title": f"run {i}",
            "started_at": f"2026-07-21T{i % 24:02d}:00:00", "url": "", "jobs": [],
        }
        for i in range(30)
    ]
    # A window/now wide enough to keep all 54 synthetic entries in play — this
    # test is about the 40-entry cap, not window filtering.
    wide_now = datetime(2026, 7, 23, 0, 0, 0, tzinfo=timezone.utc)
    result = merge_history(many_annotations, many_ci, [], [], 3000, None, now=wide_now)
    assert len(result["entries"]) == 40
    assert result["count"] == 40
    tss = [e["ts"] for e in result["entries"]]
    assert tss == sorted(tss, reverse=True)


def test_merge_history_empty_sources() -> None:
    result = merge_history([], [], [], [], 60, None)
    assert result == {"window_minutes": 60, "entries": [], "count": 0}


def test_window_filters_ci_and_argo_entries_outside_window() -> None:
    """Important 1: window_minutes must actually cut off stale CI/Argo
    entries, not just thread through as a no-op."""
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    ci_runs = [
        {"id": 1, "run_number": 1, "status": "completed", "conclusion": "success",
         "branch": "main", "sha": "in-ci-001", "title": "inside window",
         "started_at": "2026-07-22T11:30:00Z", "url": "", "jobs": []},
        {"id": 2, "run_number": 2, "status": "completed", "conclusion": "success",
         "branch": "main", "sha": "out-ci-001", "title": "outside window",
         "started_at": "2026-07-22T08:00:00Z", "url": "", "jobs": []},
    ]
    argo_apps = [
        {"app": "gateway", "history": [
            {"id": 1, "revision": "in-argo-001", "deployedAt": "2026-07-22T11:45:00Z"},
            {"id": 2, "revision": "out-argo-001", "deployedAt": "2026-07-22T05:00:00Z"},
        ]},
    ]
    result = merge_history([], ci_runs, argo_apps, [], 60, None, now=now)
    refs = {e["ref"] for e in result["entries"]}
    assert "in-ci-001" in refs
    assert "out-ci-001" not in refs
    assert "in-argo-001" in refs
    assert "out-argo-001" not in refs


def test_window_filters_annotation_entries_outside_window() -> None:
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    annotations = [
        {"time": "2026-07-22T11:30:00", "tags": ["deployment"], "text": "inside window"},
        {"time": "2026-07-22T08:00:00", "tags": ["deployment"], "text": "outside window"},
    ]
    result = merge_history(annotations, [], [], [], 60, None, now=now)
    summaries = {e["summary"] for e in result["entries"]}
    assert summaries == {"inside window"}


def test_mixed_timestamp_formats_normalize_and_sort_adjacent() -> None:
    """Important 2: the three input formats (rollout '+00:00', CI 'Z',
    annotation naive-but-UTC) representing the same instant must parse to
    the same instant, sort adjacent, and serialize identically."""
    same_instant_ann = [
        {"time": "2026-07-22T09:00:00", "tags": ["deployment"], "text": "annotation form"},
    ]
    same_instant_ci = [
        {"id": 1, "run_number": 1, "status": "completed", "conclusion": "success",
         "branch": "main", "sha": "zform", "title": "ci form",
         "started_at": "2026-07-22T09:00:00Z", "url": "", "jobs": []},
    ]
    same_instant_rollout = [
        {"rollout": "gateway", "phase": "Healthy", "message": "", "aborted": False,
         "step": "5/5", "steps": [], "stableHash": "x", "canaryHash": "x",
         "replicas": {}, "conditions": [], "note": "",
         "ts": "2026-07-22T09:00:00+00:00"},
    ]
    now = datetime(2026, 7, 22, 9, 30, 0, tzinfo=timezone.utc)
    result = merge_history(
        same_instant_ann, same_instant_ci, [], same_instant_rollout, 60, None, now=now
    )
    assert len(result["entries"]) == 3
    tss = [e["ts"] for e in result["entries"]]
    # canonical form, identical across all three input formats
    assert all(ts == "2026-07-22T09:00:00Z" for ts in tss)


def test_rollout_entries_prefixed_as_current_state_snapshot() -> None:
    """Important 3: rollout entries are a query-time snapshot, not an event —
    the summary must say so."""
    now = datetime(2026, 7, 22, 9, 30, 0, tzinfo=timezone.utc)
    result = merge_history([], [], [], ROLLOUTS, 180, None, now=now)
    rollout_entries = [e for e in result["entries"] if e["source"] == "rollout"]
    assert rollout_entries
    assert all(
        e["summary"].startswith("current state (as of query): ") for e in rollout_entries
    )


async def test_deploy_history_reports_sources_unavailable(monkeypatch) -> None:
    async def failing(*_args, **_kwargs):
        raise RuntimeError("backend down")

    monkeypatch.setattr(backends, "grafana_annotations", failing)
    monkeypatch.setattr(backends, "gitea_ci_runs", failing)
    monkeypatch.setattr(backends, "argo_app", failing)
    monkeypatch.setattr(backends, "rollout_status", failing)

    result = await deploy_history(window_minutes=60)
    assert result["entries"] == []
    assert result["count"] == 0
    assert set(result["sources_unavailable"]) == {"annotation", "ci", "argo", "rollout"}


async def test_deploy_history_never_raises_and_merges_happy_path(monkeypatch) -> None:
    # deploy_history stamps its own `now` at call time (real wall clock), so
    # these fixtures are built relative to "just now" rather than hardcoded
    # dates — they must land inside whatever window deploy_history uses
    # regardless of when the test actually runs.
    recent_iso = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

    async def fake_annotations(range: str = "2h", tags=None) -> dict:  # noqa: A002
        return {"range": range, "tags": tags or ["deployment"], "count": 1,
                "annotations": [{"time": recent_iso, "tags": ["deployment"],
                                  "text": "gateway deployed sha abc123abcd"}]}

    async def fake_ci_runs(limit: int = 5, branch: str = "") -> dict:
        run = {**CI_RUNS[0], "started_at": recent_iso}
        return {"repo": "obs/obs-lab", "count": 1, "runs": [run]}

    async def fake_argo_app(name: str = "") -> dict:
        if not name:
            return {"apps": [{"app": "gateway", "sync": "Synced", "health": "Healthy",
                               "revision": "abc123abcde"}]}
        app = {**ARGO_APPS[0]}
        app["history"] = [
            {"id": 12, "revision": "abc123abcde",
             "deployedAt": recent_iso, "deployStartedAt": recent_iso},
        ]
        return app

    async def fake_rollout_status(name: str, namespace: str = "subject") -> dict:
        return next(r for r in ROLLOUTS if r["rollout"] == name) | {}

    monkeypatch.setattr(backends, "grafana_annotations", fake_annotations)
    monkeypatch.setattr(backends, "gitea_ci_runs", fake_ci_runs)
    monkeypatch.setattr(backends, "argo_app", fake_argo_app)
    monkeypatch.setattr(backends, "rollout_status", fake_rollout_status)

    result = await deploy_history(window_minutes=120)
    assert "sources_unavailable" not in result
    assert result["window_minutes"] == 120
    assert result["count"] == len(result["entries"])
    assert {e["source"] for e in result["entries"]} == {"annotation", "ci", "argo", "rollout"}
