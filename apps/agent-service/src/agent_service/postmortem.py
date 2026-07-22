"""Postmortems (PLAN-2 P11 Task 11) — the machine owns the timeline, the model
owns only the narrative.

`build_timeline` merges every source of "when did something happen" the
service already has — the existing machine timeline (remediation/verification
rows another step already wrote), the incident's raw alert-firing/-resolved
observations, the merged deploy/change history, the curated k8s event stream,
and the log-spike onset parsed out of the run's own `prechecks.md` artifact —
dedupes and sorts it, persists anything new, and hands back the full ordered
list. The model is never asked for a timestamp and could not invent one that
would end up in the document: `compose` renders the machine timeline verbatim
and appends the model's narrative below it, unmodified.

`open_postmortem_pr_impl` is the per-run tool `open_postmortem_pr` (registered
in `tools/sdk.py`) delegates to: build the timeline, compose the document,
push it to a new branch on the local Gitea forge, open a PR, record the URL.
"""

from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlencode

from . import db
from .config import config
from .tools import backends

# ---- slug -------------------------------------------------------------------

_SLUG_RE = re.compile(r"^[a-z0-9-]{1,60}\Z")


def _valid_slug(slug: str) -> bool:
    return bool(slug) and bool(_SLUG_RE.match(slug))


# ---- timeline merge -----------------------------------------------------------

TimelineEntry = tuple[datetime, str, str]

# The lookback window handed to deploy_history/k8s_events: enough to cover
# from incident-open to now, plus a small pre-open buffer (root causes often
# start a little before the alert actually fires), capped so a long-lived
# incident can't force an enormous query.
_MIN_WINDOW_MINUTES = 60
_MAX_WINDOW_MINUTES = 24 * 60
_PRE_OPEN_BUFFER_MINUTES = 30

# The log-spike pre-check's onset line (precheck.py `_shape_log_spike`):
# "... — onset: <log line> at <ISO timestamp>". `first_ts` is always
# `datetime.isoformat()` on a tz-aware UTC datetime, so `+00:00` is the
# common case; `Z` and a bare offset are matched too, defensively.
_ONSET_RE = re.compile(
    r"onset: (?P<line>.*?) at (?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}"
    r"(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))"
)

# k8s_events only reports HH:MM:SS local time, no date. When reconstructing
# against `now`, two events with colliding clock strings ~24h apart are
# indistinguishable. If the incident window exceeds this threshold, omitting
# k8s-event rows entirely is better than mis-dating them.
_K8S_EVENTS_MAX_WINDOW_HOURS = 20


def _window_minutes(opened_at: Any, now: datetime) -> int:
    if not isinstance(opened_at, datetime):
        return _MIN_WINDOW_MINUTES * 3
    elapsed_minutes = (now - opened_at.astimezone(timezone.utc)).total_seconds() / 60
    return int(min(max(elapsed_minutes + _PRE_OPEN_BUFFER_MINUTES, _MIN_WINDOW_MINUTES), _MAX_WINDOW_MINUTES))


