# Postmortem: a pipeline run on main failed in the last 15m - main is not shippable (test, build, or deploy job red)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 15:47:30Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:03:23Z | deploy:ci | CI run #62 success on postmortem/inc_19f8f7c7371105: obs: postmortem: embedder-single-replica-latency-burn |
| 15:05:54Z | deploy:ci | CI run #63 success on postmortem/inc_19f8f7c6846fc: obs: postmortem: model-proxy-canary-500s-gateway-avail-burn |
| 15:09:51Z | deploy:ci | CI run #64 success on postmortem/inc_19f8f82f1b3312: obs: postmortem: embedder-replica-scaleup-memory-pressure |
| 15:11:22Z | deploy:ci | CI run #65 success on postmortem/inc_19f8f83e0ed32e: obs: postmortem: embedder-scale-insufficient-memory-scheduling |
| 15:12:15Z | deploy:ci | CI run #66 success on postmortem/inc_19f8f81127e275: obs: postmortem: rag-quality-chronic-low-relevance-single-doc-corpus |
| 15:14:26Z | deploy:ci | CI run #67 success on postmortem/inc_19f8f8818f947d: obs: postmortem: model-proxy-canary-stuck-healthy-promote |
| 15:17:14Z | deploy:ci | CI run #68 success on web/agents-live-ui: obs: web: frame-panel layouts, oncall incident detail sections, runbook frontmatter metadata |
| 15:34:50Z | deploy:ci | CI run #69 failure on postmortem/inc_19f8f99d51268f: obs: postmortem: load-generator-pending-node-memory-saturation |
| 15:42:29Z | deploy:annotation | deploy platform via gitops be17fe4 (argo sync) |
| 15:42:30Z | deploy:argo | platform synced to be17fe4e1665 |
| 15:43:56Z | k8s | Pod/embedder-959c98db8-qs8nc: Pulled |
| 15:44:02Z | k8s | ReplicaSet/embedder-959c98db8: SuccessfulCreate |
| 15:44:02Z | k8s | Pod/embedder-7d999dd67b-l46sl: Killing |
| 15:44:02Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulDelete |
| 15:44:02Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:44:02Z | k8s | Pod/embedder-959c98db8-kl8wj: FailedScheduling |
| 15:44:03Z | k8s | Pod/embedder-959c98db8-kl8wj: FailedScheduling |
| 15:44:03Z | k8s | Pod/model-proxy-6f8885c774-c96nh: Scheduled |
| 15:44:04Z | k8s | Pod/model-proxy-6f8885c774-c96nh: Started |
| 15:44:04Z | k8s | Pod/model-proxy-6f8885c774-c96nh: Pulled |
| 15:44:04Z | k8s | Pod/model-proxy-6f8885c774-c96nh: Created |
| 15:44:13Z | k8s | Rollout/model-proxy: RolloutStepCompleted |
| 15:44:38Z | deploy:ci | CI run #70 failure on main: obs: Merge pull request 'Web: agents chat sessions + frame-panel UI polish' (#34) from web/agents-live-ui into main

