"""Incident Reporter — triggered by a Grafana alert, writes a postmortem.

Entrypoint: POST /webhook/grafana-alert. Parses the alert payload, investigates
with the read-only tools, and saves a Markdown postmortem (via save_artifact).
The service then records an `incidents` row (the web inbox) linked to the run.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .. import db
from ..context import RunContext
from ..models import new_id
from .base import run_agent_session

# Grafana severity label -> incident severity (sev1/sev2/sev3).
_SEV = {
    "page": "sev1", "critical": "sev1", "sev1": "sev1",
    "warning": "sev2", "warn": "sev2", "sev2": "sev2",
    "info": "sev3", "sev3": "sev3",
}


def summarize_alert(payload: dict[str, Any]) -> dict[str, Any]:
    """Pull the decision-useful fields out of a Grafana webhook payload,
    tolerating its many shapes (test pings, multi-alert groups, resolved)."""
    alerts = payload.get("alerts") or []
    first = alerts[0] if alerts else {}
    labels = {**(payload.get("commonLabels") or {}), **(first.get("labels") or {})}
    annotations = {**(payload.get("commonAnnotations") or {}), **(first.get("annotations") or {})}
    alertname = labels.get("alertname") or payload.get("title") or "Grafana alert"
    return {
        "alertname": alertname,
        "severity": _SEV.get(str(labels.get("severity", "")).lower(), "sev2"),
        "tenant": labels.get("tenant") or "acme",
        "status": payload.get("status") or first.get("status") or "firing",
        "summary": annotations.get("summary") or annotations.get("description") or alertname,
        "value": first.get("valueString"),
        "labels": labels,
        "annotations": annotations,
    }


def _inbox_summary(postmortem: str | None, final: str, fallback: str) -> str:
    """A clean one-paragraph summary for the inbox: prefer the postmortem's
    '## Summary' section, then the agent's last paragraph, then the alert text.
    (The agent's `final` text starts with its investigation preamble, so the
    head of it is the wrong thing to show.)"""
    if postmortem:
        match = re.search(r"#+\s*Summary\s*\n+(.+?)(?:\n#|\Z)", postmortem, re.S | re.I)
        if match:
            return " ".join(match.group(1).split())[:400]
    paragraphs = [p.strip() for p in (final or "").split("\n\n") if p.strip()]
    if paragraphs:
        return paragraphs[-1][:400]
    return fallback[:400]


async def run_incident_reporter(ctx: RunContext, payload: dict[str, Any]) -> None:
    info = summarize_alert(payload)
    await ctx.begin(trigger="grafana-alert")
    await ctx.add_user_message(
        f"Grafana alert: {info['alertname']} ({info['status']}, {info['severity']})\n"
        f"{info['summary']}"
    )
    prompt = (
        "A Grafana alert fired. Investigate it and write a structured postmortem.\n\n"
        f"Alert payload:\n{json.dumps(info, indent=2, default=str)}\n\n"
        "Use the read-only tools (mimir_query, loki_query, tempo_query, marquez_lineage, "
        "pg_select) to establish: what fired, the blast radius (which endpoint/tenant), the "
        "likely cause (name the slow span or error signature with evidence), and recommended "
        "actions. Then call save_artifact with kind='markdown', name='postmortem.md', and the "
        "full postmortem (sections: Summary, Impact, Timeline, Evidence, Likely cause, "
        "Recommended actions). End with a one-paragraph summary for the incident inbox."
    )
    final = await run_agent_session(ctx, "incident-reporter", prompt, max_turns=24)

    # Pull the postmortem the agent saved; fall back to its final text.
    run = await db.get_run(ctx.run_id)
    postmortem = next(
        (a.content for a in reversed(run.artifacts) if a.media_type == "text/markdown"),
        None,
    ) if run else None
    summary = _inbox_summary(postmortem, final, info["summary"])
    incident_id = new_id("inc")
    await db.record_incident(
        incident_id=incident_id,
        title=info["alertname"],
        severity=info["severity"],
        tenant=info["tenant"],
        summary=summary,
        postmortem_md=postmortem or final or info["summary"],
        run_id=ctx.run_id,
    )
    await ctx.end("completed", summary=f"{incident_id}: {info['alertname']}")
