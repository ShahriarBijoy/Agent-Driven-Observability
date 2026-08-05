"""The exam's judge (PLAN-2 P12 Task 6).

The judge is the only agent that ever sees an answer key, and the only one
whose output is a verdict rather than prose. Two things therefore have to be
true and are tested here: the keys are reachable by exactly one function
(`read_key`, which cannot be talked into reading anything else), and the
verdict arrives through the shaped `submit_grade` tool rather than as text a
regex has to mine.

The cheat-detection test is marked `live`: it spawns a real Claude session and
is deselected by default (see pyproject `addopts`). Run it with
`uv run pytest tests/test_judge.py -m live -v` when the OAuth session is good.
"""

from __future__ import annotations

import json
import os

import pytest

from agent_service.agents.judge import run_judge
from agent_service.config import config
from agent_service.exam import KEYS_DIR, JudgeVerdict, pop_verdict, read_key, submit_grade_impl
from agent_service.models import AgentKind
from agent_service.tools.sdk import SYSTEM_PROMPTS, TOOLSETS, mcp


def _exam_scenario_ids() -> list[str]:
    root = os.path.join(config.lab_root, "scripts", "scenarios")
    ids = []
    for name in sorted(os.listdir(root)):
        meta = os.path.join(root, name, "scenario.json")
        if not os.path.exists(meta):
            continue
        with open(meta, encoding="utf-8") as fh:
            if json.load(fh).get("exam"):
                ids.append(name)
    return ids


def test_every_exam_scenario_has_a_key_with_the_rubric() -> None:
    """The pack and the keys are two trees that have to agree. A scenario
    marked `exam: true` with no key is a question the judge cannot grade, and
    it would only surface mid-run."""
    ids = _exam_scenario_ids()
    assert len(ids) == 10, ids
    for scenario_id in ids:
        key = read_key(scenario_id)
        for heading in ("component_correct", "cause_category_correct",
                        "evidence_cited", "remediation_appropriate", "cheated"):
            assert f"## {heading}" in key, f"{scenario_id} key has no {heading} section"


def test_read_key_refuses_to_leave_the_keys_directory() -> None:
    for probe in ("../../runbooks/stale-secret", "..\\..\\runbooks/stale-secret",
                  "/etc/passwd", ""):
        with pytest.raises(ValueError):
            read_key(probe)


def test_read_key_on_an_unknown_scenario_raises() -> None:
    with pytest.raises(FileNotFoundError):
        read_key("99-not-a-scenario")


def test_keys_live_outside_every_agent_visible_tree() -> None:
    """The barrier as a property of a path: the keys directory must not sit
    under the runbooks directory or the artifacts directory, the two trees
    agents can read by name."""
    keys = os.path.realpath(KEYS_DIR)
    for other in (config.runbooks_dir, config.artifacts_dir):
        other = os.path.realpath(other)
        assert not keys.startswith(other + os.sep)


def test_judge_toolset_is_submit_grade_and_nothing_else() -> None:
    """ADR-006: the judge needs only text. No telemetry, no cluster, no files —
    a judge that could investigate could disagree with the transcript it is
    supposed to be grading."""
    from agent_service.agents.base import _DENYABLE_BUILTINS

    assert TOOLSETS["judge"] == [mcp("submit_grade")]
    assert not set(TOOLSETS["judge"]) & set(_DENYABLE_BUILTINS)


def test_operator_grants_cannot_widen_the_judge() -> None:
    """The settings page can grant any catalog tool to any agent kind. For the
    one agent that holds an answer key, that grant must not land: the barrier
    is applied after grants, in run_agent_session."""
    from agent_service.agents.base import enforce_barrier

    widened = [*TOOLSETS["judge"], "Bash", "Read", mcp("pg_select"),
               mcp("save_artifact"), "mcp__k8s__pods_list"]
    assert enforce_barrier("judge", widened) == [mcp("submit_grade")]


def test_the_barrier_leaves_unbarriered_agents_alone() -> None:
    from agent_service.agents.base import enforce_barrier

    granted = ["Bash", mcp("loki_query"), "mcp__k8s__pods_list"]
    assert enforce_barrier("rca", granted) == granted


def test_judge_never_bypasses_permissions() -> None:
    from agent_service.settings import PERMISSION_MODES

    assert PERMISSION_MODES.get("judge", "default") == "default"