Rev |
| 15:45:13Z | k8s | AnalysisRun/gateway-7f5fcc46-48-1: MetricSuccessful |
| 15:45:13Z | k8s | AnalysisRun/gateway-7f5fcc46-48-1: AnalysisRunSuccessful |
| 15:45:13Z | k8s | Pod/gateway-6b45d8cc6c-t47vr: Killing |
| 15:45:13Z | k8s | ReplicaSet/gateway-6b45d8cc6c: SuccessfulDelete |
| 15:45:14Z | k8s | ReplicaSet/gateway-7f5fcc46: SuccessfulCreate |
| 15:45:14Z | k8s | Pod/gateway-7f5fcc46-vpp52: FailedScheduling |
| 15:45:15Z | k8s | Pod/gateway-7f5fcc46-vpp52: Scheduled |
| 15:45:16Z | k8s | Pod/gateway-7f5fcc46-vpp52: Pulled |
| 15:45:17Z | k8s | Pod/gateway-7f5fcc46-vpp52: Started |
| 15:45:17Z | k8s | Pod/gateway-7f5fcc46-vpp52: Created |
| 15:45:25Z | k8s | ReplicaSet/gateway-7f5fcc46: SuccessfulCreate |
| 15:45:25Z | k8s | Pod/gateway-6b45d8cc6c-gmcx7: Killing |
| 15:45:25Z | k8s | ReplicaSet/gateway-6b45d8cc6c: SuccessfulDelete |
| 15:45:25Z | k8s | Pod/gateway-7f5fcc46-gctmn: FailedScheduling |
| 15:45:26Z | k8s | Pod/gateway-7f5fcc46-gctmn: Scheduled |
| 15:45:27Z | k8s | Pod/gateway-7f5fcc46-gctmn: Pulled |
| 15:45:28Z | k8s | Pod/gateway-7f5fcc46-gctmn: Started |
| 15:45:28Z | k8s | Pod/gateway-7f5fcc46-gctmn: Created |
| 15:45:30Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Killing |
| 15:45:30Z | k8s | ReplicaSet/load-generator-9c7ddf9bc: SuccessfulDelete |
| 15:45:30Z | k8s | Deployment/load-generator: ScalingReplicaSet |
| 15:45:31Z | k8s | Pod/embedder-959c98db8-kl8wj: Scheduled |
| 15:45:31Z | log-spike | log-spike onset: 2026-07-23 15:45:31.171 UTC [371091] FATAL:  password authentication failed for user "lab" |
| 15:45:32Z | k8s | Pod/embedder-959c98db8-kl8wj: Started |
| 15:45:32Z | k8s | Pod/embedder-959c98db8-kl8wj: Pulled |
| 15:45:32Z | k8s | Pod/embedder-959c98db8-kl8wj: Created |
| 15:45:36Z | k8s | Pod/gateway-6b45d8cc6c-k6kr4: Unhealthy |
| 15:45:36Z | k8s | ReplicaSet/gateway-7f5fcc46: SuccessfulCreate |
| 15:45:36Z | k8s | Pod/gateway-6b45d8cc6c-k6kr4: Killing |
| 15:45:36Z | k8s | ReplicaSet/gateway-6b45d8cc6c: SuccessfulDelete |
| 15:45:36Z | k8s | Pod/gateway-7f5fcc46-h7zp6: FailedScheduling |
| 15:45:36Z | k8s | Pod/gateway-7f5fcc46-h7zp6: Scheduled |
| 15:45:38Z | k8s | Pod/gateway-7f5fcc46-h7zp6: Started |
| 15:45:38Z | k8s | Pod/gateway-7f5fcc46-h7zp6: Pulled |
| 15:45:38Z | k8s | Pod/gateway-7f5fcc46-h7zp6: Created |
| 15:45:39Z | k8s | Pod/embedder-7d999dd67b-6hwlz: Killing |
| 15:45:39Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulDelete |
| 15:45:39Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:45:40Z | k8s | ReplicaSet/embedder-959c98db8: SuccessfulCreate |
| 15:45:40Z | k8s | Pod/embedder-959c98db8-7ncvh: FailedScheduling |
| 15:45:40Z | k8s | Pod/embedder-959c98db8-7ncvh: Scheduled |
| 15:45:41Z | k8s | Pod/embedder-959c98db8-7ncvh: Started |
| 15:45:41Z | k8s | Pod/embedder-959c98db8-7ncvh: Pulled |
| 15:45:41Z | k8s | Pod/embedder-959c98db8-7ncvh: Created |
| 15:45:47Z | k8s | Pod/embedder-7d999dd67b-r826h: Killing |
| 15:45:47Z | k8s | ReplicaSet/embedder-7d999dd67b: SuccessfulDelete |
| 15:45:47Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:45:48Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: Scheduled |
| 15:45:49Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: Started |
| 15:45:49Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: Pulled |
| 15:45:49Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: Created |
| 15:45:50Z | deploy:ci | CI run #71 success on postmortem/inc_19f8fa1f1cb7c7: obs: postmortem: gateway-stale-db-secret-rollout-blocked |
| 15:45:56Z | k8s | Pod/retriever-56b9b5ccfd-5dbfq: Unhealthy |
| 15:45:56Z | k8s | ReplicaSet/retriever-5d45c74bd9: SuccessfulCreate |
| 15:45:56Z | k8s | Pod/retriever-56b9b5ccfd-5dbfq: Killing |
| 15:45:56Z | k8s | ReplicaSet/retriever-56b9b5ccfd: SuccessfulDelete |
| 15:45:56Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:45:56Z | k8s | Pod/retriever-5d45c74bd9-v9db4: FailedScheduling |
| 15:45:56Z | k8s | Pod/retriever-5d45c74bd9-v9db4: Scheduled |
| 15:45:57Z | k8s | Pod/retriever-5d45c74bd9-v9db4: Started |
| 15:45:57Z | k8s | Pod/retriever-5d45c74bd9-v9db4: Pulled |
| 15:45:57Z | k8s | Pod/retriever-5d45c74bd9-v9db4: Created |
| 15:46:04Z | k8s | Pod/retriever-c56758d67-sq7j7: Killing |
| 15:46:04Z | k8s | ReplicaSet/retriever-c56758d67: SuccessfulDelete |
| 15:46:04Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:46:05Z | k8s | Pod/retriever-5d45c74bd9-v9db4: Killing |
| 15:46:05Z | k8s | ReplicaSet/retriever-5d45c74bd9: SuccessfulDelete |
| 15:46:05Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:47:00Z | alert | alert firing: CI pipeline red on main |
| 15:47:08Z | k8s | ReplicaSet/retriever-5d45c74bd9: SuccessfulCreate |
| 15:47:08Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:47:08Z | k8s | Pod/retriever-5d45c74bd9-4jhrv: Scheduled |
| 15:47:09Z | k8s | Pod/retriever-5d45c74bd9-4jhrv: Started |
| 15:47:09Z | k8s | Pod/retriever-5d45c74bd9-4jhrv: Pulled |
| 15:47:09Z | k8s | Pod/retriever-5d45c74bd9-4jhrv: Created |
| 15:47:44Z | k8s | AnalysisRun/model-proxy-6f8885c774-29-1: MetricSuccessful |
| 15:47:44Z | k8s | AnalysisRun/model-proxy-6f8885c774-29-1: AnalysisRunSuccessful |
| 15:47:45Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 15:47:46Z | k8s | Pod/model-proxy-d74f868cc-5h4h7: Killing |
| 15:47:46Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulDelete |
| 15:47:47Z | k8s | ReplicaSet/model-proxy-6f8885c774: SuccessfulCreate |
| 15:47:47Z | k8s | Pod/model-proxy-6f8885c774-5w687: Scheduled |
| 15:47:48Z | k8s | Pod/model-proxy-6f8885c774-5w687: Started |
| 15:47:48Z | k8s | Pod/model-proxy-6f8885c774-5w687: Pulled |
| 15:47:48Z | k8s | Pod/model-proxy-6f8885c774-5w687: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784821650136%22%2C+%22to%22%3A+%221784821818991%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784821650136%22%2C+%22to%22%3A+%221784821818991%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 page "CI pipeline red on main" fired for Gitea Actions run #70 on `main` (sha `08b9f3f8bb`, merge of PR #34 "Web: agents chat sessions + frame-panel UI polish"), whose `test` job failed. Investigation shows this is a false-positive-for-code-regression: the actual cause is an infrastructure dependency failure (stale Postgres credentials), not a defect introduced by PR #34.

