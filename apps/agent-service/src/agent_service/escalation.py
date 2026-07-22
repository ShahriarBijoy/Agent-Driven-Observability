"""Re-escalation watcher (PLAN-2 P11, Task 4) — the fix that failed.

`/webhook/alerts` (Task 3) dedupes a still-firing alert into its existing open
incident instead of spawning a fresh investigation each re-fire — good for
noise, bad the moment the oncall agent's proposed fix doesn't actually work:
the incident just sits open with no one looking at it again. This module is
the other half: a background poll that finds open incidents whose
verification deadline has passed while the alert is *still firing*, and
spawns a NEW linked `oncall` run to re-investigate — carrying the prior
diagnosis forward and naming the failure-matrix scenario explicitly (a fix
stuck behind a red CI pipeline never took effect at all).

`escalation_due` is the pure decision function (unit-tested against a matrix
in tests/test_escalation.py); `escalate` does the I/O — rebuild the
AlertEvent, bump the escalation counter, push a fresh deadline, spawn the
linked run; `watcher_loop` is the forever-poll wired into app.py's lifespan.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from . import db, ingress
from .agents.base import AgentSessionError
from .agents.oncall import run_oncall
from .config import config
from .context import RunContext, new_run

logger = logging.getLogger(__name__)

MAX_ESCALATIONS = 3


def escalation_due(incident: dict, state: dict, now: datetime) -> bool:
    """True iff `incident` needs a re-escalation right now: open, its
    verify_deadline has passed, the alert feed is still firing (the last
    firing observation is newer than the last resolved one, or nothing has
    resolved it at all), and it hasn't already been escalated MAX_ESCALATIONS
    times."""
    if incident.get("status") != "open":
        return False
    if incident.get("escalations", 0) >= MAX_ESCALATIONS:
        return False
    deadline = incident.get("verify_deadline")
    if deadline is None or deadline >= now:
        return False
    last_firing = state.get("last_firing")
    if last_firing is None:
        return False
    last_resolved = state.get("last_resolved")
    if last_resolved is not None and last_resolved >= last_firing:
        return False
    return True


def _rebuild_event(payload: dict) -> ingress.AlertEvent | None:
    """Re-normalize an incident's stored alert `payload` JSONB back into an
    AlertEvent. A gitops row's payload IS the full event payload verbatim
    (`_normalize_gitops` consumes it directly); a Grafana row's payload is a
    single `alerts[]` entry (`_normalize_grafana`'s per-alert shape), so that
    one needs rewrapping before `ingress.normalize` recognises it."""
    if "event" in payload or "alerts" in payload:
        wrapped = payload
    else:
        wrapped = {"alerts": [payload], "commonLabels": {}, "status": payload.get("status")}
    events = ingress.normalize(wrapped)
    return events[0] if events else None


async def _prior_diagnosis(incident_id: str) -> str:
    """The most recent linked run's final assistant narration — what the last
    investigation actually concluded, so the escalated pass has something
    concrete to build on instead of repeating a remediation blind."""
    runs = await db.incident_runs_for(incident_id)
    if not runs:
        return ""
    run = await db.get_run(runs[-1]["run_id"])
    if run is None:
        return ""
    for msg in reversed(run.messages):
        if msg.role == "assistant" and msg.content.strip():
            return msg.content.strip()
    return ""


async def _guarded(ctx: RunContext, incident_id: str, ev: ingress.AlertEvent, escalation: dict) -> None:
    """Mirrors app.py's `_guard_run`: a crashed re-escalation must still end
    the run honestly rather than leave it hanging."""
    try:
        await run_oncall(ctx, incident_id, ev, escalation=escalation)
    except AgentSessionError as exc:
        await ctx.end("failed", summary=str(exc))
    except Exception as exc:  # noqa: BLE001
        await ctx.fail(f"agent crashed: {exc}")


async def escalate(incident: dict) -> str | None:
    """Spawn a linked `re-escalation` run for a still-firing, past-deadline
    incident. Returns the new run's id, or None when there's no firing alert
    on record to rebuild an AlertEvent from (nothing to re-investigate)."""
    incident_id = incident["id"]
    alert_row = await db.latest_firing_alert(incident_id)
    if alert_row is None:
        logger.warning("escalate(%s): no firing alert on record, skipping", incident_id)
        return None
    ev = _rebuild_event(alert_row["payload"])
    if ev is None:
        logger.warning("escalate(%s): could not rebuild an AlertEvent, skipping", incident_id)
        return None

    prior_diagnosis = await _prior_diagnosis(incident_id)
    attempt = await db.bump_escalations(incident_id)
    await db.set_verify_deadline(
        incident_id,
        datetime.now(timezone.utc) + timedelta(minutes=config.oncall_verify_minutes),
    )

    ctx = new_run("oncall", ev.tenant, ev.summary)
    await db.create_run(ctx.run, "escalation")
    await db.link_run(incident_id, ctx.run.id, "re-escalation")

    escalation = {"prior_diagnosis": prior_diagnosis, "attempt": attempt}
    asyncio.create_task(_guarded(ctx, incident_id, ev, escalation))
    return ctx.run.id


async def watcher_loop(interval_seconds: int = 60) -> None:
    """Forever: poll `due_incidents`, escalate whichever are still firing.
    Errors are logged, never fatal — one bad incident (or a transient DB
    hiccup) must not kill the whole poll loop."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            for incident in await db.due_incidents(now):
                try:
                    state = await db.alert_state(incident["id"])
                    if escalation_due(incident, state, now):
                        await escalate(incident)
                except Exception:  # noqa: BLE001
                    logger.exception(
                        "escalation watcher: failed handling incident %s", incident.get("id")
                    )
        except Exception:  # noqa: BLE001
            logger.exception("escalation watcher: poll failed")
        await asyncio.sleep(interval_seconds)
