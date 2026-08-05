"""agent-service HTTP API.

The seam the Phase-4 web BFF was built against. Wire format is @obs/contracts:
- POST /chat                     interactive SSE run (echo, rca)
- GET  /runs?tenant=             AgentRunSummary[]
- GET  /runs/:id                 AgentRun
- GET  /runs/:id/stream          follow a run's SSE events live (with replay)
- POST /runs/:id/approve         resolve an approval gate -> AgentRun
- GET  /settings                 runtime agent settings + catalogs
- PUT  /settings                 update model / per-agent tool grants
Plus triggered entrypoints added in later milestones (dashboard, webhook, etc.).
"""

from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Coroutine

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from . import db
from . import escalation
from . import exam
from . import ingress
from . import settings as settings_store
from .agents.autofix import run_autofixer
from .agents.base import AgentSessionError
from .agents.dashboard import run_dashboard_generator
from .agents.echo import run_echo
from .agents.gitops import (
    FAILURE_EVENTS as GITOPS_FAILURE_EVENTS,
    run_gitops_reporter,
    run_gitops_resolution,
    subject_of,
)
from .agents.incident import run_incident_chat
from .agents.judge import JudgeError, run_judge
from .agents.oncall import run_oncall, run_oncall_chat
from .agents.rca import run_rca
from .agents.runbook import run_runbook_executor
from .config import config
from .tools import backends
from .context import RunContext, new_run
from .hub import hub
from .models import AgentChatRequest, ApprovalDecisionBody, ExamResult, new_id
from .telemetry import init_telemetry, instrument_app

# Agents reachable through the interactive /chat endpoint. Extended per milestone.
# dashboard-generator fits the chat shape (ctx, brief) directly: each message is
# a fresh one-shot brief — the web UI does not send a runId back for it.
ChatAgent = Callable[[RunContext, str], Awaitable[None]]
CHAT_AGENTS: dict[str, ChatAgent] = {
    "echo": run_echo,
    "rca": run_rca,
    "dashboard-generator": run_dashboard_generator,
    "oncall": run_oncall_chat,
    "incident-reporter": run_incident_chat,
}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    init_telemetry()
    await db.init_pool()
    # A restart orphans any in-flight run; fail them now, before anything new
    # starts, so the UI never shows a phantom "running" investigation.
    await db.fail_orphaned_runs()
    watcher_task = asyncio.create_task(escalation.watcher_loop())
    yield
    watcher_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await watcher_task
    await backends.close_http()
    await db.close_pool()


app = FastAPI(title="agent-service", version="0.0.0", lifespan=lifespan)
instrument_app(app)  # FastAPI-level OTel spans (no-op when no OTLP endpoint)


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
    except AgentSessionError as exc:
        # base.py already narrated the stop in the transcript; just make the
        # stored status honest — this run did NOT complete.
        await ctx.end("failed", summary=str(exc))
    except Exception as exc:  # noqa: BLE001
        await ctx.fail(f"agent crashed: {exc}")


# A follow-up /chat turn may only attach to a settled run — resuming one that
# is still executing would reset its live stream out from under the first turn.
RESUMABLE_STATUSES: set[str] = {"completed", "failed", "denied"}


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
    if existing is not None:
        if existing.status not in RESUMABLE_STATUSES:
            return JSONResponse(
                {"error": {"code": "conflict",
                           "message": f"run {existing.id} is {existing.status}; "
                           "wait for the current turn to finish"}},
                status_code=409,
            )
        # The hub buffer for this run still ends with the previous turn's
        # `done`, so a new subscriber would replay stale events and terminate
        # before this turn produced anything. Drop the buffer — Postgres holds
        # the durable transcript; this stream only needs the new turn.
        hub.cleanup(existing.id)
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


def _safe_json(raw: bytes) -> dict:
    try:
        payload = json.loads(raw)
    except Exception:  # noqa: BLE001
        payload = {}
    return payload if isinstance(payload, dict) else {}


