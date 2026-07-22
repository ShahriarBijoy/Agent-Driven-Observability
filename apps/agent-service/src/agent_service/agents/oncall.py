"""On-call agent — triggered when an alert maps to a runbook-carrying
workload (phase-11 Task 3, `ingress.py`). Investigates from pre-check leads
injected into the conversation, consults the matched runbook, correlates with
deploy history, proposes a dry-run remediation gated behind
`request_approval`, executes it once approved, re-verifies recovery via
`alert_status`, and closes the loop with `open_postmortem_pr`.

`alert` (an `ingress.AlertEvent`) is typed loosely here (`Any`) so this module
never has to import `ingress` — used only via duck-typed attribute access:
`.alertname`, `.summary`, `.severity`, `.tenant`, plus whatever `.labels` /
`.annotations` mappings it carries.

`escalation` (Task 4, `escalation.py`'s `escalate()`) is
`{"prior_diagnosis": str, "attempt": int}` when this run is a re-escalation
of a still-firing, past-deadline incident — `_ESCALATION_FRAME` is the exact
framing both the banner and the prompt surface to the model.

Pre-check injection (Task 5, `precheck.py`): before the model takes its first
turn, the deterministic check battery runs and its leads-first report is
prepended to the prompt (and persisted as the `prechecks.md` artifact) — the
Grafana Sift pattern.

Runbook-driven narrowing (Task 6, `tools/backends.py`'s `runbook_lookup`):
`runbook_lookup` returns EVERY runbook matching the alert's exact name, not
just one — a tied alertname (e.g. `slo-avail-fast`/`gw-5xx` claimed by both
`gateway-high-error-rate.md` and `stale-secret.md`) must not silently lose
the second runbook's remediation tools by only keeping a sorted-filename
first match. The session's allow-list narrows to the UNION of every matched
runbook's `tools` metadata (union'd with `ONCALL_ALWAYS_TOOLS`, the
investigation/session spine every oncall run keeps regardless) —
`apply_override` (agents/base.py) guarantees this can only SHRINK the
baseline, never grant a tool the agent kind wasn't already given. No match
means no narrowing: the full baseline stays in play.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from .. import db, precheck
from ..config import config
from ..context import RunContext
from ..tools import backends
from ..tools import sdk as toolsdk
from .base import run_agent_session

logger = logging.getLogger(__name__)

# Display-name stripping (mcp__obslab__x -> x) is shared with agents/base.py
# via toolsdk.display_name (toolsdk is a leaf module both already import; it
# can't import base.py back without a cycle).
_plain_name = toolsdk.display_name


_ESCALATION_FRAME = (
    "Prior diagnosis + continued impact — the earlier fix did not restore service "
    "(attempt {attempt}). Re-examine, and check whether the fix itself is stuck "
    "(e.g. a red CI pipeline)."
)


def _alert_banner(alert: Any, escalation: dict | None) -> str:
    """One-line summary for the run's user-message log.

    escalation (Task 4, escalation.py): {"prior_diagnosis": str, "attempt": int}.
    """
    banner = f"On-call page: {alert.alertname} ({alert.severity}) — {alert.summary}"
    if escalation:
        banner += "\n" + _ESCALATION_FRAME.format(attempt=escalation.get("attempt", "?"))
    return banner


def _build_prompt(
    alert: Any,
    incident_id: str,
    escalation: dict | None,
    precheck_report: str = "",
    runbook_match: dict | None = None,
) -> str:
    """The agent's first-turn prompt — alert labels/annotations verbatim, so
    the model works from the real payload rather than a paraphrase.

    `precheck_report` (Task 5) is the rendered pre-check battery output,
    prepended ahead of everything else so the very first thing the model
    reads is real, already-gathered evidence rather than a blank page.

    `runbook_match` (Task 6) is `backends.runbook_lookup`'s result. On a
    match, EVERY matched runbook's body + hypotheses (each labeled with its
    filename) go straight into the prompt so the model starts from the
    runbooks' own diagnostic steps instead of re-deriving them — a tied
    alertname can match more than one. No match is noted explicitly rather
    than silently omitted, so the model doesn't assume one exists."""
    payload = {
        "alertname": alert.alertname,
        "severity": alert.severity,
        "tenant": alert.tenant,
        "summary": alert.summary,
        "labels": getattr(alert, "labels", None) or {},
        "annotations": getattr(alert, "annotations", None) or {},
    }
    escalation_note = ""
    if escalation:
        prior = escalation.get("prior_diagnosis") or "(no prior diagnosis recorded)"
        escalation_note = (
            "\n\n" + _ESCALATION_FRAME.format(attempt=escalation.get("attempt", "?"))
            + " Do not repeat a remediation that already failed without a new hypothesis "
            f"backed by new evidence.\n\nPrior diagnosis:\n{prior}"
        )
    precheck_section = f"{precheck_report}\n\n" if precheck_report else ""
    matches = (runbook_match or {}).get("matches") or []
    if matches:
        sections = []
        for m in matches:
            meta = m.get("meta") or {}
            hypotheses = meta.get("hypotheses") or []
            hyp_lines = "\n".join(f"- {h}" for h in hypotheses) or "(none listed)"
            sections.append(
                f"### {m['runbook']}\n\nCandidate hypotheses:\n{hyp_lines}\n\n"
                f"Runbook body:\n{m.get('content', '')}"
            )
        plural = "runbook" if len(matches) == 1 else f"{len(matches)} runbooks"
        runbook_section = (
            f"Matched {plural} for this alert — your toolset for this incident has been "
            "narrowed to their combined needs (see the boundary line below).\n\n"
            + "\n\n".join(sections) + "\n\n"
        )
    else:
        runbook_section = (
            "No runbook matched this alert — no tool narrowing applied; investigate with the "
            "full toolset and consider what a new runbook for this alert should cover.\n\n"
        )
    return (
        f"{precheck_section}{runbook_section}"
        f"Incident {incident_id}: an alert fired and it's your page.\n\n"
        f"Alert (labels/annotations verbatim):\n{json.dumps(payload, indent=2, default=str)}"
        f"{escalation_note}\n\n"
        "Work the incident end to end: investigate from the pre-check leads already in this "
        "conversation, consult the matched runbook, correlate with deploy_history, name the "
        "root cause with evidence, dry-run your remediation and put the diff in the "
        "request_approval summary, execute once approved, re-query alert_status until "
        "recovery (or report failure explicitly), then close with open_postmortem_pr."
    )