def _parse_deploy_ts(value: Any) -> datetime | None:
    """deploy_history entries carry the canonical `%Y-%m-%dT%H:%M:%SZ` shape
    (backends._format_ts) — parsed defensively, never raises."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _k8s_event_ts(time_str: str, now: datetime) -> datetime | None:
    """k8s_events only reports a local HH:MM:SS time-of-day (no date, no
    timezone — see tools.backends.k8s_events). Reconstructed against `now`'s
    local date; if that lands in the future the event must actually belong to
    the previous day (a query near local midnight). Parse failures return
    None rather than raising — the event is simply skipped."""
    try:
        clock = datetime.strptime(time_str, "%H:%M:%S").time()
    except (ValueError, TypeError):
        return None
    local_now = now.astimezone()
    candidate = local_now.replace(
        hour=clock.hour, minute=clock.minute, second=clock.second, microsecond=0
    )
    if candidate > local_now + timedelta(minutes=1):
        candidate -= timedelta(days=1)
    return candidate.astimezone(timezone.utc)


def _parse_onset(text: str) -> TimelineEntry | None:
    match = _ONSET_RE.search(text or "")
    if match is None:
        return None
    raw_ts = match.group("ts")
    try:
        ts = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
    except ValueError:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (ts.astimezone(timezone.utc), "log-spike", f"log-spike onset: {match.group('line')}")


async def _log_spike_onset(incident_id: str) -> TimelineEntry | None:
    """The first (oldest-run-first) prechecks.md artifact on this incident
    whose log_spike section names an onset — absent entirely just means no
    run's pre-check battery found a spike (or none has run yet)."""
    for link in await db.incident_runs_for(incident_id):
        run = await db.get_run(link["run_id"])
        if run is None:
            continue
        for artifact in run.artifacts:
            if artifact.name != "prechecks.md":
                continue
            parsed = _parse_onset(artifact.content)
            if parsed is not None:
                return parsed
    return None


def _dedup(entries: list[TimelineEntry]) -> list[TimelineEntry]:
    seen: set[TimelineEntry] = set()
    deduped: list[TimelineEntry] = []
    for entry in entries:
        if entry in seen:
            continue
        seen.add(entry)
        deduped.append(entry)
    return deduped


async def build_timeline(incident_id: str, alert: Any) -> list[TimelineEntry]:
    """Merge every machine-observable source of "when" for this incident,
    dedupe on (ts, source, label), persist whatever is genuinely new, and
    return the full chronologically-ordered list. `alert` is duck-typed (only
    `.workload`, if present, is used to narrow deploy_history) so this module
    never needs to import `ingress` — same convention as `agents/oncall.py`.

    CRITICAL (Task 7 caveat): deploy_history entries with source == "rollout"
    are a current-state snapshot stamped at query time, not an event — they
    are excluded here entirely, never added to the timeline."""
    incident = await db.get_incident(incident_id)
    now = datetime.now(timezone.utc)
    opened_at = (incident or {}).get("opened_at")
    window_minutes = _window_minutes(opened_at, now)

    existing_rows = await db.get_timeline(incident_id)
    existing: list[TimelineEntry] = [
        (row["ts"].astimezone(timezone.utc), row["source"], row["label"])
        for row in existing_rows
        if isinstance(row.get("ts"), datetime)
    ]

    fresh: list[TimelineEntry] = []

    for row in await db.get_incident_alert_observations(incident_id):
        ts = row.get("starts_at")
        if isinstance(ts, datetime):
            fresh.append((
                ts.astimezone(timezone.utc),
                "alert",
                f"alert {row.get('status', '?')}: {row.get('alertname', '?')}",
            ))

    workload = getattr(alert, "workload", "") or None
    try:
        history = await backends.deploy_history(window_minutes=window_minutes, workload=workload)
    except Exception:  # noqa: BLE001 — one source outage must not sink the timeline
        history = {}
    entries = history.get("entries") if isinstance(history, dict) else None
    for item in entries or []:
        if item.get("source") == "rollout":
            continue  # current-state snapshot, not an event — see docstring
        ts = _parse_deploy_ts(item.get("ts"))
        if ts is not None:
            fresh.append((ts, f"deploy:{item.get('source', '?')}", item.get("summary", "")))

    # Skip k8s events when the window exceeds the max—clock-collision protection.
    if window_minutes <= _K8S_EVENTS_MAX_WINDOW_HOURS * 60:
        try:
            k8s = await backends.k8s_events(namespace="subject", range=f"{window_minutes}m", limit=100)
        except Exception:  # noqa: BLE001
            k8s = {}
        events = k8s.get("events") if isinstance(k8s, dict) else None
        for event in events or []:
            ts = _k8s_event_ts(event.get("time", ""), now)
            if ts is not None:
                label = f"{event.get('object', '?')}: {event.get('reason') or event.get('message') or ''}".strip()
                fresh.append((ts, "k8s", label))

    onset = await _log_spike_onset(incident_id)
    if onset is not None:
        fresh.append(onset)

    fresh = _dedup(fresh)
    existing_set = set(existing)
    to_persist = [entry for entry in fresh if entry not in existing_set]
    if to_persist:
        await db.add_timeline(incident_id, to_persist)

    merged = _dedup(existing + fresh)
    merged.sort(key=lambda entry: entry[0])
    return merged


