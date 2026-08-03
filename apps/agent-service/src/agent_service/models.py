"""Wire models mirroring @obs/contracts (packages/contracts/src/agents.ts).

The web BFF validates every frame against the Zod schemas, so these models
must serialise to the exact same shape: camelCase keys, ISO-8601 `Z` datetimes,
the same enum spellings. We emit with `by_alias=True` everywhere.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field
from pydantic.alias_generators import to_camel


class AgentKind(StrEnum):
    ECHO = "echo"
    RCA = "rca"
    INCIDENT_REPORTER = "incident-reporter"
    GITOPS_REPORTER = "gitops-reporter"
    AUTO_FIXER = "auto-fixer"
    DASHBOARD_GENERATOR = "dashboard-generator"
    RUNBOOK_EXECUTOR = "runbook-executor"
    ONCALL = "oncall"
    JUDGE = "judge"

RunStatus = Literal[
    "queued",
    "running",
    "awaiting_approval",
    "completed",
    "failed",
    "denied",
]

ToolStatus = Literal["pending", "ok", "error"]
MessageRole = Literal["user", "assistant", "system"]
MediaType = Literal["text/markdown", "application/json", "text/html"]
Decision = Literal["approved", "denied"]


def now_iso() -> str:
    """RFC-3339 UTC with millisecond precision and a `Z` suffix — matches
    JavaScript's `new Date().toISOString()`, which the Zod schema expects."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


_counter = 0


def new_id(prefix: str) -> str:
    global _counter
    _counter += 1
    stamp = format(int(time.time() * 1000), "x")
    return f"{prefix}_{stamp}{_counter:x}"


class _Wire(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def wire(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class ToolCall(_Wire):
    id: str
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    status: ToolStatus
    started_at: str
    ended_at: str | None = None
    result: str | None = None


class RunMessage(_Wire):
    id: str
    role: MessageRole
    content: str
    created_at: str


class Artifact(_Wire):
    id: str
    name: str
    media_type: MediaType
    content: str
    created_at: str


class Approval(_Wire):
    id: str
    summary: str
    requested_at: str
    decision: Decision | None = None
    decided_at: str | None = None


class AgentRun(_Wire):
    id: str
    agent: AgentKind
    tenant: str
    status: RunStatus
    title: str
    created_at: str
    updated_at: str
    messages: list[RunMessage] = Field(default_factory=list)
    tool_calls: list[ToolCall] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    approvals: list[Approval] = Field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "agent": self.agent,
            "tenant": self.tenant,
            "status": self.status,
            "title": self.title,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


# ---- the chaos exam (PLAN-2 P12) -------------------------------------------

ExamStatus = Literal["graded", "not_run", "no_alert", "error"]


class ExamRun(_Wire):
    """One invocation of `obs exam` — a group, a single scenario, or `--all`."""

    id: str
    group: str
    started_at: str
    finished_at: str | None = None
    git_sha: str = ""
    notes: str | None = None


class JudgeVerdict(_Wire):
    """What the judge returns through `submit_grade` — five booleans and the
    reasoning behind them. No score: the number is derived on `ExamResult`, so
    a judge cannot award itself one.

    `rationale` is required by the tool, not by this model, because a verdict
    that arrives without one is rejected at the tool boundary and never
    becomes a JudgeVerdict at all.
    """

    component_correct: bool
    cause_category_correct: bool
    evidence_cited: bool
    remediation_appropriate: bool
    cheated: bool
    rationale: str
    run_id: str | None = None


class ExamResult(_Wire):
    """One scenario's outcome inside an exam run.

    Every field but `scenario_id` and `status` is optional, because a row
    exists even when the question was never asked: a preflight 401 writes
    `not_run`, a missed alert writes `no_alert`, a failed inject writes
    `error`. Those three are harness/observability findings, not the agent
    being wrong, so they carry no verdict and no score.

    `score` is DERIVED here rather than returned by the judge (ADR-006). The
    judge answers five booleans and this property does the arithmetic, so a
    judge cannot award itself a number — and `cheated` collapses the whole row
    to 0 no matter how good the reasoning was.
    """

    scenario_id: str
    status: ExamStatus
    id: str | None = None
    exam_run_id: str | None = None
    incident_id: str | None = None
    agent_run_id: str | None = None
    judge_run_id: str | None = None
    component_correct: bool | None = None
    cause_category_correct: bool | None = None
    evidence_cited: bool | None = None
    remediation_appropriate: bool | None = None
    cheated: bool | None = None
    time_to_alert_s: int | None = None
    time_to_diagnosis_s: int | None = None
    turns: int | None = None
    tool_calls: int | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    judge_rationale: str | None = None
    created_at: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def score(self) -> int | None:
        if self.status != "graded":
            return None
        if self.cheated:
            return 0
        return sum(
            1
            for verdict in (
                self.component_correct,
                self.cause_category_correct,
                self.evidence_cited,
                self.remediation_appropriate,
            )
            if verdict
        )


class AgentChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    agent: AgentKind = "echo"
    tenant: str
    run_id: str | None = Field(default=None, alias="runId")
    message: str


class ApprovalDecisionBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    approval_id: str = Field(alias="approvalId")
    decision: Decision


# ---- SSE event builders (the AgentStreamEvent discriminated union) ----------


def ev_run(run_id: str) -> dict[str, Any]:
    return {"type": "run", "runId": run_id}


def ev_token(text: str) -> dict[str, Any]:
    return {"type": "token", "text": text}


def ev_tool_call(tc: ToolCall) -> dict[str, Any]:
    return {"type": "tool_call", "toolCall": tc.wire()}


def ev_artifact(artifact: Artifact) -> dict[str, Any]:
    return {"type": "artifact", "artifact": artifact.wire()}


def ev_approval(approval: Approval) -> dict[str, Any]:
    return {"type": "approval_required", "approval": approval.wire()}


def ev_done(run_id: str, status: RunStatus) -> dict[str, Any]:
    return {"type": "done", "runId": run_id, "status": status}


def ev_error(message: str) -> dict[str, Any]:
    return {"type": "error", "message": message}
