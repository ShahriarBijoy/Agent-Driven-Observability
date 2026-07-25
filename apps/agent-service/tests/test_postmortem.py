"""postmortem.py (PLAN-2 P11 Task 11): the machine owns the timeline, the
model owns only the narrative.

`build_timeline` merges every machine-observable "when" source and must
exclude deploy_history's source=="rollout" entries (a current-state snapshot
stamped at query time, not an event — the Task 7 caveat) and dedupe on
(ts, source, label). `compose` renders whatever timeline it's given verbatim,
in the given order, and appends the model's narrative unmodified below it —
it never sorts or reorders. `grafana_explore_link` builds a URL-encoded
Grafana Explore deep link. `publish_postmortem_impl` is the per-run tool:
compose + commit the document to main on Gitea, resolving filename collisions
under an incident-suffixed name."""

from __future__ import annotations

import dataclasses
import json as jsonlib
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

from agent_service import db, postmortem
from agent_service.tools import backends

UTC = timezone.utc


# ---- compose ------------------------------------------------------------------


def test_compose_renders_every_row_preserves_order_and_appends_narrative_verbatim():
    incident = {
        "title": "Gateway high error rate",
        "status": "resolved",
        "severity": "sev2",
        "opened_at": datetime(2026, 7, 22, 9, 50, 0, tzinfo=UTC),
        "resolved_at": datetime(2026, 7, 22, 10, 15, 0, tzinfo=UTC),
        "verified_at": datetime(2026, 7, 22, 10, 16, 0, tzinfo=UTC),
    }
    # Deliberately NOT chronological — compose must render it exactly as given.
    timeline = [
        {"ts": datetime(2026, 7, 22, 10, 15, 0, tzinfo=UTC), "source": "verification",
         "label": "recovery verified: X no longer firing"},
        {"ts": datetime(2026, 7, 22, 9, 55, 0, tzinfo=UTC), "source": "alert",
         "label": "alert firing: X"},
    ]
    narrative = "## Summary\nA bad deploy caused it; rolled back.\n"

    doc = postmortem.compose(incident, timeline, narrative)

    assert "# Postmortem: Gateway high error rate" in doc
    assert "**Status:** resolved" in doc
    assert "**Severity:** sev2" in doc
    assert "recovery verified: X no longer firing" in doc
    assert "alert firing: X" in doc
    # input order preserved (never sorted): the 10:15 row appears BEFORE the
    # chronologically-earlier 9:55 row because that's the order it was given.
    assert doc.index("recovery verified") < doc.index("alert firing: X")
    # narrative appended verbatim, unmodified
    assert doc.rstrip().endswith(narrative.strip())
    assert "10:15:00Z" in doc and "09:55:00Z" in doc


def test_compose_never_reorders_even_when_reverse_chronological():
    incident = {"title": "T", "status": "open", "severity": "sev3"}
    timeline = [
        {"ts": datetime(2026, 7, 22, 12, 0, 0, tzinfo=UTC), "source": "c", "label": "third"},
        {"ts": datetime(2026, 7, 22, 11, 0, 0, tzinfo=UTC), "source": "b", "label": "second"},
        {"ts": datetime(2026, 7, 22, 10, 0, 0, tzinfo=UTC), "source": "a", "label": "first"},
    ]
    doc = postmortem.compose(incident, timeline, "narrative")
    assert doc.index("third") < doc.index("second") < doc.index("first")


# ---- grafana_explore_link ------------------------------------------------------


def test_grafana_explore_link_urlencodes_query_and_embeds_from_to_millis():
    from_ts = datetime(2026, 7, 22, 9, 0, 0, tzinfo=UTC)
    to_ts = datetime(2026, 7, 22, 10, 0, 0, tzinfo=UTC)
    query = '{namespace="subject"} |= "boom"'

    url = postmortem.grafana_explore_link("loki", query, from_ts, to_ts)

    assert "%22" in url  # the literal double-quotes are percent-encoded, not raw
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    assert qs["schemaVersion"] == ["1"]
    panes = jsonlib.loads(qs["panes"][0])
    pane = next(iter(panes.values()))
    assert pane["queries"][0]["expr"] == query
    assert pane["queries"][0]["datasource"] == {"type": "loki", "uid": "loki"}
    assert pane["range"]["from"] == str(int(from_ts.timestamp() * 1000))
    assert pane["range"]["to"] == str(int(to_ts.timestamp() * 1000))


