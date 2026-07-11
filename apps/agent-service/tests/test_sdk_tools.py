"""save_artifact kind → (media type, default name) mapping."""

from __future__ import annotations

from agent_service.tools.sdk import ARTIFACT_KINDS


def test_artifact_kinds() -> None:
    assert ARTIFACT_KINDS["markdown"] == ("text/markdown", "artifact.md")
    assert ARTIFACT_KINDS["json"] == ("application/json", "artifact.json")
    assert ARTIFACT_KINDS["html"] == ("text/html", "artifact.html")
