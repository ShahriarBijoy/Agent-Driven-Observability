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

Runbook-driven narrowing (Task 6, `tools/backends.py`'s `runbook_lookup`): a
matched runbook's `tools` metadata narrows the session's allow-list to just
what that runbook needs (union'd with `ONCALL_ALWAYS_TOOLS`, the
investigation/session spine every oncall run keeps regardless) —
`apply_override` (agents/base.py) guarantees this can only SHRINK the
baseline, never grant a tool the agent kind wasn't already given. No match
means no narrowing: the full baseline stays in play.
"""

from __future__ import annotations

import json
from typing import Any

from .. import precheck
from ..context import RunContext
from ..tools import backends
from ..tools import sdk as toolsdk
from .base import run_agent_session

_MCP_PREFIX = f"mcp__{toolsdk.SERVER}__"


def _plain_name(name: str) -> str:
    """Strip the `mcp__obslab__` namespacing for operator-facing display."""
    return name[len(_MCP_PREFIX):] if name.startswith(_MCP_PREFIX) else name


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

    `runbook_match` (Task 6) is `backends.runbook_lookup`'s result when it
    found one: its body + hypotheses go straight into the prompt so the model
    starts from the runbook's own diagnostic steps instead of re-deriving
    them. `None` (no match) is noted explicitly rather than silently omitted,
    so the model doesn't assume one exists."""
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
    if runbook_match and runbook_match.get("runbook"):
        meta = runbook_match.get("meta") or {}
        hypotheses = meta.get("hypotheses") or []
        hyp_lines = "\n".join(f"- {h}" for h in hypotheses) or "(none listed)"
        runbook_section = (
            f"Matched runbook: {runbook_match['runbook']} — your toolset for this incident has "
            "been narrowed to what it needs (see the boundary line below). Candidate "
            f"hypotheses from the runbook:\n{hyp_lines}\n\nRunbook body:\n"
            f"{runbook_match.get('content', '')}\n\n"
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
    """The `runbook-match.md` artifact: which runbook matched (or didn't) and
    the resulting narrowed toolset — the acceptance signal that a runbook
    match visibly narrows the toolbox."""
    if match.get("runbook"):
        tools = ", ".join(sorted(_plain_name(t) for t in (allowed_override or []))) or "(none)"
        return (
            f"# Runbook match\n\n**Matched:** `{match['runbook']}`\n\n"
            f"**Narrowed toolset ({len(allowed_override or [])} tools):** {tools}\n"
        )
    available = ", ".join(match.get("available") or []) or "(no runbooks found)"
    return (
        "# Runbook match\n\n**Matched:** none — no tool narrowing applied for this alert.\n\n"
        f"**Available runbooks:** {available}\n"
    )


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

    # Runbook match (Task 6): narrows the allow-list to the matched runbook's
    # declared tools, union'd with the always-on investigation/session spine
    # — apply_override (agents/base.py) can only shrink this, never grow it.
    match = await backends.runbook_lookup(alert.alertname)
    allowed_override: list[str] | None = None
    if match.get("runbook"):
        meta_tools = (match.get("meta") or {}).get("tools") or []
        allowed_override = sorted(
            {toolsdk.mcp(name) for name in meta_tools} | set(toolsdk.ONCALL_ALWAYS_TOOLS)
        )
    await ctx.add_artifact(
        name="runbook-match.md", media_type="text/markdown",
        content=_runbook_artifact(match, allowed_override),
    )

    prompt = _build_prompt(alert, incident_id, escalation, precheck_report=report, runbook_match=match)
    await run_agent_session(ctx, "oncall", prompt, max_turns=40, allowed_override=allowed_override)
    await ctx.end("completed", summary=f"{incident_id}: {alert.alertname}")


async def run_oncall_chat(ctx: RunContext, message: str) -> None:
    """Ad-hoc chat entrypoint (CHAT_AGENTS) — lets an operator talk to the
    on-call agent directly, outside the alert-triggered `run_oncall` path."""
    await ctx.begin(trigger="chat")
    await ctx.add_user_message(message)
    await run_agent_session(ctx, "oncall", message, max_turns=40)
    await ctx.end("completed")
