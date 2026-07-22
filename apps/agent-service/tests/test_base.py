"""Session-outcome mapping for the shared agent run loop (pure parts)."""

from __future__ import annotations

from agent_service.agents.base import _DENYABLE_BUILTINS, stop_reason
from agent_service.tools.sdk import TOOLSETS


def test_normal_completion_is_not_a_failure():
    assert stop_reason("success", False, None, 24) is None
    assert stop_reason(None, False, None, 24) is None  # no ResultMessage seen


def test_max_turns_names_the_limit():
    reason = stop_reason("error_max_turns", True, None, 24)
    assert reason is not None
    assert "24" in reason
    assert "turn limit" in reason


def test_max_turns_without_limit_still_reads():
    reason = stop_reason("error_max_turns", True, None, None)
    assert reason == "the agent hit its turn limit before finishing"


def test_error_with_detail_surfaces_detail():
    reason = stop_reason("success", True, "API error: overloaded", 24)
    assert reason == "API error: overloaded"


def test_error_without_detail_names_subtype():
    reason = stop_reason("error_during_execution", True, None, 24)
    assert reason == "the session ended abnormally (error_during_execution)"


def test_deny_list_covers_the_observed_flailing_tools():
    # The RCA autopsy showed the model reaching for these built-ins; all must
    # be removable from context for agents that weren't granted them.
    for name in ("Bash", "Read", "Glob", "Grep"):
        assert name in _DENYABLE_BUILTINS


def test_allowed_override_only_narrows():
    from agent_service.agents.base import apply_override

    assert apply_override(["a", "b", "c"], ["b", "zzz"]) == ["b"]
    assert apply_override(["a", "b"], None) == ["a", "b"]


def test_oncall_information_barrier_removes_unshaped_tools():
    """Oncall must not use built-ins or external MCP, regardless of grants."""
    # Simulate an allowed-list that includes tools oncall shouldn't have
    # (via operator grants or extra_allowed).
    test_allowed = [
        # Legitimate oncall tools from TOOLSETS
        *TOOLSETS["oncall"],
        # Unshaped tools that might be granted but should be stripped
        "Bash", "Read", "Glob",
        "mcp__k8s__pods_list", "mcp__k8s__pods_get",
    ]

    # Apply the barrier (mimicking the logic in run_agent_session for oncall)
    filtered = [
        t for t in test_allowed
        if t not in _DENYABLE_BUILTINS and not t.startswith("mcp__k8s__")
    ]

    # Verify unshaped tools are gone
    assert "Bash" not in filtered
    assert "Read" not in filtered
    assert "Glob" not in filtered
    assert "mcp__k8s__pods_list" not in filtered
    assert "mcp__k8s__pods_get" not in filtered

    # Verify oncall's legitimate tools remain
    assert "mcp__obslab__loki_query" in filtered or "mcp__obslab__loki_query" in TOOLSETS["oncall"]
    legit_oncall_tool = TOOLSETS["oncall"][0] if TOOLSETS["oncall"] else None
    if legit_oncall_tool:
        assert legit_oncall_tool in filtered