def _runbook_artifact(match: dict, allowed_override: list[str] | None) -> str:
    """The `runbook-match.md` artifact: EVERY runbook that matched (or none)
    and the resulting narrowed toolset — the acceptance signal that a runbook
    match (or a tied multi-match) visibly narrows the toolbox."""
    matches = match.get("matches") or []
    if matches:
        names = ", ".join(f"`{m['runbook']}`" for m in matches)
        tools = ", ".join(sorted(_plain_name(t) for t in (allowed_override or []))) or "(none)"
        return (
            f"# Runbook match\n\n**Matched ({len(matches)}):** {names}\n\n"
            f"**Narrowed toolset ({len(allowed_override or [])} tools):** {tools}\n"
        )
    available = ", ".join(match.get("available") or []) or "(no runbooks found)"
    return (
        "# Runbook match\n\n**Matched:** none — no tool narrowing applied for this alert.\n\n"
        f"**Available runbooks:** {available}\n"
    )


async def _close_incident(ctx: RunContext, incident_id: str, alert: Any) -> None:
    """The verify-then-close step (PLAN-2 P11 Task 10): runs AFTER the model's
    session ends, BEFORE ctx.end — incidents close on OBSERVED recovery only,
    decided by `closing_decision` (code), never by the model's own report.

    `remediated` comes from the machine timeline (a source='remediation' row
    only tools.remediate's success path writes); `active` comes from
    Alertmanager via `backends.grafana_active_alerts` — an error dict is
    treated as active=True (conservative: never close on an unknown state).
    Wrapped end-to-end so any exception here degrades to leaving the incident
    open rather than crashing the run's close-out.
    """
    # Local import: escalation.py imports agents.oncall at module level (for
    # run_oncall), so importing escalation back at oncall's module level
    # would be a circular import; deferring it to call time breaks the cycle.
    from ..escalation import closing_decision

    try:
        remediated = await db.incident_was_remediated(incident_id)
        status = await backends.grafana_active_alerts(alert.alertname)
        active = True if "error" in status else bool(status.get("active"))
        decision = closing_decision(remediated, active)
        now = datetime.now(timezone.utc)
        if decision == "verify":
            await db.mark_verified(incident_id, now)
            await db.add_timeline(
                incident_id,
                [(now, "verification", f"recovery verified: {alert.alertname} no longer firing")],
            )
        elif decision == "resolve":
            await db.mark_verified(
                incident_id, now, summary="alert cleared without remediation"
            )
        else:  # "deadline" or "leave-open" — recovery not (yet) confirmed
            # ensure_verify_deadline (not set_verify_deadline): must not stomp
            # a deadline the remediation recording already armed, but a
            # never-remediated ("leave-open") incident still needs one so the
            # escalation watcher's due_incidents query can find it.
            await db.ensure_verify_deadline(
                incident_id, now + timedelta(minutes=config.oncall_verify_minutes)
            )
            await db.add_timeline(
                incident_id,
                [(now, "verification", "recovery NOT verified — deadline armed")],
            )
    except Exception as exc:  # noqa: BLE001 — never crash the run's close-out
        logger.warning("closing step failed for incident %s: %s", incident_id, exc)