# ---- compose ------------------------------------------------------------------


def _fmt_header_dt(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    return str(value)


def _row_time(ts: Any, anchor_date) -> str:
    if not isinstance(ts, datetime):
        return str(ts)
    ts = ts.astimezone(timezone.utc)
    if anchor_date is not None and ts.date() != anchor_date:
        return ts.strftime("%Y-%m-%d %H:%M:%SZ")
    return ts.strftime("%H:%M:%SZ")


_EVIDENCE_LOKI_QUERY = '{namespace="subject"} |~ "(?i)error|failed"'
_EVIDENCE_MIMIR_QUERY = (
    'histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le))'
)


def compose(incident: dict, timeline: list[dict], narrative_md: str) -> str:
    """Render the postmortem Markdown: machine header, machine timeline table
    (verbatim, in the order given — never sorted or reordered here, that's
    build_timeline's job), machine-built Grafana evidence links, then the
    model's narrative appended unmodified below."""
    title = incident.get("title") or "(untitled incident)"
    status = incident.get("status") or "unknown"
    severity = incident.get("severity") or "unknown"
    verified_at = incident.get("verified_at")
    verified = f"yes ({_fmt_header_dt(verified_at)})" if verified_at else "no"
    opened_at = incident.get("opened_at")
    resolved_at = incident.get("resolved_at")

    lines: list[str] = [
        f"# Postmortem: {title}",
        "",
        f"- **Status:** {status}",
        f"- **Severity:** {severity}",
        f"- **Verified:** {verified}",
        f"- **Opened:** {_fmt_header_dt(opened_at) or 'unknown'}",
        f"- **Resolved:** {_fmt_header_dt(resolved_at) or '(still open)'}",
        "",
        "## Timeline (machine-generated)",
        "",
    ]

    anchor_date = None
    for row in timeline:
        if isinstance(row.get("ts"), datetime):
            anchor_date = row["ts"].astimezone(timezone.utc).date()
            break
    if anchor_date is not None:
        lines.append(f"All times UTC on {anchor_date.isoformat()} unless a full date is shown.")
        lines.append("")

    lines.append("| Time (UTC) | Source | Event |")
    lines.append("| --- | --- | --- |")
    for row in timeline:
        time_cell = _row_time(row.get("ts"), anchor_date)
        source = str(row.get("source", ""))
        label = str(row.get("label", "")).replace("|", "\\|")
        lines.append(f"| {time_cell} | {source} | {label} |")
    lines.append("")

    from_ts = opened_at if isinstance(opened_at, datetime) else (
        timeline[0]["ts"] if timeline and isinstance(timeline[0].get("ts"), datetime)
        else datetime.now(timezone.utc)
    )
    to_ts = resolved_at if isinstance(resolved_at, datetime) else datetime.now(timezone.utc)
    loki_link = grafana_explore_link("loki", _EVIDENCE_LOKI_QUERY, from_ts, to_ts)
    mimir_link = grafana_explore_link("mimir", _EVIDENCE_MIMIR_QUERY, from_ts, to_ts)
    lines += [
        "## Evidence links",
        "",
        f"- [Loki — logs over the incident window]({loki_link})",
        f"- [Mimir — metrics over the incident window]({mimir_link})",
        "",
        "## Narrative",
        "",
        narrative_md.strip(),
        "",
    ]
    return "\n".join(lines).rstrip() + "\n"


# ---- Grafana Explore deep links ------------------------------------------------

# Grafana's Explore query-model "type" for each datasource uid (from
# infra/grafana/provisioning/datasources/datasources.yaml) — the Mimir
# datasource's Grafana-facing type is "prometheus", not "mimir".
_DATASOURCE_TYPES = {"loki": "loki", "mimir": "prometheus"}


def grafana_explore_link(datasource: str, query: str, from_ts: datetime, to_ts: datetime) -> str:
    """A Grafana 13 Explore deep link (schemaVersion=1) for one datasource +
    query over an absolute [from_ts, to_ts] window — evidence the postmortem
    reader can click straight into instead of "go search it yourself"."""
    ds_type = _DATASOURCE_TYPES.get(datasource, datasource)
    pane = {
        "datasource": datasource,
        "queries": [{
            "refId": "A",
            "datasource": {"type": ds_type, "uid": datasource},
            "expr": query,
        }],
        "range": {
            "from": str(int(from_ts.timestamp() * 1000)),
            "to": str(int(to_ts.timestamp() * 1000)),
        },
    }
    params = {"schemaVersion": "1", "panes": json.dumps({"pm": pane}), "orgId": "1"}
    return f"{config.grafana_url}/explore?{urlencode(params)}"


# ---- Gitea PR -------------------------------------------------------------------


async def open_postmortem_pr_impl(ctx: Any, narrative_md: str, slug: str) -> dict:
    """The `open_postmortem_pr` tool: build the machine timeline, compose the
    document, push it to a new branch on the local Gitea forge, open a PR
    against main, record the URL, and keep a copy as a run artifact."""
    if not _valid_slug(slug):
        return {"error": f"invalid slug {slug!r} — must match [a-z0-9-]{{1,60}}"}

    incident_id = await db.incident_for_run(ctx.run_id)
    if incident_id is None:
        return {"error": f"no incident is linked to run {ctx.run_id}"}

    incident = await db.get_incident(incident_id)
    if incident is None:
        return {"error": f"incident {incident_id} not found"}

    alert_row = await db.latest_firing_alert(incident_id)
    alert = SimpleNamespace(workload=(alert_row or {}).get("workload") or "")
    timeline_entries = await build_timeline(incident_id, alert)
    timeline = [
        {"ts": ts, "source": source, "label": label} for ts, source, label in timeline_entries
    ]
    document = compose(incident, timeline, narrative_md)

    opened_at = incident.get("opened_at")
    date_str = (
        opened_at.astimezone(timezone.utc).strftime("%Y-%m-%d")
        if isinstance(opened_at, datetime)
        else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    filename = f"postmortems/{date_str}-{slug}.md"
    branch = f"postmortem/{incident_id}"
    title = incident.get("title") or incident_id

    content_b64 = base64.b64encode(document.encode("utf-8")).decode("ascii")
    put_result = await backends.gitea_put_file(
        filename, content_b64, branch, f"postmortem: {slug}"
    )
    if "error" in put_result:
        return {"error": put_result["error"]}
    # status == "branch_exists" (409/422 from a prior attempt) is not fatal —
    # fall through and try opening the PR against whatever is already there.

    pr_result = await backends.gitea_open_pr(branch, "main", f"Postmortem: {title}", "")
    if "error" in pr_result:
        # Still save the composed markdown as artifact even on PR-open failure — aids debugging.
        await ctx.add_artifact(name="postmortem.md", media_type="text/markdown", content=document)
        # Surfaced gracefully, same as gitea_open_pr's own callers do: an
        # existing PR (or nothing to diff) is reported, not raised.
        return {"error": pr_result["error"], "file": filename}

    pr_url = pr_result.get("pr_url")
    await db.set_postmortem_pr(incident_id, pr_url)
    await ctx.add_artifact(name="postmortem.md", media_type="text/markdown", content=document)
    return {"pr_url": pr_url, "file": filename}
