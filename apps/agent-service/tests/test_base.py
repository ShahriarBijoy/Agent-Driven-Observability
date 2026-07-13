"""Session-outcome mapping for the shared agent run loop (pure parts)."""

from __future__ import annotations

from agent_service.agents.base import _DENYABLE_BUILTINS, stop_reason


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
