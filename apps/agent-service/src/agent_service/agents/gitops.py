"""GitOps reporter — triggered by Argo CD / Argo Rollouts notification webhooks.

Entrypoint: POST /webhook/gitops (token-gated; both notification engines send
the static X-Obs-Token header — they cannot HMAC). Failure-shaped events spawn
an investigation that reads the delivery plane through the shaped CR tools
(argo_app / rollout_status / analysisrun_get) and records an incident;
on-rollout-completed with a matching open incident spawns a short verification
run that posts the resolution note and closes it. Everything else is
acknowledged without a run.
"""

from __future__ import annotations

import json
from typing import Any

from .. import db
from ..context import RunContext
from ..models import new_id
from .base import run_agent_session

# Events that mean "something went wrong with delivery" and earn a run.
FAILURE_EVENTS = {
    "on-sync-failed",
    "on-health-degraded",
    "on-out-of-sync",
    "on-rollout-aborted",
    "on-analysis-run-failed",
}

_SEVERITY = {
    "on-rollout-aborted": "sev2",
    "on-sync-failed": "sev2",
    "on-health-degraded": "sev2",
    "on-analysis-run-failed": "sev3",
    "on-out-of-sync": "sev3",
}


def subject_of(payload: dict[str, Any]) -> str:
    """The app/rollout a gitops event is about (dedupe + incident-match key)."""
    return str(payload.get("app") or payload.get("rollout") or "unknown")


async def run_gitops_reporter(ctx: RunContext, payload: dict[str, Any]) -> None:
    event = str(payload.get("event", "gitops-event"))
    target = subject_of(payload)
    await ctx.begin(trigger="gitops-webhook")
    await ctx.add_user_message(f"GitOps event: {event} on {target}")
    prompt = (
        f"A delivery event arrived from {payload.get('source', 'argocd')}:\n"
        f"{json.dumps(payload, indent=2, default=str)}\n\n"
        "Investigate and explain it. Start from the delivery plane: argo_app for sync/"
        "health/operation state and deploy history, rollout_status for the canary "
        "position, analysisrun_get when an analysis or abort is involved — quote failing "
        "measurements verbatim. Then name the change: the synced revision is an "
        "obs-gitops commit whose message carries the source sha and CI run; walk "
        "gitea_ci_runs / gitea_compare / grafana_annotations to the exact commit and "
        "file. Correlate impact with mimir_query/loki_query where numbers help. Then "
        "call save_artifact with kind='markdown', name='postmortem.md' (sections: "
        "Summary, What happened, Evidence, The change, Recommended actions). End with a "
        "one-paragraph summary for the incident inbox."
    )
    final = await run_agent_session(ctx, "gitops-reporter", prompt, max_turns=24)

    run = await db.get_run(ctx.run_id)
    postmortem = next(
        (a.content for a in reversed(run.artifacts) if a.media_type == "text/markdown"),
        None,
    ) if run else None
    from .incident import _inbox_summary  # same inbox contract as alert incidents

    incident_id = new_id("inc")
    await db.record_incident(
        incident_id=incident_id,
        title=f"{event}: {target}",
        severity=_SEVERITY.get(event, "sev3"),
        tenant=ctx.run.tenant,
        summary=_inbox_summary(postmortem, final, f"{event} on {target}"),
        postmortem_md=postmortem or final or event,
        run_id=ctx.run_id,
    )
    await ctx.end("completed", summary=f"{incident_id}: {event} {target}")


async def run_gitops_resolution(
    ctx: RunContext, payload: dict[str, Any], incident: dict[str, Any]
) -> None:
    """A rollout completed while an incident on the same target is open:
    verify recovery, write the resolution note, close the incident."""
    target = subject_of(payload)
    await ctx.begin(trigger="gitops-webhook")
    await ctx.add_user_message(
        f"Rollout completed on {target} — verifying recovery for open incident {incident['id']}"
    )
    prompt = (
        f"The rollout '{target}' just completed while this incident is open:\n"
        f"  {incident['id']}: {incident['title']}\n"
        f"  {incident.get('summary') or ''}\n\n"
        f"Event payload:\n{json.dumps(payload, indent=2, default=str)}\n\n"
        "Verify the recovery: rollout_status (expect Healthy, no abort), argo_app "
        "(expect Synced + Healthy, note the new revision in history), and a quick "
        "mimir_query sanity check on the service's error rate if traffic exists. Then "
        "write a SHORT resolution note (a few sentences: what shipped, the evidence it "
        "is healthy, revision ids). The note is your final message — no artifact needed."
    )
    final = await run_agent_session(ctx, "gitops-reporter", prompt, max_turns=12)
    await db.resolve_incident(
        incident["id"], f"**Resolution ({target} rollout completed):**\n\n{final}".strip()
    )
    await ctx.end("completed", summary=f"resolved {incident['id']}: {target} recovered")