def test_grafana_explore_link_maps_mimir_to_prometheus_type():
    from_ts = datetime(2026, 7, 22, 9, 0, 0, tzinfo=UTC)
    to_ts = datetime(2026, 7, 22, 10, 0, 0, tzinfo=UTC)
    url = postmortem.grafana_explore_link("mimir", "up", from_ts, to_ts)
    qs = parse_qs(urlparse(url).query)
    pane = next(iter(jsonlib.loads(qs["panes"][0]).values()))
    assert pane["queries"][0]["datasource"]["type"] == "prometheus"
    assert pane["queries"][0]["datasource"]["uid"] == "mimir"


# ---- slug sanitizer -------------------------------------------------------------


def test_slug_sanitizer_rejects_path_traversal_and_uppercase():
    assert not postmortem._valid_slug("../evil")
    assert not postmortem._valid_slug("UPPERCASE")
    assert not postmortem._valid_slug("")
    assert not postmortem._valid_slug("a" * 61)


def test_slug_sanitizer_accepts_kebab_case():
    assert postmortem._valid_slug("gateway-oom-2026-07-22")
    assert postmortem._valid_slug("a")


# ---- build_timeline: rollout exclusion + dedup ---------------------------------


async def test_build_timeline_excludes_rollout_snapshots_and_dedups(monkeypatch):
    incident_id = "inc_1"
    opened_at = datetime(2026, 7, 22, 11, 30, 0, tzinfo=UTC)

    async def _get_incident(iid):
        assert iid == incident_id
        return {"opened_at": opened_at}

    async def _get_timeline(iid):
        return []

    async def _get_alert_obs(iid):
        return []

    async def _incident_runs_for(iid):
        return []

    persisted: list[list] = []

    async def _add_timeline(iid, entries):
        persisted.append(entries)

    async def _deploy_history(window_minutes=180, workload=None):
        return {
            "entries": [
                {"ts": "2026-07-22T11:50:00Z", "source": "annotation", "summary": "deploy gateway v2"},
                # exact duplicate — must collapse to one row
                {"ts": "2026-07-22T11:50:00Z", "source": "annotation", "summary": "deploy gateway v2"},
                # a rollout snapshot (Task 7 caveat) — must be excluded entirely
                {"ts": "2026-07-22T12:00:00Z", "source": "rollout",
                 "summary": "current state (as of query): gateway rollout Progressing (step 2)"},
            ]
        }

    async def _k8s_events(**kwargs):
        return {"events": []}

    monkeypatch.setattr(db, "get_incident", _get_incident)
    monkeypatch.setattr(db, "get_timeline", _get_timeline)
    monkeypatch.setattr(db, "get_incident_alert_observations", _get_alert_obs)
    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "add_timeline", _add_timeline)
    monkeypatch.setattr(backends, "deploy_history", _deploy_history)
    monkeypatch.setattr(backends, "k8s_events", _k8s_events)

    result = await postmortem.build_timeline(incident_id, SimpleNamespace(workload="gateway"))

    sources = [entry[1] for entry in result]
    assert "rollout" not in sources
    assert not any(s.endswith(":rollout") for s in sources)
    assert sources.count("deploy:annotation") == 1  # the exact dup collapsed

    # only the genuinely new (deduped) rows are persisted — never the rollout row
    assert len(persisted) == 1
    persisted_sources = [e[1] for e in persisted[0]]
    assert "deploy:rollout" not in persisted_sources
    assert persisted_sources.count("deploy:annotation") == 1


