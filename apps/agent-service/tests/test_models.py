"""Guards on the wire contract (must stay byte-compatible with @obs/contracts).

The web BFF validates every frame against the Zod schemas, so the camelCase
keys, the `Z`-suffixed millisecond timestamps, and the AgentStreamEvent shapes
are load-bearing. These tests fail loudly if the serialisation drifts.
"""

from __future__ import annotations

import re

from agent_service.models import (
    Artifact,
    AgentRun,
    Approval,
    ToolCall,
    ev_approval,
    ev_artifact,
    ev_done,
    ev_run,
    ev_token,
    ev_tool_call,
    new_id,
    now_iso,
)

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")


def test_now_iso_matches_zod_datetime() -> None:
    assert ISO_RE.match(now_iso())


def test_new_id_has_prefix() -> None:
    rid = new_id("run")
    assert rid.startswith("run_")
    assert new_id("run") != rid  # monotonic, unique


def test_tool_call_wire_is_camelcase_and_drops_none() -> None:
    tc = ToolCall(id="t1", name="loki_query", args={"logql": "{}"},
                  status="pending", started_at=now_iso())
    wire = tc.wire()
    assert wire["startedAt"]  # camelCase alias
    assert "endedAt" not in wire  # exclude_none
    assert "result" not in wire
    assert wire["status"] == "pending"


def test_agent_run_wire_keys() -> None:
    run = AgentRun(id="r1", agent="rca", tenant="acme", status="running",
                   title="t", created_at=now_iso(), updated_at=now_iso())
    wire = run.wire()
    for key in ("createdAt", "updatedAt", "toolCalls", "messages", "artifacts", "approvals"):
        assert key in wire


def test_stream_event_shapes() -> None:
    assert ev_run("r1") == {"type": "run", "runId": "r1"}
    assert ev_token("hi") == {"type": "token", "text": "hi"}
    assert ev_done("r1", "completed") == {"type": "done", "runId": "r1", "status": "completed"}

    tc = ToolCall(id="t1", name="x", args={}, status="ok", started_at=now_iso())
    assert ev_tool_call(tc)["type"] == "tool_call"
    assert ev_tool_call(tc)["toolCall"]["id"] == "t1"

    apr = Approval(id="a1", summary="s", requested_at=now_iso())
    out = ev_approval(apr)
    assert out["type"] == "approval_required"
    assert out["approval"]["requestedAt"]


def test_artifact_wire_has_created_at_and_html_media() -> None:
    art = Artifact(id="a1", name="report.html", media_type="text/html",
                   content="<h1>x</h1>", created_at=now_iso())
    wire = art.wire()
    assert wire["mediaType"] == "text/html"
    assert ISO_RE.match(wire["createdAt"])


def test_ev_artifact_shape() -> None:
    art = Artifact(id="a1", name="report.html", media_type="text/html",
                   content="<h1>x</h1>", created_at=now_iso())
    out = ev_artifact(art)
    assert out["type"] == "artifact"
    assert out["artifact"]["id"] == "a1"
    assert out["artifact"]["createdAt"]
