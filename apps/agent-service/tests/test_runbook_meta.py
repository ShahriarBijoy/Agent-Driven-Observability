"""Tests for the runbook frontmatter parser, the runbook_lookup narrowing
match, and the enforce_budget hard token backstop (PLAN-2 P11 Task 6)."""

from __future__ import annotations

import dataclasses
import json

import pytest

from agent_service import config as config_module
from agent_service.tools import backends
from agent_service.tools import sdk as toolsdk


# ---- parse_runbook_meta ------------------------------------------------------


def test_no_frontmatter_returns_empty_dict() -> None:
    assert backends.parse_runbook_meta("# Just a runbook\n\nno frontmatter here.\n") == {}


def test_inline_lists() -> None:
    text = (
        "---\n"
        "alert_types: [k8s-pod-crashloop, KubePodCrashLooping, k8s-container-waiting]\n"
        "tools: [kubectl_read, k8s_events, deploy_history]\n"
        "---\n"
        "# Title\n"
    )
    meta = backends.parse_runbook_meta(text)
    assert meta["alert_types"] == [
        "k8s-pod-crashloop", "KubePodCrashLooping", "k8s-container-waiting",
    ]
    assert meta["tools"] == ["kubectl_read", "k8s_events", "deploy_history"]


def test_block_lists() -> None:
    text = (
        "---\n"
        "alert_types: [gw-5xx]\n"
        "tools: [loki_query]\n"
        "hypotheses:\n"
        "  - A new revision introduced a bad env/config and dies at startup\n"
        "  - An image or dependency is missing\n"
        "---\n"
        "# Title\n"
    )
    meta = backends.parse_runbook_meta(text)
    assert meta["hypotheses"] == [
        "A new revision introduced a bad env/config and dies at startup",
        "An image or dependency is missing",
    ]


def test_empty_inline_list() -> None:
    text = "---\nalert_types: []\ntools: [pg_select]\n---\nbody\n"
    meta = backends.parse_runbook_meta(text)
    assert meta["alert_types"] == []
    assert meta["tools"] == ["pg_select"]


def test_multiline_flow_sequence() -> None:
    # The exact shape oxfmt reflows a long inline list into: a bare `key:`,
    # a `[` on its own line, one item per line with a trailing comma, `]`.
    text = (
        "---\n"
        "alert_types: [rollout-stuck]\n"
        "tools:\n"
        "  [\n"
        "    rollout_status,\n"
        "    analysisrun_get,\n"
        "    rollout_abort,\n"
        "    rollout_undo,\n"
        "  ]\n"
        "hypotheses:\n"
        "  - The canary regressed a real metric threshold\n"
        "---\n"
        "# Title\n"
    )
    meta = backends.parse_runbook_meta(text)
    assert meta["alert_types"] == ["rollout-stuck"]
    assert meta["tools"] == [
        "rollout_status", "analysisrun_get", "rollout_abort", "rollout_undo",
    ]
    assert meta["hypotheses"] == ["The canary regressed a real metric threshold"]


def test_inline_flow_sequence_spanning_one_line_with_trailing_comma() -> None:
    # A bracketed list kept on the key line but with a trailing comma also parses.
    meta = backends.parse_runbook_meta("---\ntools: [a, b,]\n---\n")
    assert meta["tools"] == ["a", "b"]


def test_frontmatter_must_be_at_the_very_start() -> None:
    text = "# Title\n\n---\nalert_types: [x]\n---\n"
    assert backends.parse_runbook_meta(text) == {}


# ---- runbook_lookup -----------------------------------------------------------


def _write_runbook(tmp_path, name: str, alert_types: list[str], tools: list[str]) -> None:
    inline_alerts = ", ".join(alert_types)
    inline_tools = ", ".join(tools)
    (tmp_path / name).write_text(
        f"---\nalert_types: [{inline_alerts}]\ntools: [{inline_tools}]\n"
        "hypotheses:\n  - a hypothesis\n---\n"
        f"# {name}\n\n**Trigger:** test\n\n## Diagnose\n\n1. look\n",
        encoding="utf-8",
    )


@pytest.fixture
def runbooks_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(
        backends, "config",
        dataclasses.replace(config_module.config, runbooks_dir=str(tmp_path)),
    )
    return tmp_path


async def test_lookup_exact_match(runbooks_dir) -> None:
    _write_runbook(runbooks_dir, "crashloop.md", ["k8s-pod-crashloop"], ["kubectl_read"])
    _write_runbook(runbooks_dir, "other.md", ["some-other-alert"], ["pg_select"])

    result = await backends.runbook_lookup("k8s-pod-crashloop")
    assert result["runbook"] == "crashloop.md"
    assert result["meta"]["tools"] == ["kubectl_read"]
    assert "match" not in result
    # frontmatter block itself must not leak into the returned content
    assert "---" not in result["content"]
    assert result["content"].startswith("# crashloop.md")
    # A single match still populates "matches" (one entry, same shape as the
    # top-level fields) so callers can always read the list uniformly.
    assert result["matches"] == [
        {"runbook": "crashloop.md", "meta": result["meta"], "content": result["content"]}
    ]