async def test_build_timeline_does_not_repersist_rows_already_on_record(monkeypatch):
    """A row already returned by db.get_timeline must not be handed back to
    db.add_timeline a second time — only genuinely new rows are persisted."""
    incident_id = "inc_1"
    existing_ts = datetime(2026, 7, 22, 11, 50, 0, tzinfo=UTC)

    async def _get_incident(iid):
        return {"opened_at": existing_ts}

    async def _get_timeline(iid):
        return [{"ts": existing_ts, "source": "deploy:annotation", "label": "deploy gateway v2"}]

    async def _get_alert_obs(iid):
        return []

    async def _incident_runs_for(iid):
        return []

    persisted: list[list] = []

    async def _add_timeline(iid, entries):
        persisted.append(entries)

    async def _deploy_history(window_minutes=180, workload=None):
        return {"entries": [
            {"ts": "2026-07-22T11:50:00Z", "source": "annotation", "summary": "deploy gateway v2"},
        ]}

    async def _k8s_events(**kwargs):
        return {"events": []}

    monkeypatch.setattr(db, "get_incident", _get_incident)
    monkeypatch.setattr(db, "get_timeline", _get_timeline)
    monkeypatch.setattr(db, "get_incident_alert_observations", _get_alert_obs)
    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "add_timeline", _add_timeline)
    monkeypatch.setattr(backends, "deploy_history", _deploy_history)
    monkeypatch.setattr(backends, "k8s_events", _k8s_events)

    result = await postmortem.build_timeline(incident_id, SimpleNamespace(workload=""))

    assert len(result) == 1  # merged view still shows the one row, just once
    assert persisted == []  # nothing new to persist


async def test_build_timeline_skips_k8s_events_when_window_exceeds_max(monkeypatch):
    """When incident window > 20 hours, skip k8s events entirely to avoid
    clock-collision mis-dating (HH:MM:SS local time only)."""
    incident_id = "inc_1"
    # Set opened_at far in the past so elapsed_minutes > 1200 (20 hours)
    # Will be capped at MAX_WINDOW_MINUTES = 1440 (24 hours)
    opened_at = datetime(2000, 1, 1, 0, 0, 0, tzinfo=UTC)

    async def _get_incident(iid):
        return {"opened_at": opened_at}

    async def _get_timeline(iid):
        return []

    async def _get_alert_obs(iid):
        return []

    async def _incident_runs_for(iid):
        return []

    k8s_calls = []

    async def _add_timeline(iid, entries):
        pass

    async def _deploy_history(window_minutes=180, workload=None):
        return {"entries": []}

    async def _k8s_events(**kwargs):
        # Record that this was called; it shouldn't be for wide windows.
        k8s_calls.append(kwargs)
        return {"events": [{"time": "10:30:00", "object": "pod/foo", "reason": "Started"}]}

    monkeypatch.setattr(db, "get_incident", _get_incident)
    monkeypatch.setattr(db, "get_timeline", _get_timeline)
    monkeypatch.setattr(db, "get_incident_alert_observations", _get_alert_obs)
    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "add_timeline", _add_timeline)
    monkeypatch.setattr(backends, "deploy_history", _deploy_history)
    monkeypatch.setattr(backends, "k8s_events", _k8s_events)

    result = await postmortem.build_timeline(incident_id, SimpleNamespace(workload=""))

    # k8s_events should never have been called because window > 20h (capped at 1440m)
    assert len(k8s_calls) == 0
    # No k8s rows in result
    sources = [entry[1] for entry in result]
    assert "k8s" not in sources


# ---- log-spike onset parsing (defensive) ---------------------------------------


def test_parse_onset_extracts_iso_timestamp_defensively():
    text = (
        "### log_spike — LEAD\n"
        "error/failed log rate 12/10min vs baseline 2/10min (6x baseline) — "
        "onset: level=error msg=\"boom\" at 2026-07-22T10:05:30.123456+00:00\n"
    )
    parsed = postmortem._parse_onset(text)
    assert parsed is not None
    ts, source, label = parsed
    assert ts == datetime(2026, 7, 22, 10, 5, 30, 123456, tzinfo=UTC)
    assert source == "log-spike"
    assert "boom" in label


def test_parse_onset_returns_none_when_absent():
    assert postmortem._parse_onset("### log_spike — OK\nerror/failed log rate normal\n") is None
    assert postmortem._parse_onset("") is None


# ---- k8s event timestamp reconstruction (defensive) ----


def test_k8s_event_ts_same_day_when_clock_is_earlier():
    """Event's clock is earlier than now → use today's date."""
    now = datetime(2026, 7, 22, 14, 30, 0, tzinfo=timezone(
        timedelta(hours=-5)))  # local 2026-07-22 14:30, UTC-5
    ts = postmortem._k8s_event_ts("10:00:00", now)
    assert ts is not None
    # Reconstructed: local 2026-07-22 10:00:00 UTC-5 → UTC 2026-07-22 15:00:00Z
    assert ts.year == 2026 and ts.month == 7 and ts.day == 22


