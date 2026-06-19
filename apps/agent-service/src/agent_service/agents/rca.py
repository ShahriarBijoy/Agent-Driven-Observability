"""RCA Assistant — interactive, read-only root-cause analysis over chat.

Same read-only toolkit as the reporter (Loki/Tempo/Mimir/Marquez/Postgres). A
long-lived conversation: each turn reuses the run's Claude session (base.py),
so follow-ups build on what was already found. Answers 'why is X happening' with
real queries shown in the tool timeline.
"""

from __future__ import annotations

from ..context import RunContext
from .base import run_agent_session


async def run_rca(ctx: RunContext, message: str) -> None:
    await ctx.begin(trigger="chat")
    await ctx.add_user_message(message)
    await run_agent_session(ctx, "rca", message, max_turns=16)
    await ctx.end("completed")
