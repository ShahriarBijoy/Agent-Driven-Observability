"""The chaos exam's server side (PLAN-2 P12).

Two things live here and they belong together: the ONE function that resolves
an answer key, and the stash `submit_grade` drops a verdict into so
`agents/judge.py` can return it as data instead of mining it out of prose.

`scripts/exam-keys/` is named in exactly one place — `KEYS_DIR`, below. That is
the information barrier written as a property of the code rather than a
promise: no tool allow-list, no runbook path and no artifact path resolves
under it, and nothing else in this service knows the directory exists.

The key itself never enters an agent run's stored transcript. It is passed to
the judge as prompt text (which base.py does not persist) and never through
`add_user_message`/`add_assistant_message` — the on-call agent holds
`pg_select`, so a key written into `agent_messages` would be a key the agent
under test could query.
"""

from __future__ import annotations

import os
import re

from .config import config
from .models import JudgeVerdict

KEYS_DIR = os.path.join(config.lab_root, "scripts", "exam-keys")

# The same directory as a REPO path, for the tools that read the forge instead
# of the filesystem. The keys are committed (they should be versioned), so a
# diff spanning the commit that added them would hand the agent under test the
# answers — `gitea_compare` withholds anything under this prefix. Derived from
# KEYS_DIR so the directory is still named exactly once.
KEYS_REPO_PREFIX = os.path.relpath(KEYS_DIR, config.lab_root).replace(os.sep, "/") + "/"

# Scenario ids are `NN-name` by construction (ADR-006: ids are always NN-name,
# group names are always bare words, so the two namespaces cannot collide).
# Pinning that shape here is what makes traversal impossible: there is no
# separator, no dot and no drive letter a caller could smuggle through.
_SCENARIO_ID = re.compile(r"^[0-9]{2}-[a-z0-9-]+$")


def read_key(scenario_id: str) -> str:
    """The hidden answer key for one exam scenario.

    Raises ValueError for anything that is not a scenario id, and
    FileNotFoundError when the id is well-formed but has no key — a scenario
    marked `exam: true` with no key is a question nobody can grade, and it
    should fail loudly rather than grade against an empty string.
    """
    if not _SCENARIO_ID.match(scenario_id.strip()):
        raise ValueError(f"not a scenario id: {scenario_id!r}")
    root = os.path.realpath(KEYS_DIR)
    target = os.path.realpath(os.path.join(root, f"{scenario_id.strip()}.md"))
    # Belt and braces: the regex already makes this unreachable, but a future
    # looser id shape must not silently become a file read outside the tree.
    if not target.startswith(root + os.sep):
        raise ValueError(f"answer-key path escapes {KEYS_DIR}: {scenario_id!r}")
    with open(target, encoding="utf-8") as fh:
        return fh.read()


# ---- the judge's verdict channel --------------------------------------------
#
# Keyed by run id, like remediate.py's dry-run stash: the tool closure knows
# the run it belongs to, and run_judge pops the verdict once the session ends.
# Popping is destructive so a second read can never re-grade an earlier run's
# verdict onto this one.
_verdicts: dict[str, JudgeVerdict] = {}


async def submit_grade_impl(
    ctx,
    *,
    component_correct: bool,
    cause_category_correct: bool,
    evidence_cited: bool,
    remediation_appropriate: bool,
    cheated: bool,
    rationale: str,
) -> dict:
    """The body behind the `submit_grade` MCP tool.

    Factored out of the per-run closure in tools/sdk.py so it is directly
    callable — by the tool wrapper in production and by tests that want the
    genuine record-then-pop flow without the Agent SDK's MCP dispatch.
    """
    if not rationale.strip():
        return {
            "error": "rationale is required: state, in one or two sentences and "
                     "quoting the report, why each boolean is what it is",
        }
    _verdicts[ctx.run_id] = JudgeVerdict(
        component_correct=component_correct,
        cause_category_correct=cause_category_correct,
        evidence_cited=evidence_cited,
        remediation_appropriate=remediation_appropriate,
        cheated=cheated,
        rationale=rationale.strip(),
    )
    return {
        "recorded": True,
        "instruction": "Grade recorded. Stop here — do not restate it in prose.",
    }


def pop_verdict(run_id: str) -> JudgeVerdict | None:
    return _verdicts.pop(run_id, None)
