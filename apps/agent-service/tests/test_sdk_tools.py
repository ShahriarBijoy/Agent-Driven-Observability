"""save_artifact kind → (media type, default name) mapping."""

from __future__ import annotations

from agent_service.tools.sdk import ARTIFACT_KINDS, TOOLSETS


def test_artifact_kinds() -> None:
    assert ARTIFACT_KINDS["markdown"] == ("text/markdown", "artifact.md")
    assert ARTIFACT_KINDS["json"] == ("application/json", "artifact.json")
    assert ARTIFACT_KINDS["html"] == ("text/html", "artifact.html")


def test_oncall_toolset_has_zero_builtins_and_no_external_mcp():
    from agent_service.agents.base import _DENYABLE_BUILTINS

    tools = TOOLSETS["oncall"]
    assert not set(tools) & set(_DENYABLE_BUILTINS)
    assert not [t for t in tools if t.startswith("mcp__k8s__")]


def test_oncall_never_bypasses_permissions():
    from agent_service.settings import PERMISSION_MODES

    assert PERMISSION_MODES.get("oncall", "default") == "default"