@app.post("/webhook/alerts")
async def webhook_alerts(request: Request) -> JSONResponse:
    """Unified alert ingress (PLAN-2 P11): the one front door for both Grafana
    unified-alerting webhooks and gitops-reporter notifications. Normalizes
    both shapes to AlertEvent, dedupes against the open-incidents table keyed
    on alertname/workload, and spawns exactly one `oncall` investigation per
    incident (re-firings attach; a resolved notification closes it)."""
    raw = await request.body()
    if config.alert_webhook_secret:
        if not ingress.verify_signature(
            raw, request.headers.get(ingress.GRAFANA_SIG_HEADER), config.alert_webhook_secret
        ):
            return JSONResponse({"error": "bad signature"}, status_code=403)
    payload = _safe_json(raw)
    results: list[dict[str, Any]] = []
    for ev in ingress.normalize(payload):
        if not ingress.is_actionable(ev, config.incident_namespaces):
            # Platform trouble (kube-system/argocd converging after a restart)
            # is still visible in Grafana; it just doesn't get an incident and
            # an investigation. Reported rather than dropped silently so the
            # response shows WHY nothing happened.
            results.append({
                "action": "ignore",
                "reason": f"namespace {ev.namespace!r} is not an incident namespace",
            })
            continue
        key = ingress.alert_key(ev)
        open_inc = await db.find_open_incident_by_key(key)
        action = ingress.ingress_decision(ev, open_inc)

        async def _attach(incident_id: str) -> None:
            await db.attach_alert(
                incident_id, status=ev.status, alertname=ev.alertname, workload=ev.workload,
                starts_at=ev.starts_at, fingerprint=ev.fingerprint, payload=ev.raw,
            )

        if action == "spawn":
            incident_id = new_id("inc")
            created = await db.create_incident(
                incident_id, title=ev.summary, severity=ev.severity,
                tenant=ev.tenant, alert_key=key,
            )
            if not created:
                # Lost the race: another delivery for the same alert_key won
                # the unique open-incident index between our lookup and our
                # insert. Fall through to the same incident it just created —
                # one alert, one brain, one incident — instead of spawning a
                # second investigation.
                open_inc = await db.find_open_incident_by_key(key)
                if open_inc is None:
                    # The winning incident was already closed between their insert
                    # and our re-fetch. Ignore this event.
                    results.append({
                        "action": "ignore",
                        "reason": "raced with an incident that already closed",
                    })
                    continue
                await _attach(open_inc["id"])
                results.append({"action": "attach", "incidentId": open_inc["id"]})
                continue
            await _attach(incident_id)
            ctx = new_run("oncall", ev.tenant, ev.summary)
            await db.create_run(ctx.run, "alert")
            await db.link_run(incident_id, ctx.run.id, "investigation")
            asyncio.create_task(_guard_run(ctx, run_oncall(ctx, incident_id, ev)))
            results.append({"action": action, "incidentId": incident_id, "runId": ctx.run.id})
        elif action == "attach":
            await _attach(open_inc["id"])
            results.append({"action": action, "incidentId": open_inc["id"]})
        elif action == "close":
            await _attach(open_inc["id"])
            await db.close_incident(
                open_inc["id"], datetime.now(timezone.utc),
                summary=f"resolved notification for {ev.alertname}",
            )
            results.append({"action": action, "incidentId": open_inc["id"]})
        else:
            results.append({"action": "ignore"})
    return JSONResponse({"results": results}, status_code=202)


@app.post("/webhook/grafana-alert")
async def grafana_alert(request: Request) -> JSONResponse:
    """Back-compat shim for the previously-provisioned contact-point URL —
    delegates to the unified /webhook/alerts ingress (PLAN-2 P11 cutover).
    Kept so an un-migrated Grafana contact point still works."""
    return await webhook_alerts(request)


# One failure investigation per target per window: an abort and its
# analysis-run-failed arrive seconds apart and must not spawn twin runs.
# (The real dedupe/debounce machinery is P11; this guard covers the obvious.)
_GITOPS_DEDUPE_SECONDS = 600.0
_recent_gitops_runs: dict[str, float] = {}


