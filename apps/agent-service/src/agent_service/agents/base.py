"""Shared run loop for the model-backed agents.

Drives a ClaudeSDKClient session and translates its message stream into the
RunContext API: assistant text -> tokens + a stored message per narration
segment (flushed whenever a tool call starts, so the persisted transcript
interleaves text and tools chronologically), ToolUseBlock -> a live tool-call
row + OTel child span, ToolResultBlock -> the resolved call.
Every agent run is one parent span ('agent.<kind>') with a child span per tool
call, so the run shows up in Tempo exactly as the PLAN's self-observability
requires. Only the system prompt + allow-list differ between agents.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
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

from .. import settings as settings_store
from ..context import RunContext
from ..telemetry import get_tracer
from ..tools import sdk as toolsdk

_MCP_PREFIX = f"mcp__{toolsdk.SERVER}__"

# Per-run Claude session ids, so a multi-turn chat (same runId) continues the
# same SDK session instead of starting cold. Best-effort: lost on restart, which
# just means the next turn starts fresh.
_sessions: dict[str, str] = {}


class AgentSessionError(RuntimeError):
    """The Claude session stopped before completing (turn limit, API error).

    Raised after the stop notice has been persisted to the transcript; app.py
    maps it to an honest 'failed' run status instead of 'completed'.
    """


# Claude Code built-ins removed from the model's context when the agent wasn't
# granted them. Without this the model discovers Read/Grep/Bash and burns its
# turn budget spelunking the host filesystem instead of querying telemetry
# (observed: 15 of 46 calls wasted in one RCA run). Only applied to agents on
# 'default' permission mode — the bypassPermissions agents (runbook-executor,
# auto-fixer) legitimately lean on built-ins inside their contained cwd.
_DENYABLE_BUILTINS = [
    "Bash", "Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit",
    "WebFetch", "WebSearch", "Task", "TodoWrite",
]


def stop_reason(
    subtype: str | None, is_error: bool, detail: str | None, max_turns: int | None
) -> str | None:
    """Why the SDK session must not be reported as completed, or None if it
    finished normally. Pure so it's unit-testable."""
    if subtype in (None, "success") and not is_error:
        return None
    if subtype == "error_max_turns":
        limit = f"{max_turns}-turn limit" if max_turns else "turn limit"
        return f"the agent hit its {limit} before finishing"
    if detail:
        return _truncate(detail, 300)
    return f"the session ended abnormally ({subtype})"


def apply_override(baseline: list[str], override: list[str] | None) -> list[str]:
    """Narrow `baseline` down to `override`.

    An override can only shrink the allow-list, never grow it: any name in
    `override` that isn't already in `baseline` is silently dropped (a runbook
    can't smuggle in a tool the agent kind was never granted). `None` means
    "no narrowing requested" — the full baseline passes through unchanged.
    """
    if override is None:
        return list(baseline)
    return [t for t in override if t in baseline]