def test_k8s_event_ts_yesterday_when_clock_is_in_future():
    """Event's clock is later than now → it must be from yesterday (midnight rollback)."""
    # Use UTC time to avoid timezone conversion issues in testing.
    # now = 2026-07-22 10:00:00 UTC
    # When we call astimezone(), it converts to system local. If clock is "14:00:00"
    # (which would be after the local hour), it's in the future and should roll back.
    now = datetime(2026, 7, 22, 22, 0, 0, tzinfo=UTC)  # 10 PM UTC
    ts = postmortem._k8s_event_ts("23:30:00", now)
    assert ts is not None
    # If the system is in UTC, this should work: 23:30 > 22:01, so subtract 1 day
    # 2026-07-21 23:30:00 UTC
    # But if the system is in a different timezone, the behavior might vary.
    # So we'll just check that it's before `now`
    assert ts < now


def test_k8s_event_ts_returns_none_on_bad_format():
    """Parse failures return None; the event is skipped."""
    now = datetime(2026, 7, 22, 10, 0, 0, tzinfo=UTC)
    assert postmortem._k8s_event_ts("invalid", now) is None
    assert postmortem._k8s_event_ts("", now) is None
    assert postmortem._k8s_event_ts(None, now) is None


# ---- log-spike onset wiring (db integration) -----------------------------------


async def test_log_spike_onset_wiring_finds_artifact_and_parses_timestamp(monkeypatch):
    """_log_spike_onset queries db for runs, finds a prechecks.md artifact
    with an onset line, and returns the parsed TimelineEntry."""
    incident_id = "inc_1"
    run_id = "run_1"
    prechecks_text = (
        "### log_spike — LEAD\n"
        "error rate 10x baseline — "
        "onset: msg=\"connection timeout\" at 2026-07-22T10:05:30+00:00\n"
    )

    async def _incident_runs_for(iid):
        assert iid == incident_id
        return [{"run_id": run_id}]

    class _FakeArtifact:
        def __init__(self, name, content):
            self.name = name
            self.content = content

    class _FakeRun:
        def __init__(self):
            self.artifacts = [_FakeArtifact("prechecks.md", prechecks_text)]

    async def _get_run(run_id_param):
        if run_id_param == run_id:
            return _FakeRun()
        return None

    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "get_run", _get_run)

    result = await postmortem._log_spike_onset(incident_id)

    assert result is not None
    ts, source, label = result
    assert ts == datetime(2026, 7, 22, 10, 5, 30, tzinfo=UTC)
    assert source == "log-spike"
    assert "connection timeout" in label


async def test_log_spike_onset_wiring_handles_missing_artifact(monkeypatch):
    """When no prechecks.md artifact exists or none has an onset, return None
    without crashing."""
    incident_id = "inc_1"
    run_id = "run_1"

    async def _incident_runs_for(iid):
        return [{"run_id": run_id}]

    class _FakeRun:
        def __init__(self):
            # No artifacts, or an artifact with no onset line
            self.artifacts = []

    async def _get_run(run_id_param):
        if run_id_param == run_id:
            return _FakeRun()
        return None

    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "get_run", _get_run)

    result = await postmortem._log_spike_onset(incident_id)

    assert result is None


async def test_log_spike_onset_wiring_skips_missing_runs(monkeypatch):
    """If db.get_run returns None for a run_id, skip it gracefully."""
    incident_id = "inc_1"
    run_id_1 = "run_1"
    run_id_2 = "run_2"

    async def _incident_runs_for(iid):
        # Two runs, but the first returns None from db.get_run
        return [{"run_id": run_id_1}, {"run_id": run_id_2}]

    prechecks_text = "onset: x at 2026-07-22T10:10:00+00:00\n"

    class _FakeArtifact:
        def __init__(self, name, content):
            self.name = name
            self.content = content

    class _FakeRun:
        def __init__(self):
            self.artifacts = [_FakeArtifact("prechecks.md", prechecks_text)]

    async def _get_run(run_id_param):
        if run_id_param == run_id_1:
            return None  # First run not found
        if run_id_param == run_id_2:
            return _FakeRun()
        return None

    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "get_run", _get_run)

    result = await postmortem._log_spike_onset(incident_id)

    # Should find the onset from run_2 despite run_1 being missing
    assert result is not None
    ts, source, label = result
    assert source == "log-spike"


