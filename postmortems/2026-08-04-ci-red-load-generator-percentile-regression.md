# Postmortem: a pipeline run on main failed in the last 15m - main is not shippable (test, build, or deploy job red)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-08-04 14:16:30Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-08-04 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 13:44:42Z | k8s | Rollout/gateway: RolloutUpdated |
| 13:44:42Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 13:44:43Z | k8s | Pod/gateway-dd85945b4-pwg4s: Killing |
| 13:44:43Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulDelete |
| 13:44:43Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:44:43Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 13:44:44Z | k8s | ReplicaSet/gateway-865966ff97: SuccessfulCreate |
| 13:44:44Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:44:44Z | k8s | Pod/gateway-865966ff97-zhm57: Scheduled |
| 13:44:46Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:46Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:44:47Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:47Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:44:57Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:44:57Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:45:08Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:08Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:19Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:19Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:45:33Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:33Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:46Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:46Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:45:57Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:45:57Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:10Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:10Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:46:24Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:24Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:37Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:37Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:46:48Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:46:48Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:00Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:00Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:13Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:13Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:27Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:27Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:47:38Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:38Z | k8s | Pod/gateway-865966ff97-zhm57: Pulling |
| 13:47:49Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:47:49Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:03Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:03Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:16Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:16Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:31Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:48:31Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:44Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:48:56Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:10Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:21Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:35Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:49:48Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:49:48Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:54:47Z | k8s | Pod/gateway-865966ff97-zhm57: Failed |
| 13:54:47Z | k8s | Pod/gateway-865966ff97-zhm57: BackOff |
| 13:55:31Z | k8s | Rollout/gateway: SkipSteps |
| 13:55:31Z | k8s | Rollout/gateway: RolloutUpdated |
| 13:55:32Z | k8s | ReplicaSet/gateway-dd85945b4: SuccessfulCreate |
| 13:55:32Z | k8s | ReplicaSet/gateway-865966ff97: SuccessfulDelete |
| 13:55:32Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 13:55:32Z | k8s | Pod/gateway-dd85945b4-jfd54: Scheduled |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Started |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Pulled |
| 13:55:35Z | k8s | Pod/gateway-dd85945b4-jfd54: Created |
| 14:13:49Z | deploy:ci | CI run #112 failure on main: obs: load-generator: drop the defensive copy in percentile() |
| 14:15:42Z | log-spike | log-spike onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"8aba7105238d3c050fa501dfe78ddd88","span_id":"f4ada3a06f26a54d","time":"2026-08-04T14:15:42.943Z","reason":"The operation timed out.","job":"… |
| 14:16:00Z | alert | alert firing: CI pipeline red on main |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785852990241%22%2C+%22to%22%3A+%221785853128057%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221785852990241%22%2C+%22to%22%3A+%221785853128057%22%7D%7D%7D&orgId=1)

## Investigation context

**Runbook match (1):** `ci-pipeline-red.md` — toolset narrowed to 9 tools: alert_status, deploy_history, gitea_ci_runs, gitea_compare, publish_postmortem, request_approval, runbook_lookup, runbook_read, save_artifact

<details>
<summary>Pre-check battery (as injected at run start)</summary>

## Pre-check leads

### recent_deploys — LEAD
No deploy in the last 60m — rule out the reflex answer.
- No deploy in the last 60m — rule out the reflex answer.

### log_spike — LEAD
error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"8aba7105238d3c050fa501dfe78ddd88","span_id":"f4ada3a06f26a54d","time":"2026-08-04T14:15:42.943Z","reason":"The operation timed out.","job":"rag.retrieve","eventType":"START"} at 2026-08-04T14:15:42.943739+00:00
- error/failed log rate 200/10min vs baseline 0/10min (200x baseline) — onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"8aba7105238d3c050fa501dfe78d… (truncated)

### kube_scan — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

### rollout_state — UNAVAILABLE
gateway: E0804 16:16:30.861438   57760 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:16:30.973059   57760 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:16:31.057050   57760 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to; gateway analysis: E0804 16:16:30.868002   32464 memcache.go:265] "Unhandled Error" err="couldn't get current server API group list: the server has asked for the client to provide credentials"
E0804 16:16:30.962354   32464 memcache.go:265] "Unhandled Error"
… (section truncated)