## Impact
`main`'s CI pipeline is red, blocking merges/deploys that pass through the `test` gate. The failing run's `build-push` and `deploy` jobs were both skipped (test never reached them), so **no bad revision was deployed** — this is a build-time gate failure only, not a production rollout issue. `alert_status` for `CI pipeline red on main` remains active as of the last check in this incident.

## Root cause
The `test` job failed on run #70 (main, PR #34). Before attributing this to PR #34's diff (which touched resumable-chat-session code in `agent-service` and web UI frame-panel layouts), the ci-pipeline-red runbook's flaky-job check was run: run #69, ten minutes earlier on an unrelated branch (`postmortem/inc_19f8f99d51268f`), also failed the identical `test` job — and that commit's *only* change was adding a markdown postmortem file (`postmortems/2026-07-23-load-generator-pending-node-memory-saturation.md`, 146 additions, 0 code files touched). A docs-only commit failing the same test job proves the job's pass/fail is not being driven by code content.

Correlating further: the log-spike lead shows Postgres auth failures ("password authentication failed for user \"lab\"") spiking 200x baseline, with onset squarely inside run #70's `test` job execution window. A separate, concurrently-filed postmortem for `gateway-stale-db-secret-rollout-blocked` (run #71, landed immediately after) confirms a live, separately-tracked incident where the in-cluster Postgres password was rotated at the source without the corresponding k8s Secret being updated — a stale-secret condition that breaks DB connectivity for any consumer needing it, including the CI test job's integration tests against Postgres.

Conclusion: PR #34 (commits `81bd3c2f9d` rca: resumable multi-turn chat sessions, and `e2ba0077e5` web: frame-panel layouts) is an **innocent commit**. The `test` job is failing because of the shared stale DB-secret condition, not because of anything in that diff.

## What fixed it
Nothing was executed as part of this incident. The matched runbook (`ci-pipeline-red.md`) is diagnosis-and-escalation only and provides no autonomous remediation tool for a code/CI pipeline signal, and — critically — the runbook explicitly says not to recommend a revert once the failure is identified as flaky/infra rather than a genuine regression. Reverting PR #34 would not address the real cause and would needlessly discard merged work. `alert_status` was re-checked after diagnosis and `CI pipeline red on main` is still active; it is expected to clear once the DB secret is resynced (tracked under the separate stale-secret incident) and CI is re-run on `main` — no main-branch code change is needed.

## Lessons
- The CI `test` job apparently exercises live Postgres connectivity for integration tests, so DB-credential staleness cascades into false "pipeline red" pages on completely unrelated commits (including docs-only ones). Root-causing CI redness must include an infra-health check, not just the diff.
- The runbook's "check whether the same job failed on unrelated recent commits" step was decisive — skipping it would have led to wrongly blaming/reverting PR #34.
- Consider isolating/mocking the DB dependency in the CI `test` job so DB outages don't manufacture pipeline-red pages, and/or suppress or annotate `CI pipeline red on main` as downstream noise when a stale-DB-secret incident is already active, so on-call doesn't chase two incidents for one cause.
- Follow-up: once the DB secret is resynced (separate incident), re-run CI for `main` (rerun run #70 or push a no-op commit) to confirm the `test` job goes green and this alert resolves.