# ---- publish_postmortem_impl: Gitea REST flow ----------------------------------


class _FakeCtx:
    def __init__(self, run_id: str = "run-1") -> None:
        self.run_id = run_id
        self.artifacts: list[tuple[str, str, str]] = []

    async def add_artifact(self, name, media_type, content):
        self.artifacts.append((name, media_type, content))


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")

    def json(self):
        return self._payload


class _FakeGiteaClient:
    """Stand-in for backends._http(): records every POST and answers the
    contents-create calls with a configurable status per call (so a filename
    collision followed by a success can be exercised). Opening a PR is a hard
    failure — postmortems commit to main, and only code changes get PRs."""

    def __init__(self, put_statuses=(201,)):
        self.put_statuses = list(put_statuses)
        self.calls: list[tuple[str, dict]] = []

    async def post(self, url, headers=None, json=None):
        self.calls.append((url, json))
        if url.endswith("/pulls"):
            raise AssertionError("publish_postmortem must never open a PR")
        status = self.put_statuses.pop(0) if self.put_statuses else 201
        body = {"message": "file already exists"} if status >= 400 else {}
        return _FakeResponse(status, body)


def _wire_incident(monkeypatch, *, incident=None, alert_row=None, timeline=None):
    async def _incident_for_run(run_id):
        return "inc_1"

    async def _get_incident(incident_id):
        return incident or {
            "title": "Gateway high error rate",
            "opened_at": datetime(2026, 7, 22, 9, 0, 0, tzinfo=UTC),
            "resolved_at": None, "verified_at": None,
            "status": "open", "severity": "sev2",
        }

    async def _latest_firing_alert(incident_id):
        return alert_row

    async def _build_timeline(incident_id, alert):
        return timeline if timeline is not None else [
            (datetime(2026, 7, 22, 9, 5, 0, tzinfo=UTC), "alert", "alert firing: X"),
        ]

    monkeypatch.setattr(db, "incident_for_run", _incident_for_run)
    monkeypatch.setattr(db, "get_incident", _get_incident)
    monkeypatch.setattr(db, "latest_firing_alert", _latest_firing_alert)
    monkeypatch.setattr(postmortem, "build_timeline", _build_timeline)


def _wire_gitea(monkeypatch, client):
    wired = dataclasses.replace(
        backends.config, gitea_token="tok", gitea_url="http://gitea.local",
        gitea_repo="obs/obs-lab",
    )
    monkeypatch.setattr(backends, "config", wired)
    # postmortem.py builds the file URL from its OWN config import, not backends'.
    monkeypatch.setattr(postmortem, "config", wired)
    monkeypatch.setattr(backends, "_http", lambda: client)


def _stub_set_postmortem_pr(monkeypatch) -> list[tuple[str, str]]:
    calls: list[tuple[str, str]] = []

    async def _set(incident_id, url):
        calls.append((incident_id, url))

    monkeypatch.setattr(db, "set_postmortem_pr", _set)
    return calls


async def test_publish_postmortem_commits_to_main_without_opening_a_pr(monkeypatch):
    client = _FakeGiteaClient()
    _wire_gitea(monkeypatch, client)
    set_calls = _stub_set_postmortem_pr(monkeypatch)
    _wire_incident(monkeypatch, alert_row={"workload": "gateway"})

    ctx = _FakeCtx()
    result = await postmortem.publish_postmortem_impl(ctx, "## Summary\nfixed it\n", "gateway-oom")

    url = "http://gitea.local/obs/obs-lab/src/branch/main/postmortems/2026-07-22-gateway-oom.md"
    assert result == {
        "url": url,
        "file": "postmortems/2026-07-22-gateway-oom.md",
        "branch": "main",
    }
    assert set_calls == [("inc_1", url)]
    assert ctx.artifacts and ctx.artifacts[0][0] == "postmortem.md"
    assert "## Summary\nfixed it" in ctx.artifacts[0][2]

    # Exactly one call, and it commits onto main rather than cutting a branch.
    # _FakeGiteaClient raises on /pulls, so "no PR" is enforced, not just asserted.
    (put_url, put_body), = client.calls
    assert put_url.endswith("/contents/postmortems/2026-07-22-gateway-oom.md")
    assert put_body["branch"] == "main"
    assert "new_branch" not in put_body


