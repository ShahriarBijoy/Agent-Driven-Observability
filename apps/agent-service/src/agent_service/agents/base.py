"""Shared run loop for the model-backed agents.

Drives a ClaudeSDKClient session and translates its message stream into the
RunContext API: assistant text -> tokens + a stored message, ToolUseBlock ->
a live tool-call row + OTel child span, ToolResultBlock -> the resolved call.
Every agent run is one parent span ('agent.<kind>') with a child span per tool
call, so the run shows up in Tempo exactly as the PLAN's self-observability
requires. Only the system prompt + allow-list differ between agents.
"""

from __future__ import annotations

import time
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from ..config import config
from ..context import RunContext
from ..telemetry import get_tracer
from ..tools import sdk as toolsdk

_MCP_PREFIX = f"mcp__{toolsdk.SERVER}__"

# Per-run Claude session ids, so a multi-turn chat (same runId) continues the
# same SDK session instead of starting cold. Best-effort: lost on restart, which
# just means the next turn starts fresh.
_sessions: dict[str, str] = {}

# Mutating agents run unattended (no human at a CLI prompt), so they can't fall
# back to interactive permission prompts. Their real guardrail is the explicit
# request_approval tool + a contained cwd, not the SDK permission dialog.
PERMISSION_MODES: dict[str, str] = {
    "auto-fixer": "bypassPermissions",
    "runbook-executor": "bypassPermissions",
}


def _display_name(name: str) -> str:
    return name[len(_MCP_PREFIX):] if name.startswith(_MCP_PREFIX) else name


def _result_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "\n".join(p for p in parts if p)
    return str(content)


def _truncate(text: str, limit: int = 2000) -> str:
    return text if len(text) <= limit else f"{text[:limit]}… (+{len(text) - limit} chars)"


async def run_agent_session(
    ctx: RunContext,
    agent_kind: str,
    prompt: str,
    *,
    cwd: str | None = None,
    max_turns: int | None = None,
    extra_allowed: list[str] | None = None,
) -> str:
    """Run one agent turn-set to completion; returns the final assistant text."""
    server = toolsdk.build_mcp_server(ctx)
    allowed = list(toolsdk.TOOLSETS.get(agent_kind, []))
    if extra_allowed:
        allowed += extra_allowed

    options = ClaudeAgentOptions(
        system_prompt=toolsdk.SYSTEM_PROMPTS.get(agent_kind, ""),
        mcp_servers={toolsdk.SERVER: server},
        allowed_tools=allowed,
        permission_mode=PERMISSION_MODES.get(agent_kind, "default"),
        setting_sources=[],  # isolation: don't load the host's CLAUDE.md / settings
        model=config.model,
        cwd=cwd,
        max_turns=max_turns,
        resume=_sessions.get(ctx.run_id),  # continue a multi-turn chat
    )

    tracer = get_tracer()
    text_parts: list[str] = []
    pending: dict[str, tuple] = {}  # tool_use_id -> (ToolCall, start_monotonic, span)

    with tracer.start_as_current_span(f"agent.{agent_kind}") as run_span:
        run_span.set_attribute("agent.run_id", ctx.run_id)
        run_span.set_attribute("agent.kind", agent_kind)
        run_span.set_attribute("agent.tenant", ctx.run.tenant)
        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(prompt)
                async for message in client.receive_response():
                    if isinstance(message, AssistantMessage):
                        for block in message.content:
                            if isinstance(block, TextBlock):
                                if block.text:
                                    ctx.emit_token(block.text)
                                    text_parts.append(block.text)
                            elif isinstance(block, ToolUseBlock):
                                name = _display_name(block.name)
                                tc = await ctx.start_tool_call(name, dict(block.input or {}))
                                span = tracer.start_span(f"tool.{name}")
                                span.set_attribute("tool.name", name)
                                span.set_attribute("agent.run_id", ctx.run_id)
                                pending[block.id] = (tc, time.monotonic(), span)
                    elif isinstance(message, UserMessage):
                        blocks = message.content if isinstance(message.content, list) else []
                        for block in blocks:
                            if isinstance(block, ToolResultBlock):
                                entry = pending.pop(block.tool_use_id, None)
                                if entry is None:
                                    continue
                                tc, start, span = entry
                                status = "error" if block.is_error else "ok"
                                duration = int((time.monotonic() - start) * 1000)
                                span.set_attribute("tool.status", status)
                                span.end()
                                await ctx.finish_tool_call(
                                    tc, status, _truncate(_result_text(block.content)), duration
                                )
                    elif isinstance(message, ResultMessage):
                        if message.session_id:
                            _sessions[ctx.run_id] = message.session_id
                        if message.total_cost_usd is not None:
                            run_span.set_attribute("agent.cost_usd", message.total_cost_usd)
                        if message.num_turns is not None:
                            run_span.set_attribute("agent.num_turns", message.num_turns)
                        if message.is_error and not text_parts and message.result:
                            text_parts.append(message.result)
        except Exception as exc:  # noqa: BLE001 — ensure dangling spans close, then re-raise
            for _tc, _start, span in pending.values():
                span.end()
            run_span.record_exception(exc)
            raise

    final = "".join(text_parts).strip()
    if final:
        await ctx.add_assistant_message(final)
    return final
