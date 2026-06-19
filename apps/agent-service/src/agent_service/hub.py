"""In-memory run hub: live SSE fan-out + approval rendezvous.

Postgres is the durable record (db.py); the hub is the *live* layer. Each run
keeps an event buffer (so a late `GET /runs/:id/stream` subscriber replays what
it missed) and a set of subscriber queues. It also owns the approval futures: a
`request_approval` tool call parks on a future here until `POST /runs/:id/
approve` resolves it.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

_TERMINAL = {"done", "error"}


@dataclass
class RunState:
    run_id: str
    buffer: list[dict[str, Any]] = field(default_factory=list)
    subscribers: set[asyncio.Queue] = field(default_factory=set)
    approvals: dict[str, asyncio.Future] = field(default_factory=dict)
    done: bool = False


class RunHub:
    def __init__(self) -> None:
        self._runs: dict[str, RunState] = {}

    def ensure(self, run_id: str) -> RunState:
        state = self._runs.get(run_id)
        if state is None:
            state = RunState(run_id=run_id)
            self._runs[run_id] = state
        return state

    def get(self, run_id: str) -> RunState | None:
        return self._runs.get(run_id)

    def publish(self, run_id: str, event: dict[str, Any]) -> None:
        """Fan an event out to every live subscriber and append it to the
        replay buffer. No awaits here, so subscribe()'s snapshot can't interleave
        with a publish — every event is delivered exactly once per subscriber."""
        state = self.ensure(run_id)
        state.buffer.append(event)
        for q in list(state.subscribers):
            q.put_nowait(event)
        if event.get("type") in _TERMINAL:
            state.done = True

    async def subscribe(self, run_id: str) -> AsyncGenerator[dict[str, Any], None]:
        state = self.ensure(run_id)
        q: asyncio.Queue = asyncio.Queue()
        snapshot = list(state.buffer)
        state.subscribers.add(q)
        try:
            for event in snapshot:
                yield event
                if event.get("type") in _TERMINAL:
                    return
            if state.done:
                return
            while True:
                event = await q.get()
                yield event
                if event.get("type") in _TERMINAL:
                    return
        finally:
            state.subscribers.discard(q)

    # ---- approval rendezvous -------------------------------------------------

    def make_approval(self, run_id: str, approval_id: str) -> asyncio.Future:
        state = self.ensure(run_id)
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        state.approvals[approval_id] = fut
        return fut

    def resolve_approval(self, run_id: str, approval_id: str, decision: str) -> bool:
        """Resolve a parked approval. Returns False if no live waiter exists
        (e.g. the service restarted) — the caller still updates Postgres."""
        state = self._runs.get(run_id)
        if state is None:
            return False
        fut = state.approvals.get(approval_id)
        if fut is None or fut.done():
            return False
        fut.set_result(decision)
        return True

    def cleanup(self, run_id: str) -> None:
        self._runs.pop(run_id, None)


hub = RunHub()
