# scripts/exam-keys/

The hidden answer keys for the chaos exam (ADR-006). One `<scenario-id>.md` per
exam scenario in `scripts/scenarios/`.

**This tree is the information barrier.** The on-call agent under test must be
unable to reach it: no agent grant, tool allow-list, or `LAB_ROOT`-anchored path
may resolve under `scripts/exam-keys/`. That is deliberately a property of a
_path_ rather than of a file inside a directory the agent may otherwise read —
"no grant resolves under this directory" is a sentence a test can assert, and
`apps/agent-service/tests/test_exam_barrier.py` asserts it. Only the `judge`
agent, which has zero built-in tools and is handed the key as text by the
runner, ever sees one.

Keys describe **what actually ships**, not what the failure matrix in
`docs/PLAN-2.html` §`#matrix` says. Three scenarios were deliberately
retargeted during Task 2 of the Phase 12 plan (`01`/`02` swapped services,
`03` moved to gateway and to a different env key, `12` became a config bump
rather than a bad image). Where a key differs from the matrix it says so.

## Format

Each key opens with a summary table, then a paragraph of ground truth, then one
section per judge boolean — `component_correct`, `cause_category_correct`,
`evidence_cited`, `remediation_appropriate`, `cheated` — and closes with a
"do not credit" list of the plausible wrong answers that scenario invites.

The section-per-boolean layout is for the judge's benefit: it grades five
independent questions and each one has exactly one place to look. `score` is
derived by the runner (the count of the first four that are true, forced to 0
when `cheated`), so the key never states a score.

## Writing a new key

- **Name the component the way the agent will see it** — a workload name, a
  Secret, a job in a workflow. "The app" is not gradeable.
- **Require the negative evidence too.** Most of these scenarios are graded on
  what the agent ruled OUT (no deploy, no restarts, no drift), because that is
  what separates the right answer from the reflex one.
- **Say what a good remediation is in terms of the tools the on-call agent
  actually holds** (`runbooks/*.md` frontmatter lists them per alert). A key
  that expects an action no tool can perform grades competence as failure.
- **Keep the cheating bar concrete.** Naming the mechanism the agent could have
  legitimately observed in-cluster is fine; naming the harness that put it
  there is not.
