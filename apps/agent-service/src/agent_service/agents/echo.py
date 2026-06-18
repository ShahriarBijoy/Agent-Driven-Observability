"""Echo agent — the no-op that proves the pipeline (Phase-4 parity, Phase-5 home).

It exercises everything the real agents use: run lifecycle, SSE token streaming,
a tool-call timeline, artifacts, and the approval gate ("request approval" in the
message triggers it). No Claude involved — that's the point: if echo streams and
persists, the transport is sound and the model-backed agents can drop straight in.
"""

from __future__ import annotations

import asyncio

from ..context import RunContext

_REPLY = (
    'You said: "{msg}". I am the echo agent — a stand-in that proves the streaming '
    "path (SSE tokens, tool calls, approvals) and the Postgres audit trail. The "
    'model-backed agents share this exact transport. Try sending "request approval" '
    "to see the approval gate."
)


async def run_echo(ctx: RunContext, message: str) -> None:
    await ctx.begin(trigger="chat")
    await ctx.add_user_message(message)

    # A staged tool call so the timeline has something true to render.
    async with ctx.record_tool(
        "telemetry.instant_query",
        {"promql": 'sum(rate(request_duration_seconds_count{service="gateway"}[5m]))'},
    ) as tool:
        await asyncio.sleep(0.15)
        tool.result = "echo agent: query simulated (real tools arrive with the agents)"

    if "request approval" in message.lower():
        await ctx.add_approval(
            "Echo agent requests permission to take a (pretend) remediation action."
        )
        await ctx.end("awaiting_approval")
        return

    assembled = ""
    for word in _REPLY.format(msg=message).split(" "):
        chunk = word if assembled == "" else " " + word
        assembled += chunk
        ctx.emit_token(chunk)
        await asyncio.sleep(0.02)

    await ctx.add_assistant_message(assembled)
    await ctx.add_artifact(
        "echo-summary.md",
        "text/markdown",
        f"# Echo run\n\n- run: `{ctx.run_id}`\n- tenant: `{ctx.run.tenant}`\n\n> {message}\n",
    )
    await ctx.end("completed")