async def run_oncall(
    ctx: RunContext, incident_id: str, alert: Any, *, escalation: dict | None = None
) -> None:
    await ctx.begin(trigger="alert")
    await ctx.add_user_message(_alert_banner(alert, escalation))

    # Pre-check battery (Task 5): deterministic, non-agentic leads gathered
    # BEFORE the model's first turn — persisted as an artifact and prepended
    # to the prompt so the very first tool call the model makes is already
    # informed by them, not a cold start.
    results = await precheck.run_prechecks(alert)
    report = precheck.render_report(results)
    await ctx.add_artifact(name="prechecks.md", media_type="text/markdown", content=report)

    # Runbook match (Task 6): narrows the allow-list to the UNION of every
    # matched runbook's declared tools (a tied alertname can match more than
    # one runbook — e.g. slo-avail-fast/gw-5xx claimed by both
    # gateway-high-error-rate.md and stale-secret.md — and both runbooks'
    # remediation tools must stay on offer), union'd with the always-on
    # investigation/session spine — apply_override (agents/base.py) can only
    # shrink this, never grow it.
    match = await backends.runbook_lookup(alert.alertname)
    matches = match.get("matches") or []
    allowed_override: list[str] | None = None
    if matches:
        meta_tools: set[str] = set()
        for m in matches:
            meta_tools |= set((m.get("meta") or {}).get("tools") or [])
        allowed_override = sorted(
            {toolsdk.mcp(name) for name in meta_tools} | set(toolsdk.ONCALL_ALWAYS_TOOLS)
        )
    await ctx.add_artifact(
        name="runbook-match.md", media_type="text/markdown",
        content=_runbook_artifact(match, allowed_override),
    )

    prompt = _build_prompt(alert, incident_id, escalation, precheck_report=report, runbook_match=match)
    await run_agent_session(ctx, "oncall", prompt, max_turns=40, allowed_override=allowed_override)
    # Verify-then-close (Task 10): decided by code from an OBSERVED signal —
    # never by the model's own narration of success.
    await _close_incident(ctx, incident_id, alert)
    await ctx.end("completed", summary=f"{incident_id}: {alert.alertname}")


async def run_oncall_chat(ctx: RunContext, message: str) -> None:
    """Ad-hoc chat entrypoint (CHAT_AGENTS) — lets an operator talk to the
    on-call agent directly, outside the alert-triggered `run_oncall` path."""
    await ctx.begin(trigger="chat")
    await ctx.add_user_message(message)
    await run_agent_session(ctx, "oncall", message, max_turns=40)
    await ctx.end("completed")