### secret_age — UNAVAILABLE
error: You must be logged in to the server (Unauthorized)

</details>

## Narrative

## Summary
`CI pipeline red on main` (sev1) fired because CI run #112 on `main` failed its `test` job. The offending commit is `37227bca2e` — "load-generator: drop the defensive copy in percentile()" (apps/load-generator/src/stats.ts, +3/-1) — authored by Lab Dev.

## Impact
`main` is not shippable: the `test` job is red, so `build-push` was skipped and the change never reached deploy. No serving-path impact — this is a CI/test-gate incident only, confirmed via `deploy_history` (the only entry in the lookback window is the CI failure itself; no Argo/rollout activity).

## Root cause
Commit `37227bca2e` is a **repeat regression**, not a flaky job:
- Run #110 (sha `28686bc2ba`) introduced the identical change ("load-generator: drop the defensive copy in percentile()") and the `test` job failed.
- Run #111 (sha `d62500f603`) reverted that exact commit and the `test` job went green.
- Run #112 (sha `37227bca2e`) reapplied the same change verbatim, touching the same single file (`apps/load-generator/src/stats.ts`, +3/-1), and the `test` job failed again with the same signature.
- Every other commit in the surrounding window (#103, #105, #107, #108, #109) built and tested green — ruling out a flaky runner/registry, per the runbook's flaky-job check.

This is a deterministic test failure caused by removing the defensive copy in `percentile()` in the load-generator's stats module — the test suite depends on the input array not being mutated in place, and dropping the copy breaks that invariant.

## What fixed it
Nothing was executed by this on-call agent. The matched runbook (`ci-pipeline-red.md`) is diagnosis-and-escalation only for this alert class — fixing a red pipeline means editing source (reverting the regression or fixing the test), which is outside this runbook's fixed tool surface and belongs to the auto-fixer/PR flow. No dry-run-able remediation tool was available or applicable, so none was attempted. `alert_status` was re-checked after diagnosis and still reports active, consistent with no fix having been applied.

**Recommendation for the auto-fixer/human follow-up:** revert commit `37227bca2e` on `main` (mirrors the same safe path already proven to work once, in run #111) — this is the fastest way back to a shippable `main`. Do not re-attempt the same "drop the defensive copy" change without first fixing whatever test asserts non-mutation of the input in `percentile()`.

## Lessons
- The same regression was reintroduced after already having been reverted once — the revert commit message ("Revert \"load-generator: drop the defensive copy in percentile()\"") should have been a strong enough signal to block a verbatim reapply without addressing the underlying test failure first.
- `ci-pipeline-red.md`'s diagnose steps (compare last-green vs red sha, check for repeats on unrelated commits) were sufficient to distinguish a genuine regression from flakiness in a few tool calls — worth keeping this runbook read-only/escalation-only given it correctly stops short of an agent auto-reverting source on `main`.

```mermaid
flowchart LR
    Dev[Commit 37227bca2e<br/>drop defensive copy in percentile()] --> CI[Gitea CI: main]
    CI --> Changes[changes job: success]
    Changes --> Test[test job]
    Test -->|FAILED - regression reintroduced| Build[build-push job: skipped]
    Build -.->|never reached| Gitops[obs-gitops bump commit]
    Gitops -.-> Argo[Argo CD sync]
    Argo -.-> Rollout[Argo Rollout canary]
    Rollout -.-> Prod[Production traffic]

    style Test fill:#f85149,stroke:#f85149,color:#fff
    style Build fill:#555,stroke:#888,color:#ccc,stroke-dasharray: 4 2
    style Gitops fill:#333,stroke:#666,color:#888,stroke-dasharray: 4 2
    style Argo fill:#333,stroke:#666,color:#888,stroke-dasharray: 4 2
    style Rollout fill:#333,stroke:#666,color:#888,stroke-dasharray: 4 2
    style Prod fill:#333,stroke:#666,color:#888,stroke-dasharray: 4 2
```

The break is at the `test` job hop in CI — everything downstream (gitops bump, Argo sync, rollout, prod traffic) never executes because `build-push` is gated on `test` passing.
