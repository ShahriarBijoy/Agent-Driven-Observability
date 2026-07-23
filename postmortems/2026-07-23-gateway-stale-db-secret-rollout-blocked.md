# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-23 15:39:42Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-23 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 15:01:54Z | deploy:ci | CI run #61 success on postmortem/inc_19f8f77c9a81d: obs: postmortem: model-proxy-upstream-timeout-5xx |
| 15:03:23Z | deploy:ci | CI run #62 success on postmortem/inc_19f8f7c7371105: obs: postmortem: embedder-single-replica-latency-burn |
| 15:05:54Z | deploy:ci | CI run #63 success on postmortem/inc_19f8f7c6846fc: obs: postmortem: model-proxy-canary-500s-gateway-avail-burn |
| 15:09:51Z | deploy:ci | CI run #64 success on postmortem/inc_19f8f82f1b3312: obs: postmortem: embedder-replica-scaleup-memory-pressure |
| 15:11:22Z | deploy:ci | CI run #65 success on postmortem/inc_19f8f83e0ed32e: obs: postmortem: embedder-scale-insufficient-memory-scheduling |
| 15:12:15Z | deploy:ci | CI run #66 success on postmortem/inc_19f8f81127e275: obs: postmortem: rag-quality-chronic-low-relevance-single-doc-corpus |
| 15:14:26Z | deploy:ci | CI run #67 success on postmortem/inc_19f8f8818f947d: obs: postmortem: model-proxy-canary-stuck-healthy-promote |
| 15:17:14Z | deploy:ci | CI run #68 success on web/agents-live-ui: obs: web: frame-panel layouts, oncall incident detail sections, runbook frontmatter metadata |
| 15:34:50Z | deploy:ci | CI run #69 failure on postmortem/inc_19f8f99d51268f: obs: postmortem: load-generator-pending-node-memory-saturation |
| 15:39:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 15:39:42Z | log-spike | log-spike onset:       at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22) |
| 15:41:01Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8fa1f1e57c9) |
| 15:41:22Z | remediation | restart_workload gateway executed (run run_19f8fa1f1e57c9) |
| 15:41:23Z | remediation | restart_workload retriever executed (run run_19f8fa1f1e57c9) |
| 15:42:29Z | deploy:annotation | deploy platform via gitops be17fe4 (argo sync) |
| 15:42:30Z | deploy:argo | platform synced to be17fe4e1665 |
| 15:43:39Z | k8s | Pod/gateway-6c4c695668-hwmbf: FailedScheduling |
| 15:43:39Z | k8s | Pod/retriever-68c9fc5868-j2qjb: Scheduled |
| 15:43:40Z | k8s | Pod/retriever-68c9fc5868-j2qjb: Started |
| 15:43:40Z | k8s | Pod/retriever-68c9fc5868-j2qjb: Pulled |
| 15:43:40Z | k8s | Pod/retriever-68c9fc5868-j2qjb: Created |
| 15:43:44Z | k8s | Pod/retriever-68c9fc5868-j2qjb: Killing |
| 15:43:44Z | k8s | ReplicaSet/retriever-68c9fc5868: SuccessfulDelete |
| 15:43:44Z | k8s | ReplicaSet/retriever-5d45c74bd9: SuccessfulCreate |
| 15:43:44Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:43:44Z | k8s | Rollout/model-proxy: RolloutUpdated |
| 15:43:44Z | k8s | Rollout/model-proxy: RolloutNotCompleted |
| 15:43:44Z | k8s | Rollout/model-proxy: NewReplicaSetCreated |
| 15:43:44Z | k8s | ReplicaSet/gateway-6c4c695668: SuccessfulDelete |
| 15:43:44Z | k8s | Pod/retriever-5d45c74bd9-ghzld: FailedScheduling |
| 15:43:44Z | k8s | Pod/retriever-5d45c74bd9-ghzld: Scheduled |
| 15:43:45Z | k8s | Pod/retriever-5d45c74bd9-ghzld: Started |
| 15:43:45Z | k8s | Pod/retriever-5d45c74bd9-ghzld: Pulled |
| 15:43:45Z | k8s | Pod/retriever-5d45c74bd9-ghzld: Created |
| 15:43:45Z | k8s | Pod/model-proxy-d74f868cc-bx54b: Killing |
| 15:43:45Z | k8s | ReplicaSet/model-proxy-d74f868cc: SuccessfulDelete |
| 15:43:45Z | k8s | ReplicaSet/model-proxy-6f8885c774: SuccessfulCreate |
| 15:43:45Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 15:43:45Z | k8s | ReplicaSet/gateway-7f5fcc46: SuccessfulCreate |
| 15:43:45Z | k8s | ReplicaSet/embedder-959c98db8: SuccessfulCreate |
| 15:43:45Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 15:43:45Z | k8s | Pod/gateway-7f5fcc46-6pzrw: FailedScheduling |
| 15:43:45Z | k8s | Pod/embedder-959c98db8-qs8nc: FailedScheduling |
| 15:43:45Z | k8s | Pod/model-proxy-6f8885c774-c96nh: FailedScheduling |
| 15:43:46Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Started |
| 15:43:46Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Pulled |
| 15:43:46Z | k8s | Pod/load-generator-9c7ddf9bc-spflm: Created |
| 15:43:46Z | k8s | Pod/embedder-959c98db8-qs8nc: FailedScheduling |
| 15:43:46Z | k8s | Pod/model-proxy-6f8885c774-c96nh: FailedScheduling |
| 15:43:46Z | k8s | Pod/gateway-7f5fcc46-6pzrw: Scheduled |
| 15:43:47Z | k8s | Pod/gateway-7f5fcc46-6pzrw: Started |
| 15:43:47Z | k8s | Pod/gateway-7f5fcc46-6pzrw: Pulled |
| 15:43:47Z | k8s | Pod/gateway-7f5fcc46-6pzrw: Created |
| 15:43:54Z | k8s | Pod/retriever-8665c87798-b9ft8: Killing |
| 15:43:54Z | k8s | ReplicaSet/retriever-8665c87798: SuccessfulDelete |
| 15:43:54Z | k8s | ReplicaSet/retriever-5d45c74bd9: SuccessfulCreate |
| 15:43:54Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 15:43:54Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: FailedScheduling |
| 15:43:55Z | k8s | Pod/retriever-5d45c74bd9-zlrb8: FailedScheduling |
| 15:43:55Z | k8s | Pod/embedder-959c98db8-qs8nc: Scheduled |
| 15:43:56Z | k8s | Pod/embedder-959c98db8-qs8nc: Started |
| 15:43:56Z | k8s | Pod/embedder-959c98db8-qs8nc: Pulled |
| 15:43:56Z | k8s | Pod/embedder-959c98db8-qs8nc: Created |
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
| 15:44:38Z | deploy:ci | CI run #70 in_progress on main: obs: Merge pull request 'Web: agents chat sessions + frame-panel UI polish' (#34) from web/agents-live-ui into main

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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784821182926%22%2C+%22to%22%3A+%221784821538373%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784821182926%22%2C+%22to%22%3A+%221784821538373%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 page: "SLO gateway availability — fast burn" (2% of 28d error budget burned in 1h). Root cause was a rotated Postgres credential that never made it into the in-cluster `subject-db-credentials` Secret, so running gateway/retriever pods kept authenticating with the old password. Remediation (secret sync + rolling restarts) was correctly identified, approved, and executed, but full recovery is blocked by a separate cluster memory-capacity ceiling preventing the rollout from completing — **the alert had not cleared as of the end of this response and is being handed off still active**.