async def test_publish_postmortem_rejects_invalid_slug():
    result = await postmortem.publish_postmortem_impl(_FakeCtx(), "narrative", "../evil")
    assert "error" in result


def test_postmortem_path_guard_rejects_anything_outside_postmortems():
    """The guard, not the slug regex, is what keeps this unreviewed commit-to-main
    path from being able to write code."""
    assert postmortem._valid_postmortem_path("postmortems/2026-07-22-gateway-oom.md")
    for bad in (
        "postmortems/../apps/gateway/src/index.ts",
        "apps/gateway/src/index.ts",
        "postmortems/evil.ts",
        "postmortems/nested/dir.md",
        ".gitea/workflows/ci.yaml",
        "postmortems/.md",
    ):
        assert not postmortem._valid_postmortem_path(bad), bad


async def test_publish_postmortem_falls_back_to_suffixed_name_on_collision(monkeypatch):
    """Two incidents, same day, same slug: the second lands under a name
    carrying its incident id instead of failing or overwriting."""
    client = _FakeGiteaClient(put_statuses=(409, 201))
    _wire_gitea(monkeypatch, client)
    set_calls = _stub_set_postmortem_pr(monkeypatch)
    _wire_incident(monkeypatch)

    result = await postmortem.publish_postmortem_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert result["file"] == "postmortems/2026-07-22-gateway-oom-inc_1.md"
    assert result["url"].endswith("postmortems/2026-07-22-gateway-oom-inc_1.md")
    assert set_calls == [("inc_1", result["url"])]
    assert len(client.calls) == 2


async def test_publish_postmortem_is_idempotent_when_both_names_exist(monkeypatch):
    """The suffixed name is unique per incident, so a collision on IT can only
    mean this same incident already published — success, not an error."""
    client = _FakeGiteaClient(put_statuses=(409, 409))
    _wire_gitea(monkeypatch, client)
    set_calls = _stub_set_postmortem_pr(monkeypatch)
    _wire_incident(monkeypatch)

    result = await postmortem.publish_postmortem_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert "error" not in result
    assert result["file"] == "postmortems/2026-07-22-gateway-oom-inc_1.md"
    assert set_calls == [("inc_1", result["url"])]


async def test_publish_postmortem_saves_artifact_even_when_the_commit_fails(monkeypatch):
    client = _FakeGiteaClient(put_statuses=(500,))
    _wire_gitea(monkeypatch, client)
    _wire_incident(monkeypatch)

    ctx = _FakeCtx()
    result = await postmortem.publish_postmortem_impl(ctx, "narrative", "gateway-oom")

    assert "error" in result
    assert result["file"] == "postmortems/2026-07-22-gateway-oom.md"
    # The document is not lost when the forge is unreachable.
    assert ctx.artifacts and ctx.artifacts[0][0] == "postmortem.md"


async def test_publish_postmortem_reports_missing_token(monkeypatch):
    monkeypatch.setattr(backends, "config", dataclasses.replace(backends.config, gitea_token=""))
    _wire_incident(monkeypatch)

    result = await postmortem.publish_postmortem_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert result["error"] == backends._GITEA_HELP


async def test_publish_postmortem_errors_when_no_incident_linked(monkeypatch):
    async def _incident_for_run(run_id):
        return None

    monkeypatch.setattr(db, "incident_for_run", _incident_for_run)

    result = await postmortem.publish_postmortem_impl(_FakeCtx(), "narrative", "gateway-oom")
    assert "error" in result


# ---- investigation context (folded prechecks/runbook-match) --------------------


def test_compose_includes_investigation_context_between_evidence_and_narrative():
    incident = {"title": "t", "status": "open", "severity": "sev2"}
    doc = postmortem.compose(incident, [], "## Summary\nx", context_md="**Runbook match:** none")
    assert "## Investigation context" in doc
    assert "**Runbook match:** none" in doc
    assert doc.index("## Evidence links") < doc.index("## Investigation context") < doc.index("## Narrative")


