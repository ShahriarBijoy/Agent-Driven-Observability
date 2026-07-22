---
alert_types: [cicd-pipeline-red, CI pipeline red on main]
tools: [gitea_ci_runs, gitea_compare, deploy_history]
hypotheses:
  - The latest commit on main broke a test, build, or deploy job
  - A flaky job (not a real regression) failed transiently
  - The pipeline is red on infrastructure it depends on (runner down, registry unreachable), not on the code
---

# CI pipeline red on main

**Trigger:** `cicd-pipeline-red` — a pipeline run on `main` did not succeed
(test, build, or deploy job red) in the last 15 minutes.

## Diagnose

1. `gitea_ci_runs` (`branch=main`, `limit=5`) — find the red run and read its
   per-job status: which job failed (test, build, or deploy), and its
   `sha`.
2. `gitea_compare` the last GREEN run's sha against the red run's sha
   (`include_diff=true` if the span is small) — name the exact commit(s) and
   file(s) introduced since the last known-good run.
3. `deploy_history` — confirm whether the red run's revision ever actually
   deployed (a red build/test job never reaches deploy; a red deploy job
   means build succeeded but the rollout itself failed — different
   severity).
4. If the same job has failed on unrelated commits recently (check a couple
   more entries in `gitea_ci_runs`), treat it as a flaky-job lead, not a
   code regression — do not name an innocent commit as the cause.

## Mitigate

This runbook is diagnosis-and-escalation, not autonomous remediation: fixing
a broken pipeline means editing source (a job config, a failing test, or the
regression itself), which belongs to the auto-fixer/PR flow, not the on-call
agent's fixed tool surface.

1. Name the exact failing job, commit, and file in the postmortem so a human
   (or the auto-fixer, handed this as a follow-up) can act immediately.
2. If the failure is clearly a flaky job (transient network/runner blip, not
   a code issue): note it as such and do NOT recommend a revert.
3. If the failure is a genuine regression: recommend a revert of the named
   commit as the fastest safe path back to a shippable `main` — this is a
   recommendation in the postmortem, not a tool call this runbook's toolset
   can execute directly.

## Verify

- A subsequent `gitea_ci_runs` entry for `main` (after the fix or revert
  lands) shows `conclusion: success` on every job.
- `alert_status` reports `cicd-pipeline-red` resolved.