## Impact
Gateway-dependent requests touching the DB path (via `retriever`) began failing with 5xx as Postgres rejected connections from the app tier. The gateway Argo Rollout's canary analysis (`canary-error-rate`) also errored out from consecutive request failures caused by the same underlying auth issue, stalling that rollout at step 1/4 independent of our fix.

## Root cause
`postgres` and `retriever` logs showed a sudden, sustained spike of `FATAL: password authentication failed for user "lab"` starting right at alert onset, with zero occurrences before. The gateway/model-proxy pods currently running were all from a gitops deploy (revision `be17fe4e1665`) roughly two hours prior to onset — well outside the incident window — so a fresh bad deploy was ruled out per the `gateway-high-error-rate` runbook. That left the `stale-secret` runbook's hypothesis: the DB password had been rotated at the vault/database layer without the in-cluster Secret being updated, so already-running pods (started before the rotation) kept presenting the old credential. `update_db_secret`'s dry-run confirmed a vault-side rotated credential (`POSTGRES_PASSWORD` hash mismatch) sitting unsynced, matching the signature exactly.

## What fixed it
1. Dry-ran and, after operator approval, executed `update_db_secret` to sync the rotated credential from the vault into `secret/subject-db-credentials`.
2. Dry-ran and, after operator approval, rolling-restarted `gateway` and `retriever` so pods would pick up the refreshed credential (a Secret update alone does not affect already-running pods' environment).
3. Verified newly-created pods (post-restart ReplicaSet generations) emitted zero auth-failure log lines, confirming the credential fix itself was correct.

However, the rolling restarts could only replace pods as fast as the cluster could schedule new ones. Repeated `kubectl describe` on a stuck `Pending` retriever pod showed `FailedScheduling: 0/3 nodes are available: 1 node(s) had untolerated taint(s), 2 Insufficient memory` — a pre-existing resource-pressure condition on both worker nodes (corroborated by the pre-check `kube_scan` lead, which already showed a `Pending` retriever pod and a `BackoffLimitExceeded` seed Job before this response began). As a result, one stale-credential retriever pod and all three stale-credential gateway pods were still running and still serving traffic at the end of this response, continuing to throw auth failures and keeping the SLO burn-rate alert active. Scaling down other workloads or raising memory limits to relieve this pressure was outside the tool scope granted for this incident (narrowed to the two matched runbooks, neither of which covers cluster capacity remediation).

## Lessons
- The stale-secret/rotation-vs-restart diagnosis and fix were correct and should be the standing playbook for this alert signature (mass single-user Postgres auth failures with no proximate deploy).
- A credential-rotation fix is only as fast as the cluster can reschedule pods; when node memory is already tight, a "restart to pick up the new secret" remediation can stall indefinitely without a companion capacity fix (scale down non-critical workloads, raise limits, or add capacity) — worth adding as an explicit follow-up step in the stale-secret runbook.
- Consider giving the on-call agent scale/memory-limit tools (or an explicit escalation path) when a credential-rotation remediation is blocked purely on scheduling, so recovery isn't left half-applied.
- Recommend investigating why cluster memory was already under pressure independent of this incident (multiple extra replicas observed across model-proxy/embedder, a stuck `seed` Job) as a separate follow-up.
