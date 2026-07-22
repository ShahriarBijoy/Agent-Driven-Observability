"""On-call agent — triggered when an alert maps to a runbook-carrying
workload (phase-11 Task 3, `ingress.py`, not built yet). Investigates from
pre-check leads injected into the conversation, consults the matched
runbook, correlates with deploy history, proposes a dry-run remediation
gated behind `request_approval`, executes it once approved, re-verifies
recovery via `alert_status`, and closes the loop with `open_postmortem_pr`.

`AlertEvent` doesn't exist yet — Task 3 (`ingress.py`) defines it. `alert` is
therefore typed loosely here (`Any`) and used only via duck-typed attribute
access: `.alertname`, `.summary`, `.severity`, `.tenant`, plus whatever
`.labels` / `.annotations` mappings it carries. Do not import from
`ingress` — it doesn't exist and this module must not create it.

This is the orchestration skeleton only: pre-check injection, runbook-driven
`allowed_override` narrowing, and closing verification are wired in later
tasks (5, 6, 10).
"""

from __future__ import annotations

import json
from typing import Any

from ..context import RunContext
from .base import run_agent_session


def _alert_banner(alert: Any, escalation: dict | None) -> str:
    """One-line summary for the run's user-message log."""
    banner = f"On-call page: {alert.alertname} ({alert.severity}) — {alert.summary}"
    if escalation:
        level = escalation.get("level")
        if level is not None:
            banner += f"\nEscalation: attempt {level}"
    return banner


def _build_prompt(alert: Any, incident_id: str, escalation: dict | None) -> str:
    """The agent's first-turn prompt — alert labels/annotations verbatim, so
    the model works from the real payload rather than a paraphrase."""
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
        escalation_note = (
            f"\n\nThis is an ESCALATION (attempt {escalation.get('level', '?')}) — a prior "
            "on-call pass did not resolve this incident. Do not repeat a remediation that "
            "already failed without a new hypothesis backed by new evidence."
        )
    return (
        f"Incident {incident_id}: an alert fired and it's your page.\n\n"
        f"Alert (labels/annotations verbatim):\n{json.dumps(payload, indent=2, default=str)}"
        f"{escalation_note}\n\n"
        "Work the incident end to end: investigate from the pre-check leads already in this "
        "conversation, consult the matched runbook, correlate with deploy_history, name the "
        "root cause with evidence, dry-run your remediation and put the diff in the "
        "request_approval summary, execute once approved, re-query alert_status until "
        "recovery (or report failure explicitly), then close with open_postmortem_pr."
    )


async def run_oncall(
    ctx: RunContext, incident_id: str, alert: Any, *, escalation: dict | None = None
) -> None:
    await ctx.begin(trigger="alert")
    await ctx.add_user_message(_alert_banner(alert, escalation))
    prompt = _build_prompt(alert, incident_id, escalation)
    await run_agent_session(ctx, "oncall", prompt, max_turns=40)
    await ctx.end("completed", summary=f"{incident_id}: {alert.alertname}")


async def run_oncall_chat(ctx: RunContext, message: str) -> None:
    """Ad-hoc chat entrypoint (CHAT_AGENTS) — lets an operator talk to the
    on-call agent directly, outside the alert-triggered `run_oncall` path."""
    await ctx.begin(trigger="chat")
    await ctx.add_user_message(message)
    await run_agent_session(ctx, "oncall", message, max_turns=40)
    await ctx.end("completed")