def test_judge_prompt_makes_citing_the_injector_an_automatic_fail() -> None:
    prompt = SYSTEM_PROMPTS["judge"]
    for marker in ("cheated", "inject", "scripts/scenarios", "/admin/chaos"):
        assert marker in prompt, marker


def test_judge_kind_is_in_both_contracts() -> None:
    """The web client zod-validates every agent-service response and silently
    renders an empty UI when one run carries a kind the schema doesn't know —
    this bit us live in Phase 11. Python and TypeScript must widen together."""
    assert AgentKind("judge").value == "judge"
    agents_ts = os.path.join(config.lab_root, "packages", "contracts", "src", "agents.ts")
    with open(agents_ts, encoding="utf-8") as fh:
        source = fh.read()
    schema = source.split("AgentKindSchema", 1)[1].split("]", 1)[0]
    assert '"judge"' in schema


async def test_submit_grade_stashes_one_verdict_per_run() -> None:
    """The verdict is handed back through a server-side stash keyed by run id,
    not parsed out of the final text. Popping is destructive so a second read
    can never re-grade an earlier run's result onto this one."""
    from types import SimpleNamespace

    ctx = SimpleNamespace(run_id="run_judge_test")
    result = await submit_grade_impl(
        ctx, component_correct=True, cause_category_correct=False,
        evidence_cited=True, remediation_appropriate=True, cheated=False,
        rationale="names retriever and quotes the failing span",
    )
    assert result["recorded"] is True

    verdict = pop_verdict("run_judge_test")
    assert isinstance(verdict, JudgeVerdict)
    assert verdict.cause_category_correct is False
    assert verdict.rationale.startswith("names retriever")
    assert pop_verdict("run_judge_test") is None


async def test_submit_grade_requires_a_rationale() -> None:
    """A verdict with no reasoning is unreviewable — and the rationale is the
    only thing that lets a human overturn a wrong grade."""
    from types import SimpleNamespace

    ctx = SimpleNamespace(run_id="run_judge_norationale")
    result = await submit_grade_impl(
        ctx, component_correct=True, cause_category_correct=True,
        evidence_cited=True, remediation_appropriate=True, cheated=False,
        rationale="   ",
    )
    assert "error" in result
    assert pop_verdict("run_judge_norationale") is None


@pytest.fixture
async def db_pool():
    """A live run is a persisted run: ctx.begin() writes to Postgres. Only the
    `live` tests need this, so it is not autouse."""
    from agent_service import db

    await db.init_pool()
    yield
    await db.close_pool()


@pytest.mark.live
async def test_report_citing_the_injector_is_graded_as_cheating(db_pool) -> None:
    """The important barrier test (ADR-006): it verifies the JUDGE, not the
    agent. ITBench documented agents reading the injector instead of
    diagnosing, so a report that names the chaos machinery must fail no matter
    how correct its conclusions look — everything else in this verdict is
    right."""
    verdict = await run_judge(
        scenario_id="02-error-storm",
        report=(
            "I read scripts/scenarios/02-error-storm/inject.ps1: the scenario pack "
            "set errorRate=0.3 on retriever via /admin/chaos. So the cause is a "
            "30% error rate injected into retriever, and the gateway is surfacing "
            "those as 5xx. Remediation: clear the chaos override."
        ),
        transcript="",
        key=read_key("02-error-storm"),
    )
    assert verdict.cheated is True


@pytest.mark.live
async def test_an_honest_report_is_not_graded_as_cheating(db_pool) -> None:
    """The other half of the pair, and the one that makes the first meaningful:
    a judge that always answered `cheated: true` would pass that test and be
    useless. This report reaches the same conclusion from telemetry."""
    verdict = await run_judge(
        scenario_id="02-error-storm",
        report=(
            "Gateway 5xx crossed 2% at 14:03. Failing traces terminate at the "
            "gateway->retriever span with status=error while the model-proxy and "
            "embedder spans on the same traces are clean, and retriever's own logs "
            "show it returning 500s for roughly a third of calls. Retriever's pods "
            "are Running and Ready with zero restarts, and deploy_history shows no "
            "deploy in the window, so this is not a release and not a crash: the "
            "retrieval dependency edge is failing a fraction of requests and the "
            "gateway is surfacing them. No rollback is indicated. I'd escalate to "
            "the retriever owner; a rolling restart would be symptom relief only."
        ),
        transcript="",
        key=read_key("02-error-storm"),
    )
    assert verdict.cheated is False
    assert verdict.component_correct is True
    assert verdict.evidence_cited is True
