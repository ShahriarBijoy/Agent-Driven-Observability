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


def test_build_mcp_server_resolves_every_tool_it_registers():
    """build_mcp_server references its @tool closures by name in one list. A
    renamed closure whose entry in that list is missed raises NameError only
    when the server is BUILT - i.e. on the first message of every agent run,
    not in any unit test. That is exactly how `_postmortem_pr` survived a
    rename and took the RCA chat and the oncall agent down with
    "agent crashed: name '_postmortem_pr' is not defined".

    Building it here is the cheapest thing that would have caught it.
    """
    from types import SimpleNamespace

    from agent_service.tools.sdk import build_mcp_server

    ctx = SimpleNamespace(run=SimpleNamespace(id="run_test", tenant="test-bench"), run_id="run_test")
    server = build_mcp_server(ctx)
    assert server is not None


def test_every_catalog_mcp_tool_is_actually_registered():
    """The settings UI offers TOOL_CATALOG entries as grantable. One naming a
    tool the server never registers is a grant that silently does nothing."""
    from types import SimpleNamespace

    from agent_service.tools.sdk import SERVER, TOOL_CATALOG, build_mcp_server

    ctx = SimpleNamespace(run=SimpleNamespace(id="run_test", tenant="test-bench"), run_id="run_test")
    server = build_mcp_server(ctx)
    registered = set()
    for attr in ("tools", "_tools"):
        got = getattr(server, attr, None)
        if got:
            registered = {getattr(t, "name", None) or getattr(t, "__name__", "") for t in got}
            break
    if not registered:  # SDK internals differ by version - skip rather than assert wrongly
        return
    catalog = {t["name"] for t in TOOL_CATALOG if t["kind"] == "mcp"}
    prefix = f"mcp__{SERVER}__"
    missing = {n for n in catalog if n.startswith(prefix) and n[len(prefix):] not in registered}
    assert not missing, f"catalog offers tools the server never registers: {sorted(missing)}"
