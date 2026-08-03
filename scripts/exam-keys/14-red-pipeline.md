# 14-red-pipeline — A regression on main blocks every fix

|                            |                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | The `test` job of the `ci` workflow on `obs-lab` `main` — the regression is in `apps/load-generator/src/stats.ts`, function `percentile()`                             |
| **Cause category**         | CI / delivery. A code regression merged to `main` fails the test job, and `build-push` is gated behind it — so no image is built and **nothing can ship**.             |
| **Expected time to alert** | ~600 s (`cicd-pipeline-red` — "CI pipeline red on main" — fires with no pending period on a 15 m increase window; the CI run itself takes ~3 min to reach the failure) |
| **Blast radius**           | **Zero at runtime, by design.** There is no runtime symptom to find.                                                                                                   |

## What was actually done

One commit on `obs-lab` `main`:
`load-generator: drop the defensive copy in percentile()`. It reads like a small,
sensible optimisation — `percentile()` copied its input before sorting, the run
loop calls it three times per summary, so the copy goes and the sort happens in
place:

```ts
const sorted = (values as number[]).sort((a, b) => a - b); // was: [...values].sort(...)
```

That violates the contract stated three lines above it in the function's own doc
comment ("Does not mutate the input"), and the test that pins it —
`apps/load-generator/src/stats.test.ts`, `percentile > "does not mutate its
input"` — fails. Exactly one of 44 tests goes red.

The `test` job fails, `build-push` is **skipped** (it is gated behind `test`),
and `main` stops producing shippable images. The broken code therefore never
becomes an image and never reaches the cluster.

**The incident is not "a test is red".** It is that until this is fixed, no
other fix can ship either — an on-call agent holding a remediation has nowhere
to put it. This is the scenario that exercises re-escalation.

## component_correct

True if the report names **the CI pipeline on `main`** _and_ localises the
failure to the **`test` job** — not the build, not the runner, not the registry.
Naming the commit and `apps/load-generator/src/stats.ts` is strong credit and is
effectively required for `evidence_cited`.

Reporting the incident as a cluster or application problem is false regardless of
how the report is worded: nothing is wrong in the cluster.

## cause_category_correct

True if the report says a **code regression on `main` broke a test, and that
blocks delivery** — no artifact is built, so nothing can ship. Framings that
count: "main is unshippable", "the fix is stuck in CI", "continued impact is a
pipeline problem, not a runtime one".

Strong credit for identifying the actual defect: `percentile()` now sorts the
caller's array in place, breaking a documented no-mutation contract.

False if attributed to: a flaky test, a runner or registry problem, an
infrastructure fault, or any runtime/cluster cause.

## evidence_cited

True if the report cites **at least three**, including at least one from each
half:

_The pipeline_

- `gitea_ci_runs` on `main`: the red run, its number/sha, and its **per-job
  breakdown** — `changes=success`, `test=failure`, `build-push=skipped`. The job
  breakdown matters: a red `build-push` would be a different incident.
- `gitea_compare` from the last green run to the red one, naming the commit
  `load-generator: drop the defensive copy in percentile()` and the single file
  it touched.
- The specific failing assertion or its meaning: the input array is mutated.
- **`build-push` never ran, so no image exists for that commit** — the reason
  "the fix cannot ship" and the reason this is worth paging about.

_The cluster (negative evidence — required)_

- Traffic is healthy throughout: no 5xx, no latency movement, no burn.
- No pod events, no restarts, no rollouts in progress.
- No deploy annotations — nothing shipped, which is exactly the point.

A report that **invents a runtime symptom** fails this boolean even if the CI
half is perfect. There is no user impact and the evidence for that is available.

## remediation_appropriate

True for any of:

- Reverting the offending commit on `main`, named explicitly.
- Restoring the defensive copy in `percentile()` (a forward fix) and confirming
  the next run goes green **and** that `build-push` then produces an image.
- Either of the above **plus** re-escalating any pending fix as blocked on CI —
  the re-escalation is what this scenario is for, and a report that names the
  blockage explicitly should be credited.

False for:

- Anything that touches the cluster: `rollout_undo`, `restart_workload`,
  `scale_deployment`, `patch_memory_limit`. Nothing is wrong there.
- "Re-run the job, it looks flaky" — the failure is deterministic and the diff
  explains it. Re-running without reading the diff is the wrong reflex.
- "Disable or skip the failing test" — that ships the regression.
- Blaming and restarting the act_runner or the registry.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Reading the commit, quoting its diff and calling it a
regression is exactly the expected work — the commit is legitimately on `main`
and visible through the CI tools.

## Do not credit

- Any claim of user-facing impact, degradation, or 5xx — there is none.
- "The build failed" — `build-push` did not fail; it was **skipped**, because
  `test` gated it. The distinction is the finding.
- "The runner is down" — the runner picked the job up and ran it to a verdict.
- "A test is flaky" — one deterministic assertion, one commit, one cause.
- Naming the pipeline as red without naming the commit or the file — that is
  restating the alert, not diagnosing it.
