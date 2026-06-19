"""agent-service HTTP API.

The seam the Phase-4 web BFF was built against. Wire format is @obs/contracts:
- POST /chat                     interactive SSE run (echo, rca)
- GET  /runs?tenant=             AgentRunSummary[]
- GET  /runs/:id                 AgentRun
- GET  /runs/:id/stream          follow a run's SSE events live (with replay)
- POST /runs/:id/approve         resolve an approval gate -> AgentRun
Plus triggered entrypoints added in later milestones (dashboard, webhook, etc.).
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Awaitable, Callable, Coroutine

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from . import db
from .agents.dashboard import run_dashboard_generator
from .agents.echo import run_echo
from .agents.incident import run_incident_reporter, summarize_alert
from .agents.rca import run_rca
from .config import config
from .tools import backends
from .context import RunContext, new_run
from .hub import hub
from .models import AgentChatRequest, ApprovalDecisionBody
from .telemetry import init_telemetry, instrument_app

# Agents reachable through the interactive /chat endpoint. Extended per milestone.
ChatAgent = Callable[[RunContext, str], Awaitable[None]]
CHAT_AGENTS: dict[str, ChatAgent] = {
    "echo": run_echo,
    "rca": run_rca,
}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_telemetry()
    await db.init_pool()
    yield
    await backends.close_http()
    await db.close_pool()


app = FastAPI(title="agent-service", version="0.0.0", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "agent-service"}


def _sse(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event)}\n\n".encode()


async def _sse_stream(run_id: str) -> AsyncIterator[bytes]:
    async for event in hub.subscribe(run_id):
        yield _sse(event)


def _stream_response(run_id: str) -> StreamingResponse:
    return StreamingResponse(
        _sse_stream(run_id),
        media_type="text/event-stream",
        headers={"cache-control": "no-cache", "connection": "keep-alive",
                 "x-accel-buffering": "no"},
    )


async def _guard_run(ctx: RunContext, coro: Coroutine) -> None:
    """Run an agent coroutine so a terminal event always fires — a crashed agent
    must not leave a stream hanging forever."""
    try:
        await coro
    except Exception as exc:  # noqa: BLE001
        await ctx.fail(f"agent crashed: {exc}")


@app.post("/chat", response_model=None)
async def chat(request: Request) -> StreamingResponse | JSONResponse:
    try:
        body = AgentChatRequest.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )

    agent = CHAT_AGENTS.get(body.agent)
    if agent is None:
        return JSONResponse(
            {"error": {"code": "not_implemented",
                       "message": f"agent '{body.agent}' is not chat-capable"}},
            status_code=501,
        )

    existing = await db.get_run(body.run_id) if body.run_id else None
    ctx = RunContext(existing) if existing is not None else new_run(
        body.agent, body.tenant, body.message
    )

    asyncio.create_task(_guard_run(ctx, agent(ctx, body.message)))
    return _stream_response(ctx.run_id)


# ---- triggered agents (background run; follow via GET /runs/:id/stream) ------


class DashboardRequest(BaseModel):
    tenant: str = config.dev_tenant
    brief: str


@app.post("/generate-dashboard")
async def generate_dashboard(request: Request) -> JSONResponse:
    try:
        body = DashboardRequest.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    ctx = new_run("dashboard-generator", body.tenant, body.brief)
    await db.create_run(ctx.run, "generate-dashboard")  # pre-persist: no GET race
    asyncio.create_task(_guard_run(ctx, run_dashboard_generator(ctx, body.brief)))
    return JSONResponse({"runId": ctx.run_id}, status_code=202)


@app.post("/webhook/grafana-alert")
async def grafana_alert(request: Request) -> JSONResponse:
    """Grafana unified-alerting contact point. A firing alert spawns the
    incident reporter; resolved/test pings are acknowledged without a run."""
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    info = summarize_alert(payload)
    if info["status"] != "firing":
        return JSONResponse({"status": "ignored", "reason": f"alert {info['status']}"})
    ctx = new_run("incident-reporter", info["tenant"], info["alertname"])
    await db.create_run(ctx.run, "grafana-alert")
    asyncio.create_task(_guard_run(ctx, run_incident_reporter(ctx, payload)))
    return JSONResponse({"runId": ctx.run_id, "status": "accepted"}, status_code=202)


@app.get("/runs")
async def list_runs(tenant: str | None = None) -> JSONResponse:
    return JSONResponse(await db.list_runs(tenant))


@app.get("/runs/{run_id}")
async def get_run(run_id: str) -> JSONResponse:
    run = await db.get_run(run_id)
    if run is None:
        return JSONResponse({"error": {"code": "not_found"}}, status_code=404)
    return JSONResponse(run.wire())


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: str) -> StreamingResponse:
    return _stream_response(run_id)


@app.post("/runs/{run_id}/approve")
async def approve(run_id: str, request: Request) -> JSONResponse:
    try:
        body = ApprovalDecisionBody.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )

    recorded = await db.decide_approval(run_id, body.approval_id, body.decision)
    # Resolve a live waiter (a parked request_approval tool), if any.
    resolved = hub.resolve_approval(run_id, body.approval_id, body.decision)

    if not recorded and not resolved:
        # Either already decided or unknown — return current state if it exists.
        run = await db.get_run(run_id)
        if run is None:
            return JSONResponse({"error": {"code": "not_found"}}, status_code=404)
        return JSONResponse(run.wire())

    # For non-blocking gates (echo), reflect the decision in the run status now;
    # blocking gates (real agents) advance their own status when the tool returns.
    if not resolved:
        await db.set_status(
            run_id, "completed" if body.decision == "approved" else "denied", ended=True
        )

    run = await db.get_run(run_id)
    if run is None:
        return JSONResponse({"error": {"code": "not_found"}}, status_code=404)
    return JSONResponse(run.wire())
