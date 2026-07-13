"""Settings validation + merge logic (pure parts; db is monkeypatched)."""

from __future__ import annotations

import pytest

from agent_service import db, settings
from agent_service.tools.sdk import TOOLSETS, mcp


def _patch_store(monkeypatch, stored: dict | None):
    saved: dict = {}

    async def fake_get():
        return stored

    async def fake_save(value):
        saved.clear()
        saved.update(value)

    monkeypatch.setattr(db, "get_settings", fake_get)
    monkeypatch.setattr(db, "save_settings", fake_save)
    return saved


@pytest.mark.asyncio
async def test_load_drops_unknown_agents_and_tools(monkeypatch):
    _patch_store(monkeypatch, {
        "model": "claude-sonnet-5",
        "toolGrants": {
            "rca": ["Bash", "NotARealTool"],
            "not-an-agent": ["Bash"],
        },
    })
    stg = await settings.load()
    assert stg.model == "claude-sonnet-5"
    assert stg.tool_grants == {"rca": ["Bash"]}


@pytest.mark.asyncio
async def test_apply_update_rejects_unknown_tool(monkeypatch):
    _patch_store(monkeypatch, None)
    with pytest.raises(settings.SettingsError):
        await settings.apply_update({"toolGrants": {"rca": ["DropTables"]}})


@pytest.mark.asyncio
async def test_apply_update_strips_defaults_and_persists(monkeypatch):
    saved = _patch_store(monkeypatch, None)
    stg = await settings.apply_update({
        "model": "  claude-fable-5 ",
        # loki_query is already in rca's defaults; only Bash is a real grant.
        "toolGrants": {"rca": [mcp("loki_query"), "Bash", "Bash"]},
    })
    assert stg.model == "claude-fable-5"
    assert stg.tool_grants == {"rca": ["Bash"]}
    assert saved == {"model": "claude-fable-5", "toolGrants": {"rca": ["Bash"]}}


def test_resolve_allowed_merges_defaults_first():
    stg = settings.AgentSettings(tool_grants={"rca": ["Bash", mcp("tempo_query")]})
    allowed = settings.resolve_allowed("rca", stg)
    assert allowed[: len(TOOLSETS["rca"])] == TOOLSETS["rca"]
    assert allowed.count(mcp("tempo_query")) == 1  # granted duplicate not re-added
    assert "Bash" in allowed


def test_runbook_read_granted_to_readers_by_default():
    for kind in ("rca", "incident-reporter"):
        assert mcp("runbook_read") in TOOLSETS[kind]
