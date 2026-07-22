"""RunContext — the agent-facing API for a single run.

Every agent (and the approval/artifact tools) drives a RunContext instead of
touching the hub or db directly. Each method does both halves of the job:
persist to Postgres (audit) *and* publish an SSE event (live UI). Tool calls
open an OTel child span so a run shows up in Tempo as a parent span with one
child per tool.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator


from . import db
from .hub import hub
from .models import (
    AgentKind,
    AgentRun,
    Approval,
    Artifact,
    MediaType,
    RunMessage,
    RunStatus,
    ToolCall,
    ev_approval,
    ev_artifact,
    ev_done,
    ev_error,
    ev_run,
    ev_token,
    ev_tool_call,
    new_id,
    now_iso,
)
from .telemetry import get_tracer

_TERMINAL: set[RunStatus] = {"completed", "failed", "denied"}


class RunContext:
    def __init__(self, run: AgentRun) -> None:
        self.run = run
        self._tracer = get_tracer()
        # Set by the auto-fixer to a contained repo clone; gh_open_pr targets it.
        self.workspace: str | None = None

    @property
    def run_id(self) -> str:
        return self.run.id

    async def begin(self, trigger: str | None = None) -> None:
        await db.create_run(self.run, trigger)
        await db.set_status(self.run_id, "running")
        self.run.status = "running"
        hub.publish(self.run_id, ev_run(self.run_id))

    # ---- messages ------------------------------------------------------------

    async def add_user_message(self, content: str) -> None:
        msg = RunMessage(id=new_id("msg"), role="user", content=content, created_at=now_iso())
        self.run.messages.append(msg)
        await db.add_message(self.run_id, msg)

    async def add_assistant_message(self, content: str) -> None:
        msg = RunMessage(
            id=new_id("msg"), role="assistant", content=content, created_at=now_iso()
        )
        self.run.messages.append(msg)
        await db.add_message(self.run_id, msg)

    def emit_token(self, text: str) -> None:
        if text:
            hub.publish(self.run_id, ev_token(text))

    # ---- tool calls ----------------------------------------------------------

    async def start_tool_call(self, name: str, args: dict[str, Any]) -> ToolCall:
        tc = ToolCall(
            id=new_id("tool"), name=name, args=args, status="pending", started_at=now_iso()
        )
        self.run.tool_calls.append(tc)
        await db.upsert_tool_call(self.run_id, tc)
        hub.publish(self.run_id, ev_tool_call(tc))
        return tc

    async def finish_tool_call(
        self, tc: ToolCall, status: str, result: str | None, duration_ms: int | None = None
    ) -> None:
        tc.status = status  # type: ignore[assignment]
        tc.ended_at = now_iso()
        tc.result = result
        await db.upsert_tool_call(self.run_id, tc, duration_ms)
        hub.publish(self.run_id, ev_tool_call(tc))

    @asynccontextmanager
    async def record_tool(self, name: str, args: dict[str, Any]) -> AsyncIterator["ToolHandle"]:
        """Record a tool call with timing + an OTel child span. The body sets
        `.result`/`.error` on the handle; the call is persisted twice (pending,
        then resolved) so the UI timeline shows it go from live → ok/error."""
        tc = await self.start_tool_call(name, args)
        handle = ToolHandle(tc)
        started = time.monotonic()
        with self._tracer.start_as_current_span(f"tool.{name}") as span:
            span.set_attribute("agent.run_id", self.run_id)
            span.set_attribute("tool.name", name)
            try:
                yield handle
            except Exception as exc:  # noqa: BLE001 — surface as a tool error, never crash the run
                handle.error = str(exc)
                span.record_exception(exc)
            finally:
                duration = int((time.monotonic() - started) * 1000)
                status = "error" if handle.error is not None else "ok"
                span.set_attribute("tool.status", status)
                await self.finish_tool_call(
                    tc, status, handle.error or handle.result, duration
                )

    # ---- approvals -----------------------------------------------------------

    async def add_approval(self, summary: str) -> Approval:
        approval = Approval(id=new_id("apr"), summary=summary, requested_at=now_iso())
        self.run.approvals.append(approval)
        await db.add_approval(self.run_id, approval)
        await db.set_status(self.run_id, "awaiting_approval")
        self.run.status = "awaiting_approval"
        hub.publish(self.run_id, ev_approval(approval))
        return approval

    async def request_approval(self, summary: str) -> tuple[str, str]:
        """Block the run until the operator decides via POST /runs/:id/approve.
        Returns (decision, approval_id) — 'approved'/'denied' plus the id of the
        Postgres approval row just decided, so a caller (tools/sdk.py's
        request_approval tool) can hand that id straight back to the model: the
        remediation execute gate (tools/remediate._execute_gate) requires it by
        name, and the model has no other way to learn it."""
        approval = await self.add_approval(summary)
        fut = hub.make_approval(self.run_id, approval.id)
        decision = await fut
        approval.decision = decision  # type: ignore[assignment]
        approval.decided_at = now_iso()
        if decision == "approved":
            await db.set_status(self.run_id, "running")
            self.run.status = "running"
        return decision, approval.id

    # ---- artifacts -----------------------------------------------------------

    async def add_artifact(self, name: str, media_type: MediaType, content: str) -> Artifact:
        artifact = Artifact(
            id=new_id("art"), name=name, media_type=media_type, content=content,
            created_at=now_iso(),
        )
        self.run.artifacts.append(artifact)
        await db.add_artifact(self.run_id, artifact)
        hub.publish(self.run_id, ev_artifact(artifact))
        return artifact

    # ---- lifecycle -----------------------------------------------------------

    async def end(self, status: RunStatus, summary: str | None = None) -> None:
        self.run.status = status
        await db.set_status(self.run_id, status, summary=summary, ended=status in _TERMINAL)
        hub.publish(self.run_id, ev_done(self.run_id, status))

    async def fail(self, message: str) -> None:
        hub.publish(self.run_id, ev_error(message))
        await self.end("failed", summary=message)


class ToolHandle:
    """Mutable result holder yielded by `record_tool`."""

    def __init__(self, tool_call: ToolCall) -> None:
        self.tool_call = tool_call
        self.result: str | None = None
        self.error: str | None = None


def new_run(agent: AgentKind, tenant: str, title: str, run_id: str | None = None) -> RunContext:
    run = AgentRun(
        id=run_id or new_id("run"),
        agent=agent,
        tenant=tenant,
        status="queued",
        title=title[:80] or agent,
        created_at=now_iso(),
        updated_at=now_iso(),
    )
    return RunContext(run)
