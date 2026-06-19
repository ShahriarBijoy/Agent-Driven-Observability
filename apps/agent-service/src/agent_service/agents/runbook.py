"""Runbook Executor — walks a Markdown runbook step by step, gating mutations.

Entrypoint: POST /runbooks/:name/execute. Reads the runbook, executes its headed
steps one at a time, and calls request_approval (which BLOCKS until the operator
decides via the web UI) before any state-mutating step. Tools: Bash, pg_select,
runbook_read, request_approval, save_artifact. Runs with cwd = repo root so the
runbook's relative commands (e.g. docker compose) resolve.
"""

from __future__ import annotations

from ..config import config
from ..context import RunContext
from .base import run_agent_session


async def run_runbook_executor(ctx: RunContext, name: str) -> None:
    await ctx.begin(trigger="runbook-execute")
    await ctx.add_user_message(f"Execute runbook: {name}")
    prompt = (
        f"Execute the runbook '{name}'.\n\n"
        "1. Read it with runbook_read.\n"
        "2. Walk its steps in order. Use Bash for commands and pg_select for read-only DB checks.\n"
        "3. Before ANY step that mutates state (restarting a service, changing config, writing "
        "data), call request_approval with a one-sentence description and WAIT for the decision. "
        "If denied, skip that step and continue (or stop if it's a hard dependency).\n"
        "4. When done, call save_artifact with kind='markdown', name='runbook-log.md' containing "
        "the steps you ran, their results, and every approval decision."
    )
    await run_agent_session(ctx, "runbook-executor", prompt, cwd=config.lab_root, max_turns=40)
    await ctx.end("completed")