async def test_lookup_multi_match_unions_both_runbooks() -> None:
    # slo-avail-fast is claimed by BOTH gateway-high-error-rate.md and
    # stale-secret.md against the REAL runbooks/ tree — the sorted-filename
    # first match ("gateway-high-error-rate.md" < "stale-secret.md") must not
    # silently drop stale-secret's remediation tools (design decision:
    # multi-match union, not a tie-break).
    match = await backends.runbook_lookup("slo-avail-fast")
    names = {m["runbook"] for m in match["matches"]}
    assert names == {"gateway-high-error-rate.md", "stale-secret.md"}
    # Backward-compat: the top-level fields still mirror the first match.
    assert match["runbook"] == "gateway-high-error-rate.md"
    assert match["matches"][0]["runbook"] == match["runbook"]
    # Neither match's content leaks its frontmatter block.
    for m in match["matches"]:
        assert "---" not in m["content"]

    all_tools = [t for m in match["matches"] for t in (m["meta"].get("tools") or [])]
    override = _allowed_override(all_tools)
    # stale-secret.md's own remediation tool, correctly namespaced, survives
    # the union alongside gateway-high-error-rate.md's tools.
    assert toolsdk.mcp("update_db_secret") in override
    assert toolsdk.mcp("restart_workload") in override


async def test_lookup_no_match_lists_available(runbooks_dir) -> None:
    _write_runbook(runbooks_dir, "crashloop.md", ["k8s-pod-crashloop"], ["kubectl_read"])

    result = await backends.runbook_lookup("nonexistent-alert")
    assert result == {"match": None, "available": ["crashloop.md"]}


async def test_lookup_ignores_runbooks_without_frontmatter(runbooks_dir) -> None:
    (runbooks_dir / "legacy.md").write_text("# Legacy\n\nno frontmatter.\n", encoding="utf-8")

    result = await backends.runbook_lookup("legacy-alert")
    assert result["match"] is None
    assert "legacy.md" in result["available"]


# ---- runbook_read frontmatter stripping ---------------------------------------
#
# Agents never see the metadata block through runbook_read — it exists only
# for runbook_lookup's narrowing. Pinned against a REAL frontmatter-bearing
# runbook, using the same splitter runbook_lookup uses (backends._strip_frontmatter).


async def test_runbook_read_strips_frontmatter() -> None:
    result = await backends.runbook_read("gateway-high-error-rate.md")
    assert "error" not in result
    assert "---" not in result["content"]
    # Body intact past the stripped frontmatter block.
    assert result["content"].startswith("# Gateway high error rate")
    assert "## Diagnose" in result["content"]
    assert "## Mitigate" in result["content"]


# ---- enforce_budget -----------------------------------------------------------


def test_small_payload_passes_through_untouched() -> None:
    payload = {"error": "not found", "path": "x.md"}
    assert backends.enforce_budget("runbook_read", payload) == payload


def test_long_string_is_clipped_and_flagged() -> None:
    long_text = "x" * (backends.DEFAULT_TOOL_BUDGET + 500)
    result = backends.enforce_budget("some_tool", {"output": long_text})
    assert result["truncated"] is True
    assert len(result["output"]) <= backends.DEFAULT_TOOL_BUDGET + 60  # clip + marker text


def test_per_tool_budget_overrides_default() -> None:
    long_text = "x" * (backends.DEFAULT_TOOL_BUDGET + 500)
    # Under the kubectl_read budget (8000), so it must NOT be clipped even
    # though it exceeds the DEFAULT budget (6000).
    result = backends.enforce_budget("kubectl_read", {"output": long_text})
    assert "truncated" not in result
    assert result["output"] == long_text


def test_many_small_fields_bound_total_json_size() -> None:
    # Each string individually is well under the budget, but there are
    # enough of them that the whole payload's JSON blows past it.
    payload = {f"field_{i}": "y" * 100 for i in range(200)}
    result = backends.enforce_budget("some_tool", payload)
    assert result["truncated"] is True
    assert len(json.dumps(result)) <= backends.DEFAULT_TOOL_BUDGET + 200


def test_nested_structures_are_deep_truncated() -> None:
    long_text = "z" * (backends.DEFAULT_TOOL_BUDGET + 200)
    payload = {"lines": [{"line": long_text, "labels": {"pod": "gateway-1"}}]}
    result = backends.enforce_budget("some_tool", payload)
    assert result.get("truncated") is True


# ---- runbook match narrows the oncall toolset ---------------------------------
#
# oncall.run_oncall normalizes a matched runbook's plain tool names (e.g.
# "kubectl_read") through toolsdk.mcp() before union-ing with
# ONCALL_ALWAYS_TOOLS (already mcp-namespaced) — this is the exact
# computation, exercised directly against a real runbook so a spelling
# mismatch between runbook `tools:` entries and TOOLSETS/ONCALL_ALWAYS_TOOLS
# would fail loudly here instead of silently narrowing to nothing at runtime.


def _allowed_override(meta_tools: list[str]) -> list[str]:
    return sorted(
        {toolsdk.mcp(name) for name in meta_tools} | set(toolsdk.ONCALL_ALWAYS_TOOLS)
    )


async def test_matched_runbook_narrows_below_the_full_oncall_baseline() -> None:
    match = await backends.runbook_lookup("KubePodCrashLooping")
    assert match["runbook"] == "k8s-crashloop.md"

    override = _allowed_override(match["meta"]["tools"])
    baseline = toolsdk.TOOLSETS["oncall"]

    # Every narrowed tool is namespaced correctly and was already in the
    # oncall baseline (apply_override in agents/base.py additionally enforces
    # this at runtime; this test pins the runbook's own tool-name spelling).
    assert set(override) <= set(baseline)
    assert len(override) < len(baseline)
    # The always-on session spine survives narrowing regardless of the
    # runbook's own tools: list.
    assert set(toolsdk.ONCALL_ALWAYS_TOOLS) <= set(override)
    # And the runbook's own declared tool is in fact present, correctly
    # namespaced.
    assert toolsdk.mcp("kubectl_read") in override


async def test_no_runbook_match_means_no_narrowing_signal() -> None:
    match = await backends.runbook_lookup("some-alert-with-no-runbook")
    assert match["match"] is None
    assert "available" in match
