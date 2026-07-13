"""Dashboard Generator — the simplest agent: single-turn, reversible, no gate.

Takes a natural-language brief, validates the intended metrics exist with
mimir_query, builds a Grafana dashboard JSON model, and creates it via
grafana_create_dashboard. Dashboards are reversible, so no approval is needed.
"""

from __future__ import annotations

from ..context import RunContext
from .base import run_agent_session


async def run_dashboard_generator(ctx: RunContext, brief: str) -> None:
    await ctx.begin(trigger="generate-dashboard")
    await ctx.add_user_message(brief)
    prompt = (
        f"Dashboard brief: {brief}\n\n"
        "First confirm the intended metrics exist using mimir_query (instant queries). "
        "Then build a clean Grafana dashboard JSON model — a title and a few timeseries/stat "
        "panels whose targets are PromQL against the datasource uid 'mimir' — and create it with "
        "grafana_create_dashboard. If the brief asks to extend an EXISTING dashboard instead, "
        "fetch it first with grafana_get_dashboard and append panels to it (keep its uid, title, "
        "and existing panels) rather than starting fresh. Finish by reporting the dashboard's URL."
    )
    await run_agent_session(ctx, "dashboard-generator", prompt, max_turns=12)
    await ctx.end("completed")