def _display_name(name: str) -> str:
    if name.startswith(_MCP_PREFIX):
        return name[len(_MCP_PREFIX):]
    if name.startswith("mcp__"):  # other servers keep a short server prefix: k8s:pods_get
        return name[len("mcp__"):].replace("__", ":", 1)
    return name


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
    allowed_override: list[str] | None = None,
) -> str:
    """Run one agent turn-set to completion; returns the final assistant text."""
    server = toolsdk.build_mcp_server(ctx)
    stg = await settings_store.load()
    allowed = settings_store.resolve_allowed(agent_kind, stg)
    if extra_allowed:
        allowed += extra_allowed
    # A runbook (or any other narrowing signal) may only shrink the resolved
    # baseline, never extend it — applied last, after settings grants + extras.
    allowed = apply_override(allowed, allowed_override)

    # The k8s MCP child (an npx subprocess per session) is only worth spawning
    # when this agent may actually call it — and only exists once the agent-ro
    # kubeconfig has been minted. Resolve BEFORE the boundary text below so the
    # model is never promised tools that won't be there.
    mcp_servers: dict[str, Any] = {toolsdk.SERVER: server}
    k8s_prefix = f"mcp__{toolsdk.K8S_SERVER}__"
    if any(name.startswith(k8s_prefix) for name in allowed):
        k8s_server = toolsdk.k8s_mcp_server()
        if k8s_server is not None:
            mcp_servers[toolsdk.K8S_SERVER] = k8s_server
        else:
            allowed = [name for name in allowed if not name.startswith(k8s_prefix)]

    # State the tool boundary explicitly, and hand the model the context it
    # otherwise wastes turns hunting for (current time for "around 18:45"
    # questions — observed Bash calls just to convert epochs).
    tool_names = ", ".join(_display_name(name) for name in allowed)
    now_utc = datetime.now(timezone.utc)
    now_local = datetime.now().astimezone()
    boundary = (
        f" Tools available to you: {tool_names}. These are the ONLY tools you may "
        "call; anything else is denied in this headless environment and wastes a "
        f"turn. The current time is {now_utc:%Y-%m-%d %H:%M} UTC "
        f"({now_local:%H:%M} {now_local.tzname()} local — operators usually mean "
        "local time). Telemetry timestamps are UTC epoch seconds; convert them "
        "yourself, never via a shell."
    )

    permission_mode = settings_store.PERMISSION_MODES.get(agent_kind, "default")
    disallowed = (
        [] if permission_mode == "bypassPermissions"
        else [t for t in _DENYABLE_BUILTINS if t not in allowed]
    )

    options = ClaudeAgentOptions(
        system_prompt=toolsdk.SYSTEM_PROMPTS.get(agent_kind, "") + boundary,
        mcp_servers=mcp_servers,
        allowed_tools=allowed,
        disallowed_tools=disallowed,
        permission_mode=permission_mode,
        setting_sources=[],  # isolation: don't load the host's CLAUDE.md / settings
        model=settings_store.resolve_model(stg),
        cwd=cwd,
        max_turns=max_turns,
        resume=_sessions.get(ctx.run_id),  # continue a multi-turn chat
        # Ship every tool schema up front. The CLI defaults to deferring MCP
        # schemas behind ToolSearch, which forced 2-4 ToolSearch round-trips at
        # the start of every run and surfaced ungranted built-ins to the model.
        env={"ENABLE_TOOL_SEARCH": "false"},
    )

    tracer = get_tracer()
    text_parts: list[str] = []  # current unsaved segment; flushed at each tool call
    all_parts: list[str] = []  # everything, for the return value
    pending: dict[str, tuple] = {}  # tool_use_id -> (ToolCall, start_monotonic, span)
    result_subtype: str | None = None
    result_is_error = False
    result_detail: str | None = None

    async def flush_text() -> None:
        """Persist the accumulated narration as its own assistant message so the
        transcript interleaves text and tool calls chronologically."""
        segment = "".join(text_parts).strip()
        text_parts.clear()
        if segment:
            await ctx.add_assistant_message(segment)

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
                                    all_parts.append(block.text)
                            elif isinstance(block, ToolUseBlock):
                                await flush_text()
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
                        result_subtype = message.subtype
                        result_is_error = bool(message.is_error)
                        if message.result and result_is_error:
                            result_detail = message.result
                        if message.session_id:
                            _sessions[ctx.run_id] = message.session_id
                        if message.total_cost_usd is not None:
                            run_span.set_attribute("agent.cost_usd", message.total_cost_usd)
                        if message.num_turns is not None:
                            run_span.set_attribute("agent.num_turns", message.num_turns)
        except Exception as exc:  # noqa: BLE001 — ensure dangling spans close, then re-raise
            for _tc, _start, span in pending.values():
                span.end()
            run_span.record_exception(exc)
            raise

        # Tool calls the session abandoned (e.g. the turn limit landed right
        # after a tool_use) — resolve them so the UI doesn't spin forever.
        for tc, started, span in pending.values():
            span.set_attribute("tool.status", "error")
            span.end()
            await ctx.finish_tool_call(
                tc, "error", "not executed — the session ended first",
                int((time.monotonic() - started) * 1000),
            )
        pending.clear()

        await flush_text()
        final = "".join(all_parts).strip()

        reason = stop_reason(result_subtype, result_is_error, result_detail, max_turns)
        if reason is None:
            return final
        # Surface the early stop in the transcript itself — a silent run that
        # then reads "completed" is exactly the confusion this prevents.
        run_span.set_attribute("agent.stop_reason", result_subtype or "unknown")
        notice = (
            f"⚠️ Investigation stopped early: {reason}. "
            + ("What's above may be incomplete." if final else "No answer was produced.")
            + " Send a follow-up message to continue from where it left off."
        )
        ctx.emit_token(notice)
        await ctx.add_assistant_message(notice)
        raise AgentSessionError(reason)