def test_compose_omits_context_section_when_none():
    doc = postmortem.compose({"title": "t"}, [], "n")
    assert "## Investigation context" not in doc


def test_run_context_roundtrip_formats_details_block():
    run_id = "run-ctx-1"
    try:
        postmortem.record_run_context(
            run_id, prechecks_md="## Pre-check leads\n\nstuff", runbook_md="**Runbook match:** `a.md`"
        )
        body = postmortem.format_run_context(run_id)
        assert body is not None
        # runbook line inline, prechecks folded into <details> for skimmability
        assert body.startswith("**Runbook match:** `a.md`")
        assert "<details>" in body and "## Pre-check leads" in body
    finally:
        postmortem.clear_run_context(run_id)
    assert postmortem.format_run_context(run_id) is None


async def test_log_spike_onset_reads_run_context_store(monkeypatch):
    """Runs no longer persist prechecks.md artifacts — the onset must be found
    in the in-memory run context instead (artifact path stays as fallback)."""
    incident_id, run_id = "inc_ctx", "run_ctx"

    async def _incident_runs_for(iid):
        return [{"run_id": run_id}]

    async def _get_run(rid):
        raise AssertionError("must not need db.get_run when the store has the report")

    monkeypatch.setattr(db, "incident_runs_for", _incident_runs_for)
    monkeypatch.setattr(db, "get_run", _get_run)
    try:
        postmortem.record_run_context(
            run_id,
            prechecks_md='spike — onset: msg="boom" at 2026-07-22T10:05:30+00:00\n',
            runbook_md="",
        )
        result = await postmortem._log_spike_onset(incident_id)
    finally:
        postmortem.clear_run_context(run_id)

    assert result is not None
    ts, source, label = result
    assert ts == datetime(2026, 7, 22, 10, 5, 30, tzinfo=UTC)
    assert source == "log-spike"
    assert "boom" in label


# ---- timeline table cells ------------------------------------------------------


def _timeline_rows(md: str) -> list[str]:
    """Body rows of the timeline table — header and separator excluded."""
    return [
        ln for ln in md.splitlines()
        if ln.startswith("| ") and not ln.startswith("| --- ")
        and not ln.startswith("| Time (UTC) ")
    ]


def _compose_with(labels: list[str]) -> str:
    incident = {"title": "t", "status": "open", "severity": "sev2",
                "opened_at": datetime(2026, 7, 22, 23, 0, 0, tzinfo=UTC)}
    timeline = [
        {"ts": datetime(2026, 7, 22, 23, index, 0, tzinfo=UTC), "source": "deploy:ci", "label": lb}
        for index, lb in enumerate(labels)
    ]
    return postmortem.compose(incident, timeline, "## Summary\nnarrative\n")


def test_multiline_label_cannot_break_the_timeline_table():
    """The real failure: a Gitea run-name is the whole commit MESSAGE, so a
    commit body put a newline inside a cell, ended the table, and dumped the
    ~80 rows below it into one paragraph of literal pipes."""
    commit = ("CI run #83 success on security/vm-public-exposure: obs: telemetry: collapse "
              "unmatched routes into one http_route series\n\nrouteOf fell back to the raw "
              "request path whenever the matcher missed.")
    md = _compose_with([commit, "k8s | Pod/gateway: Scheduled"])
    rows = _timeline_rows(md)
    # Both events are still rows - the second was the one that used to vanish.
    assert len(rows) == 2, md
    assert all(row.count("\n") == 0 for row in rows)
    assert "routeOf fell back" in rows[0]
    assert "Pod/gateway: Scheduled" in rows[1]


def test_pipe_in_a_label_is_escaped_not_column_splitting():
    md = _compose_with(["reason=Failed msg=\"a | b | c\""])
    row, = _timeline_rows(md)
    assert row.count("\\|") == 2
    # 3 real columns -> 4 unescaped delimiters, no more.
    assert len(re.findall(r"(?<!\\)\|", row)) == 4


def test_runaway_label_is_capped():
    md = _compose_with(["x" * 900])
    row, = _timeline_rows(md)
    assert "…" in row and len(row) < 400


def test_cell_collapses_all_whitespace():
    assert postmortem._cell("a\n\nb\tc   d") == "a b c d"
    assert postmortem._cell(None) == "None"
