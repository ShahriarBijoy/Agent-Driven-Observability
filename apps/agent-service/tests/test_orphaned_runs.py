"""A restart must not leave phantom 'running' rows — fail_orphaned_runs."""

from __future__ import annotations

from agent_service import db


class FakePool:
    def __init__(self, running_ids: list[str]) -> None:
        self.running_ids = running_ids
        self.executed: list[tuple[str, tuple]] = []

    async def fetch(self, query: str, *args: object) -> list[dict[str, str]]:
        assert "status = 'running'" in query
        return [{"id": run_id} for run_id in self.running_ids]

    async def execute(self, query: str, *args: object) -> None:
        self.executed.append((query, args))


async def test_orphans_get_notice_and_failed_status(monkeypatch) -> None:
    pool = FakePool(["run_a", "run_b"])
    monkeypatch.setattr(db, "_pool", pool)

    orphans = await db.fail_orphaned_runs()

    assert orphans == ["run_a", "run_b"]
    for run_id in orphans:
        notices = [
            args for query, args in pool.executed
            if "INSERT INTO agent_messages" in query and args[1] == run_id
        ]
        assert len(notices) == 1
        assert notices[0][3] == db.ORPHAN_NOTICE
        fails = [
            args for query, args in pool.executed
            if "SET status = $2" in query and args[0] == run_id
        ]
        assert len(fails) == 1
        assert fails[0][1] == "failed"
        assert fails[0][3] is True  # ended_at gets stamped


async def test_no_orphans_is_a_no_op(monkeypatch) -> None:
    pool = FakePool([])
    monkeypatch.setattr(db, "_pool", pool)

    assert await db.fail_orphaned_runs() == []
    assert pool.executed == []
