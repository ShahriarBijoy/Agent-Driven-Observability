"""add_artifact must do both halves of the persist+publish pattern."""

from __future__ import annotations

from agent_service.context import new_run
from agent_service.hub import hub


async def test_add_artifact_stamps_created_at_and_publishes(monkeypatch) -> None:
    saved: list[tuple[str, object]] = []

    async def fake_add_artifact(run_id: str, artifact: object) -> None:
        saved.append((run_id, artifact))

    monkeypatch.setattr("agent_service.db.add_artifact", fake_add_artifact)

    ctx = new_run("rca", "acme", "test run")
    art = await ctx.add_artifact("report.html", "text/html", "<h1>hi</h1>")
    try:
        assert art.created_at  # stamped at creation
        assert saved and saved[0][0] == ctx.run_id  # persisted
        events = hub.ensure(ctx.run_id).buffer  # published
        assert {"type": "artifact", "artifact": art.wire()} in events
    finally:
        hub.cleanup(ctx.run_id)