@app.post("/webhook/gitops")
async def gitops_webhook(request: Request) -> JSONResponse:
    """Argo CD + Argo Rollouts notification webhooks (PLAN-2 P10). Both engines
    send the static X-Obs-Token header (they cannot HMAC), so unlike the
    Grafana hook this one is token-gated."""
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    event = str(payload.get("event", ""))
    target = subject_of(payload)

    if event in GITOPS_FAILURE_EVENTS:
        loop_now = asyncio.get_running_loop().time()
        last = _recent_gitops_runs.get(target)
        if last is not None and loop_now - last < _GITOPS_DEDUPE_SECONDS:
            return JSONResponse({"status": "suppressed",
                                 "reason": f"investigation for {target} already running"})
        if event == "on-out-of-sync":
            # Routine deploys pass through OutOfSync for a few seconds before
            # the automated sync lands; only sustained drift earns a run.
            async def _watch_drift() -> None:
                await asyncio.sleep(30)
                state = await backends.argo_app(target)
                if state.get("sync") != "OutOfSync":
                    return
                _recent_gitops_runs[target] = asyncio.get_running_loop().time()
                ctx = new_run("gitops-reporter", config.dev_tenant, f"{event}: {target}")
                await db.create_run(ctx.run, "gitops-webhook")
                await _guard_run(ctx, run_gitops_reporter(ctx, payload))

            asyncio.create_task(_watch_drift())
            return JSONResponse({"status": "watching",
                                 "reason": "spawns only if still OutOfSync in 30s"},
                                status_code=202)
        _recent_gitops_runs[target] = loop_now
        ctx = new_run("gitops-reporter", config.dev_tenant, f"{event}: {target}")
        await db.create_run(ctx.run, "gitops-webhook")
        asyncio.create_task(_guard_run(ctx, run_gitops_reporter(ctx, payload)))
        return JSONResponse({"runId": ctx.run_id, "status": "accepted"}, status_code=202)

    if event == "on-rollout-completed":
        incident = await db.find_open_incident(target, title_prefix="on-")
        if incident is not None:
            ctx = new_run("gitops-reporter", config.dev_tenant,
                          f"resolution: {target} ({incident['id']})")
            await db.create_run(ctx.run, "gitops-webhook")
            asyncio.create_task(_guard_run(ctx, run_gitops_resolution(ctx, payload, incident)))
            return JSONResponse({"runId": ctx.run_id, "status": "accepted"}, status_code=202)
        return JSONResponse({"status": "recorded", "event": event, "target": target})

    # on-deployed and anything unrecognised: acknowledged, no run. Deploy
    # history is already durable (Grafana annotation + Application history).
    return JSONResponse({"status": "recorded", "event": event, "target": target})


@app.post("/runbooks/{name}/execute")
async def execute_runbook(name: str, request: Request) -> JSONResponse:
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        body = {}
    tenant = (body or {}).get("tenant", config.dev_tenant) if isinstance(body, dict) else config.dev_tenant
    ctx = new_run("runbook-executor", tenant, f"runbook: {name}")
    await db.create_run(ctx.run, "runbook-execute")
    asyncio.create_task(_guard_run(ctx, run_runbook_executor(ctx, name)))
    return JSONResponse({"runId": ctx.run_id, "status": "accepted"}, status_code=202)


class AutoFixRequest(BaseModel):
    tenant: str = config.dev_tenant
    error_pattern: str
    hint: str = ""


@app.post("/auto-fix")
async def auto_fix(request: Request) -> JSONResponse:
    try:
        body = AutoFixRequest.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    ctx = new_run("auto-fixer", body.tenant, body.error_pattern)
    await db.create_run(ctx.run, "auto-fix")
    asyncio.create_task(_guard_run(ctx, run_autofixer(ctx, body.error_pattern, body.hint)))
    return JSONResponse({"runId": ctx.run_id, "status": "accepted"}, status_code=202)


def require_obs_token(request: Request) -> JSONResponse | None:
    """Gate for state-changing endpoints (PLAN-2 P7 hardening).

    The service binds 0.0.0.0 for container->host webhooks, which also exposes
    it to the LAN - and the approval gate is the lab's core safety mechanism.
    Callers must present the shared X-Obs-Token (from the host .env). With no
    token configured the endpoints stay CLOSED: silently-open would defeat the
    point, so the error says exactly what to set.
    """
    if config.obs_token is None:
        return JSONResponse(
            {
                "error": {
                    "code": "auth_unconfigured",
                    "message": "OBS_TOKEN is not set; mutating endpoints are closed. "
                    "Set OBS_TOKEN in the host .env and restart agent-service.",
                }
            },
            status_code=503,
        )
    supplied = request.headers.get("x-obs-token", "")
    if not hmac.compare_digest(supplied, config.obs_token):
        return JSONResponse(
            {"error": {"code": "forbidden", "message": "missing or invalid X-Obs-Token"}},
            status_code=403,
        )
    return None


