"""The exam's result rows (PLAN-2 P12 Task 5).

`score` is the property worth testing: ADR-006 makes it **derived, never
judged** — the judge returns five booleans and the row computes the number,
so a judge that invents a score cannot change one. These tests pin the two
rules that derivation has to obey (cheating zeroes it; ungraded rows have no
score at all) and the wire shape the scorecard reads.
"""

from __future__ import annotations

from agent_service.models import ExamResult, ExamRun, now_iso


def test_score_is_derived_and_zeroed_by_cheating() -> None:
    r = ExamResult(scenario_id="02-error-storm", status="graded",
                   component_correct=True, cause_category_correct=True,
                   evidence_cited=True, remediation_appropriate=True, cheated=True)
    assert r.score == 0


def test_ungraded_rows_have_no_score() -> None:
    r = ExamResult(scenario_id="02-error-storm", status="not_run")
    assert r.score is None


def test_score_counts_the_four_booleans() -> None:
    r = ExamResult(scenario_id="01-latency", status="graded",
                   component_correct=True, cause_category_correct=True,
                   evidence_cited=False, remediation_appropriate=False, cheated=False)
    assert r.score == 2

    perfect = ExamResult(scenario_id="01-latency", status="graded",
                         component_correct=True, cause_category_correct=True,
                         evidence_cited=True, remediation_appropriate=True,
                         cheated=False)
    assert perfect.score == 4


def test_no_alert_and_error_rows_are_excluded_from_scoring() -> None:
    """`no_alert` is an OBSERVABILITY finding and `error` is a broken scenario —
    neither is the agent being wrong, so neither may score 0 and drag an
    aggregate down. Only `graded` rows carry a number."""
    for status in ("no_alert", "error"):
        r = ExamResult(scenario_id="14-red-pipeline", status=status,
                       component_correct=True, cause_category_correct=True,
                       evidence_cited=True, remediation_appropriate=True)
        assert r.score is None, status


def test_graded_row_with_no_verdict_scores_zero() -> None:
    """A row can only be `graded` if the judge returned; absent booleans mean
    nothing was credited, which is 0 — not "unscored"."""
    assert ExamResult(scenario_id="04-oomkill", status="graded").score == 0


def test_exam_result_wire_is_camelcase_and_carries_the_score() -> None:
    r = ExamResult(scenario_id="13-config-drift", status="graded",
                   exam_run_id="exam_1", component_correct=True,
                   cause_category_correct=False, evidence_cited=True,
                   remediation_appropriate=True, cheated=False,
                   time_to_alert_s=118, judge_rationale="quotes the report")
    wire = r.wire()
    assert wire["scenarioId"] == "13-config-drift"
    assert wire["examRunId"] == "exam_1"
    assert wire["timeToAlertS"] == 118
    assert wire["causeCategoryCorrect"] is False  # exclude_none must keep False
    assert wire["score"] == 3


def test_ungraded_wire_has_no_score_value() -> None:
    wire = ExamResult(scenario_id="05-phantom-tag", status="not_run").wire()
    assert wire.get("score") is None


def test_a_client_cannot_supply_its_own_score() -> None:
    """POST /exam/results validates into this model, so a runner (or anything
    else on the LAN holding the token) cannot post a score of its own choosing:
    `score` is computed, so an incoming key is ignored and the derivation wins.
    Also pins that the camelCase wire the runner sends validates."""
    r = ExamResult.model_validate({
        "scenarioId": "02-error-storm", "status": "graded",
        "examRunId": "exam_1", "componentCorrect": True,
        "causeCategoryCorrect": True, "evidenceCited": True,
        "remediationAppropriate": True, "cheated": True, "score": 4,
    })
    assert r.scenario_id == "02-error-storm"
    assert r.exam_run_id == "exam_1"
    assert r.score == 0


def test_exam_run_wire_keys() -> None:
    run = ExamRun(id="exam_1", group="inference", started_at=now_iso(),
                  git_sha="83175aa")
    wire = run.wire()
    assert wire["startedAt"]
    assert wire["gitSha"] == "83175aa"
    assert wire["group"] == "inference"
    assert "finishedAt" not in wire  # still running
