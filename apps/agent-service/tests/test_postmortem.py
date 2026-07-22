"""postmortem.py (PLAN-2 P11 Task 11): the machine owns the timeline, the
model owns only the narrative.

`build_timeline` merges every machine-observable "when" source and must
exclude deploy_history's source=="rollout" entries (a current-state snapshot
stamped at query time, not an event — the Task 7 caveat) and dedupe on
(ts, source, label). `compose` renders whatever timeline it's given verbatim,
in the given order, and appends the model's narrative unmodified below it —
it never sorts or reorders. `grafana_explore_link` builds a URL-encoded
Grafana Explore deep link. `open_postmortem_pr_impl` is the per-run tool:
compose + push to a new Gitea branch + open a PR, gracefully handling an
already-existing branch/PR."""

from __future__ import annotations

import dataclasses
import json as jsonlib
from datetime import datetime, timezone
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


# ---- open_postmortem_pr_impl: Gitea REST flow ----------------------------------


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
    contents-create and pulls-create calls with configurable status codes."""

    def __init__(self, put_status=201, pr_status=201, pr_payload=None):
        self.put_status = put_status
        self.pr_status = pr_status
        self.pr_payload = pr_payload or {"html_url": "http://gitea.local/obs/obs-lab/pulls/7"}
        self.calls: list[tuple[str, dict]] = []

    async def post(self, url, headers=None, json=None):
        self.calls.append((url, json))
        if url.endswith("/pulls"):
            return _FakeResponse(self.pr_status, self.pr_payload if self.pr_status < 400 else {})
        return _FakeResponse(self.put_status, {})


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
    monkeypatch.setattr(
        backends, "config",
        dataclasses.replace(
            backends.config, gitea_token="tok", gitea_url="http://gitea.local",
            gitea_repo="obs/obs-lab",
        ),
    )
    monkeypatch.setattr(backends, "_http", lambda: client)


async def test_open_postmortem_pr_happy_path(monkeypatch):
    client = _FakeGiteaClient()
    _wire_gitea(monkeypatch, client)
    set_calls = []

    async def _set_postmortem_pr(incident_id, url):
        set_calls.append((incident_id, url))

    monkeypatch.setattr(db, "set_postmortem_pr", _set_postmortem_pr)
    _wire_incident(monkeypatch, alert_row={"workload": "gateway"})

    ctx = _FakeCtx()
    result = await postmortem.open_postmortem_pr_impl(ctx, "## Summary\nfixed it\n", "gateway-oom")

    assert result == {
        "pr_url": "http://gitea.local/obs/obs-lab/pulls/7",
        "file": "postmortems/2026-07-22-gateway-oom.md",
    }
    assert set_calls == [("inc_1", "http://gitea.local/obs/obs-lab/pulls/7")]
    assert ctx.artifacts and ctx.artifacts[0][0] == "postmortem.md"
    assert "## Summary\nfixed it" in ctx.artifacts[0][2]

    put_call, pr_call = client.calls
    assert put_call[0].endswith("/contents/postmortems/2026-07-22-gateway-oom.md")
    assert put_call[1]["new_branch"] == "postmortem/inc_1"
    assert pr_call[0].endswith("/pulls")
    assert pr_call[1]["head"] == "postmortem/inc_1"
    assert pr_call[1]["title"] == "Postmortem: Gateway high error rate"


async def test_open_postmortem_pr_rejects_invalid_slug():
    result = await postmortem.open_postmortem_pr_impl(_FakeCtx(), "narrative", "../evil")
    assert "error" in result


async def test_open_postmortem_pr_surfaces_existing_pr_gracefully(monkeypatch):
    client = _FakeGiteaClient(pr_status=409)
    _wire_gitea(monkeypatch, client)
    _wire_incident(monkeypatch)

    result = await postmortem.open_postmortem_pr_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert "error" in result and "already exists" in result["error"]
    assert result["file"] == "postmortems/2026-07-22-gateway-oom.md"


async def test_open_postmortem_pr_tolerates_branch_already_existing(monkeypatch):
    """A 409/422 from the file-create call (branch already there from a prior
    attempt) is not fatal — the flow still tries to open the PR."""
    client = _FakeGiteaClient(put_status=409)
    _wire_gitea(monkeypatch, client)
    _wire_incident(monkeypatch)

    async def _set_postmortem_pr(incident_id, url):
        pass

    monkeypatch.setattr(db, "set_postmortem_pr", _set_postmortem_pr)

    result = await postmortem.open_postmortem_pr_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert result["pr_url"] == "http://gitea.local/obs/obs-lab/pulls/7"
    assert len(client.calls) == 2  # still attempted the PR open


async def test_open_postmortem_pr_reports_missing_token(monkeypatch):
    monkeypatch.setattr(backends, "config", dataclasses.replace(backends.config, gitea_token=""))
    _wire_incident(monkeypatch)

    result = await postmortem.open_postmortem_pr_impl(_FakeCtx(), "narrative", "gateway-oom")

    assert result["error"] == backends._GITEA_HELP


async def test_open_postmortem_pr_errors_when_no_incident_linked(monkeypatch):
    async def _incident_for_run(run_id):
        return None

    monkeypatch.setattr(db, "incident_for_run", _incident_for_run)

    result = await postmortem.open_postmortem_pr_impl(_FakeCtx(), "narrative", "gateway-oom")
    assert "error" in result
