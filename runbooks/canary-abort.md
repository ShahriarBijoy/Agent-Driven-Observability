---
alert_types: [rollout-stuck, Rollout stuck (progressing too long / replicas short), on-rollout-aborted, on-analysis-run-failed]
tools: [rollout_status, analysisrun_get, deploy_history, gitea_compare, rollout_abort, rollout_promote, rollout_undo]
hypotheses:
  - The canary's AnalysisRun failed a real metric threshold (error-rate/latency regression in the new revision)
  - The canary never became Ready (crash/config issue) so the analysis never got real traffic to measure
  - The rollout is legitimately still progressing and the alert fired on a slow-but-healthy step
---

# GitOps canary aborted / analysis failed / rollout stuck

**Trigger:** `rollout-stuck` (Progressing past its 12m budget or short on
ready replicas), or a gitops-reporter `on-rollout-aborted` /
`on-analysis-run-failed` event from Argo Rollouts.

## Diagnose

1. `rollout_status` for the affected rollout — phase, `aborted` flag,
   current step position, and the stable vs canary pod-template hashes.
2. `analysisrun_get` (pass `rollout=<name>` for the newest runs) — QUOTE the
   failing measurement verbatim: metric name, phase, and the actual value
   the promotion decision saw. A failed AnalysisRun with real measurements
   over threshold is a genuine regression; an AnalysisRun stuck
   `Inconclusive` with no measurements means the canary never got traffic
   (a readiness problem, not a quality regression).
3. `deploy_history` for the app — name the revision the canary hash
   corresponds to and when it was promoted to canary.
4. `gitea_compare` the stable revision's sha against the canary revision's
   sha (`include_diff=true` for a small span) — name the exact commit and
   file behind a real metric regression.

## Mitigate

1. If the AnalysisRun genuinely failed on a metric regression: `rollout_abort`
   (if not already aborted by Argo Rollouts itself) to stop the canary from
   receiving more traffic, then `rollout_undo` to the last stable revision —
   **requires approval**. Put the failing measurement and the suspect commit
   in the `request_approval` summary.
2. If the canary never became healthy for reasons unrelated to the change
   under test (e.g. a flaky readiness probe, a transient dependency outage
   during the analysis window) and the diff itself looks safe: `rollout_promote`
   to retry forward — **requires approval** — rather than reflexively
   rolling back a good change.
3. If the rollout is simply still progressing past a slow-but-healthy step
   (no failed AnalysisRun, replicas catching up): no mutation needed — report
   this as expected-but-slow rather than remediating a healthy rollout.

## Verify

- `rollout_status` shows `phase: Healthy` (post-undo: on the stable
  revision; post-promote: on the new revision) with replicas matching
  desired.
- `analysisrun_get` for any subsequent run shows measurements within
  threshold.
- `alert_status` reports the alert resolved.
