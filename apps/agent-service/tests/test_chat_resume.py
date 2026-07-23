"""Follow-up chat turns: hub buffer reset + /chat resume gating."""

from __future__ import annotations

from agent_service.app import RESUMABLE_STATUSES
from agent_service.hub import RunHub
from agent_service.models import ev_done, ev_run, ev_token


async def _collect(hub: RunHub, run_id: str) -> list[dict]:
    return [event async for event in hub.subscribe(run_id)]


def _turn(hub: RunHub, run_id: str, text: str) -> None:
    hub.publish(run_id, ev_run(run_id))
    hub.publish(run_id, ev_token(text))
    hub.publish(run_id, ev_done(run_id, "completed"))


async def test_subscribe_after_done_replays_and_terminates():
    hub = RunHub()
    _turn(hub, "r1", "turn one")
    events = await _collect(hub, "r1")
    assert [e["type"] for e in events] == ["run", "token", "done"]


async def test_cleanup_lets_a_follow_up_turn_stream():
    """Without the reset, a follow-up subscriber replays turn 1 and terminates
    at its buffered `done` — turn 2's events never reach the client (the bug
    that made multi-turn RCA chats look dead after the first answer)."""
    hub = RunHub()
    _turn(hub, "r1", "turn one")

    hub.cleanup("r1")  # what POST /chat does before spawning the next turn
    _turn(hub, "r1", "turn two")

    events = await _collect(hub, "r1")
    assert [e["text"] for e in events if e["type"] == "token"] == ["turn two"]
    assert events[-1]["type"] == "done"


def test_only_settled_runs_are_resumable():
    for status in ("completed", "failed", "denied"):
        assert status in RESUMABLE_STATUSES
    for live in ("queued", "running", "awaiting_approval"):
        assert live not in RESUMABLE_STATUSES