@app.get("/settings")
async def get_settings() -> JSONResponse:
    stg = await settings_store.load()
    return JSONResponse(settings_store.describe(stg))


@app.put("/settings")
async def put_settings(request: Request) -> JSONResponse:
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001
        payload = None
    if not isinstance(payload, dict):
        return JSONResponse(
            {"error": {"code": "bad_request", "message": "body must be a JSON object"}},
            status_code=400,
        )
    try:
        stg = await settings_store.apply_update(payload)
    except settings_store.SettingsError as exc:
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    return JSONResponse(settings_store.describe(stg))


# ---- the chaos exam (PLAN-2 P12) -------------------------------------------
#
# The runner (scripts/exam.ps1) writes through these; /scorecard reads them.
# Writes are X-Obs-Token'd like every other mutating endpoint; the two GETs are
# open, same as GET /runs — a scorecard is not a secret. The answer keys are
# never served here, or anywhere: the judge is handed one as text by the
# runner and nothing else in this service knows the directory exists.


class ExamRunBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    group: str
    git_sha: str = Field(default="", alias="gitSha")


@app.post("/exam/runs")
async def open_exam_run(request: Request) -> JSONResponse:
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    try:
        body = ExamRunBody.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    exam_run_id = await db.create_exam_run(body.group, body.git_sha)
    return JSONResponse({"id": exam_run_id}, status_code=201)


@app.post("/exam/runs/{exam_run_id}/finish")
async def finish_exam_run(exam_run_id: str, request: Request) -> JSONResponse:
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    await db.finish_exam_run(exam_run_id)
    return JSONResponse({"id": exam_run_id, "status": "finished"})


@app.post("/exam/results")
async def record_exam_result(request: Request) -> JSONResponse:
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    try:
        result = ExamResult.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    # A result with no run to hang off would be invisible to /scorecard, which
    # reads by exam_run_id — reject it here rather than write an orphan.
    if not result.exam_run_id:
        return JSONResponse(
            {"error": {"code": "bad_request", "message": "examRunId is required"}},
            status_code=400,
        )
    row_id = await db.record_exam_result(result)
    return JSONResponse({"id": row_id, "score": result.score}, status_code=201)


class JudgeBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    scenario_id: str = Field(alias="scenarioId")
    report: str
    transcript: str = ""


@app.post("/exam/judge")
async def judge_report(request: Request) -> JSONResponse:
    """Grade one report against its hidden key. The key is resolved HERE, from
    the scenario id — the runner never holds one, so a key cannot leak by
    being put on the wire, and `read_key` stays the single doorway to
    scripts/exam-keys/.

    Synchronous, unlike the other agent entrypoints: the exam runner has
    nothing to do until the verdict exists, and a background run would just
    make it poll."""
    denied = require_obs_token(request)
    if denied is not None:
        return denied
    try:
        body = JudgeBody.model_validate(await request.json())
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    try:
        key = exam.read_key(body.scenario_id)
    except ValueError as exc:
        return JSONResponse(
            {"error": {"code": "bad_request", "message": str(exc)}}, status_code=400
        )
    except FileNotFoundError:
        return JSONResponse(
            {"error": {"code": "no_key",
                       "message": f"no answer key for scenario {body.scenario_id!r}"}},
            status_code=404,
        )
    try:
        verdict = await run_judge(body.scenario_id, body.report, body.transcript, key)
    except JudgeError as exc:
        # No verdict: the caller must record status='error', never a grade.
        return JSONResponse(
            {"error": {"code": "no_verdict", "message": str(exc)}}, status_code=502
        )
    return JSONResponse(verdict.wire())


@app.get("/exam/runs")
async def list_exam_runs(limit: int = 50) -> JSONResponse:
    return JSONResponse([r.wire() for r in await db.list_exam_runs(limit)])


@app.get("/exam/results")
async def list_exam_results(
    exam_run_id: str | None = Query(default=None, alias="examRunId"),
) -> JSONResponse:
    return JSONResponse([r.wire() for r in await db.list_exam_results(exam_run_id)])


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
    denied = require_obs_token(request)
    if denied is not None:
        return denied
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
