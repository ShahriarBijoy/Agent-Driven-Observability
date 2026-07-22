# Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:33:45Z
- **Resolved:** 2026-07-22 22:36:27Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:32:25Z | deploy:argo | retriever synced to b9129b035938 |
| 22:32:25Z | log-spike | log-spike onset:       at ErrorResponse (/app/node_modules/.bun/postgres@3.4.9/node_modules/postgres/src/connection.js:817:22) |
| 22:32:27Z | deploy:annotation | deploy load-generator via gitops b9129b0 (argo sync) |
| 22:32:27Z | deploy:argo | embedder synced to b9129b035938 |
| 22:32:28Z | deploy:argo | gateway synced to b9129b035938 |
| 22:32:28Z | deploy:argo | model-proxy synced to b9129b035938 |
| 22:32:34Z | deploy:annotation | deploy retriever via gitops b9129b0 (argo sync) |
| 22:32:35Z | deploy:annotation | deploy embedder via gitops b9129b0 (argo sync) |
| 22:32:39Z | deploy:annotation | deploy load-generator :7b0af1e (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/34">ci #34</a>) |
| 22:32:39Z | deploy:annotation | deploy retriever :7b0af1e (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/34">ci #34</a>) |
| 22:32:39Z | deploy:annotation | deploy gateway :7b0af1e (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/34">ci #34</a>) |
| 22:32:39Z | deploy:annotation | deploy embedder :7b0af1e (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/34">ci #34</a>) |
| 22:32:39Z | deploy:annotation | deploy model-proxy :7b0af1e (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/34">ci #34</a>) |
| 22:32:41Z | deploy:argo | embedder synced to 7e0f43228a11 |
| 22:32:41Z | deploy:argo | load-generator synced to 7e0f43228a11 |
| 22:32:42Z | deploy:argo | retriever synced to 7e0f43228a11 |
| 22:32:43Z | deploy:annotation | deploy load-generator via gitops 7e0f432 (argo sync) |
| 22:32:43Z | deploy:argo | gateway synced to 7e0f43228a11 |
| 22:32:43Z | deploy:argo | model-proxy synced to 7e0f43228a11 |
| 22:32:50Z | deploy:annotation | deploy embedder via gitops 7e0f432 (argo sync) |
| 22:32:52Z | deploy:annotation | deploy retriever via gitops 7e0f432 (argo sync) |
| 22:33:10Z | alert | alert firing: SLO gateway latency — fast burn |
| 22:37:35Z | deploy:ci | CI run #36 success on main: obs: Merge pull request 'Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h |
| 22:37:56Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8bf6a827b06) |
| 22:38:09Z | deploy:argo | platform synced to 7e0f43228a11 |
| 22:38:12Z | deploy:annotation | deploy platform via gitops 7e0f432 (argo sync) |
| 22:38:12Z | k8s | Pod/gateway-64f8cc978f-ktt25: Pulled |
| 22:38:14Z | k8s | Pod/retriever-68896d855f-xvj8k: Killing |
| 22:38:14Z | k8s | ReplicaSet/retriever-68896d855f: SuccessfulDelete |
| 22:38:14Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:38:33Z | deploy:annotation | deploy retriever :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy gateway :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy embedder :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy load-generator :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy model-proxy :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:35Z | deploy:argo | load-generator synced to 6867477263e1 |
| 22:38:35Z | remediation | restart_workload retriever executed (run run_19f8bf6a827b06) |
| 22:38:36Z | deploy:argo | embedder synced to 6867477263e1 |
| 22:38:36Z | deploy:argo | retriever synced to 6867477263e1 |
| 22:38:36Z | k8s | Pod/retriever-856d879b65-nzdcp: Pulling |
| 22:38:36Z | k8s | ReplicaSet/retriever-856d879b65: SuccessfulDelete |
| 22:38:36Z | k8s | ReplicaSet/retriever-856d879b65: SuccessfulCreate |
| 22:38:36Z | k8s | ReplicaSet/retriever-797b99c974: SuccessfulCreate |
| 22:38:36Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:38:36Z | k8s | ReplicaSet/embedder-7f54dc58bc: SuccessfulCreate |
| 22:38:36Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:38:36Z | k8s | Pod/retriever-856d879b65-nzdcp: Scheduled |
| 22:38:36Z | k8s | Pod/retriever-797b99c974-5qthg: Scheduled |
| 22:38:36Z | k8s | Pod/embedder-7f54dc58bc-mch99: Scheduled |
| 22:38:37Z | k8s | Pod/retriever-856d879b65-nzdcp: Started |
| 22:38:37Z | k8s | Pod/retriever-856d879b65-nzdcp: Pulled |
| 22:38:37Z | k8s | Pod/retriever-856d879b65-nzdcp: Killing |
| 22:38:37Z | k8s | Pod/retriever-856d879b65-nzdcp: Created |
| 22:38:37Z | k8s | Pod/retriever-797b99c974-5qthg: Pulled |
| 22:38:37Z | k8s | Pod/retriever-797b99c974-5qthg: Created |
| 22:38:37Z | k8s | Pod/embedder-7f54dc58bc-mch99: Pulling |
| 22:38:38Z | deploy:argo | model-proxy synced to 6867477263e1 |
| 22:38:38Z | k8s | Pod/retriever-797b99c974-5qthg: Started |
| 22:38:38Z | k8s | Rollout/model-proxy: RolloutUpdated |
| 22:38:38Z | k8s | Pod/embedder-7f54dc58bc-mch99: Started |
| 22:38:38Z | k8s | Pod/embedder-7f54dc58bc-mch99: Pulled |
| 22:38:38Z | k8s | Pod/embedder-7f54dc58bc-mch99: Created |
| 22:38:39Z | deploy:annotation | deploy load-generator via gitops 6867477 (argo sync) |
| 22:38:39Z | deploy:argo | gateway synced to 6867477263e1 |
| 22:38:40Z | k8s | Pod/model-proxy-8588ff44bc-bvw44: Killing |
| 22:38:40Z | k8s | AnalysisRun/model-proxy-8588ff44bc-17-3: MetricSuccessful |
| 22:38:40Z | k8s | AnalysisRun/model-proxy-8588ff44bc-17-3: AnalysisRunSuccessful |
| 22:38:40Z | k8s | ReplicaSet/model-proxy-8588ff44bc: SuccessfulDelete |
| 22:38:40Z | k8s | Pod/gateway-64f8cc978f-ktt25: Killing |
| 22:38:40Z | k8s | AnalysisRun/gateway-64f8cc978f-30-1: AnalysisRunSuccessful |
| 22:38:40Z | k8s | ReplicaSet/gateway-64f8cc978f: SuccessfulDelete |
| 22:38:41Z | k8s | ReplicaSet/model-proxy-56848dd69: SuccessfulCreate |
| 22:38:41Z | k8s | Pod/model-proxy-56848dd69-6txsc: Scheduled |
| 22:38:42Z | k8s | Pod/model-proxy-56848dd69-6txsc: Started |
| 22:38:42Z | k8s | Pod/model-proxy-56848dd69-6txsc: Pulled |
| 22:38:42Z | k8s | Pod/model-proxy-56848dd69-6txsc: Created |
| 22:38:42Z | k8s | ReplicaSet/gateway-7c88c55866: SuccessfulCreate |
| 22:38:42Z | k8s | Pod/gateway-7c88c55866-jwdmd: Scheduled |
| 22:38:43Z | k8s | Pod/gateway-7c88c55866-jwdmd: Started |
| 22:38:43Z | k8s | Pod/gateway-7c88c55866-jwdmd: Pulling |
| 22:38:43Z | k8s | Pod/gateway-7c88c55866-jwdmd: Pulled |
| 22:38:43Z | k8s | Pod/gateway-7c88c55866-jwdmd: Created |
| 22:38:44Z | k8s | Job/seed: SuccessfulCreate |
| 22:38:44Z | k8s | Pod/retriever-697b54496d-l8nnf: Killing |
| 22:38:44Z | k8s | ReplicaSet/retriever-697b54496d: SuccessfulDelete |
| 22:38:44Z | k8s | Pod/seed-jbbnv: Scheduled |
| 22:38:45Z | deploy:ci | CI run #37 queued on postmortem/inc_19f8bf3d2e2a3a: obs: postmortem: gateway-5xx-stale-db-secret |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Started |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Pulled |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Created |
| 22:38:45Z | k8s | Pod/embedder-847c7d6b54-87hkq: Killing |
| 22:38:45Z | k8s | ReplicaSet/embedder-847c7d6b54: SuccessfulDelete |
| 22:38:45Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:38:46Z | deploy:annotation | deploy retriever via gitops 6867477 (argo sync) |
| 22:38:46Z | k8s | ReplicaSet/retriever-547b7796f: SuccessfulCreate |
| 22:38:46Z | k8s | Pod/gateway-7c88c55866-jwdmd: Killing |
| 22:38:46Z | k8s | ReplicaSet/gateway-7c88c55866: SuccessfulDelete |
| 22:38:46Z | k8s | Pod/retriever-547b7796f-lv9ss: Scheduled |
| 22:38:47Z | deploy:annotation | deploy embedder via gitops 6867477 (argo sync) |
| 22:38:47Z | k8s | Pod/retriever-547b7796f-lv9ss: Started |
| 22:38:47Z | k8s | Pod/retriever-547b7796f-lv9ss: Pulled |
| 22:38:47Z | k8s | Pod/retriever-547b7796f-lv9ss: Created |
| 22:38:47Z | k8s | ReplicaSet/gateway-548488f9c4: SuccessfulCreate |
| 22:38:47Z | k8s | Pod/gateway-548488f9c4-rh9fg: Scheduled |
| 22:38:48Z | k8s | Pod/model-proxy-8588ff44bc-jczr8: Unhealthy |
| 22:38:48Z | k8s | Pod/model-proxy-8588ff44bc-jczr8: Killing |
| 22:38:48Z | k8s | ReplicaSet/model-proxy-8588ff44bc: SuccessfulDelete |
| 22:38:48Z | k8s | Pod/gateway-548488f9c4-rh9fg: Started |
| 22:38:48Z | k8s | Pod/gateway-548488f9c4-rh9fg: Pulling |
| 22:38:48Z | k8s | Pod/gateway-548488f9c4-rh9fg: Pulled |
| 22:38:48Z | k8s | Pod/gateway-548488f9c4-rh9fg: Created |
| 22:38:49Z | k8s | Pod/seed-jbbnv: Started |
| 22:38:49Z | k8s | Pod/seed-jbbnv: Pulled |
| 22:38:49Z | k8s | Pod/seed-jbbnv: Created |
| 22:38:49Z | k8s | ReplicaSet/model-proxy-785ff44584: SuccessfulCreate |
| 22:38:49Z | k8s | Pod/model-proxy-785ff44584-5l9jm: Scheduled |
| 22:38:50Z | k8s | Pod/model-proxy-785ff44584-5l9jm: Started |
| 22:38:50Z | k8s | Pod/model-proxy-785ff44584-5l9jm: Pulling |
| 22:38:50Z | k8s | Pod/model-proxy-785ff44584-5l9jm: Pulled |
| 22:38:50Z | k8s | Pod/model-proxy-785ff44584-5l9jm: Created |
| 22:38:51Z | remediation | restart_workload gateway executed (run run_19f8bf6a827b06) |
| 22:38:52Z | k8s | Pod/seed-jbbnv: BackOff |
| 22:38:52Z | k8s | ReplicaSet/gateway-7b5f489dfb: SuccessfulCreate |
| 22:38:52Z | k8s | Pod/gateway-548488f9c4-rh9fg: Killing |
| 22:38:52Z | k8s | AnalysisRun/gateway-548488f9c4-32-1: AnalysisRunSuccessful |
| 22:38:52Z | k8s | ReplicaSet/gateway-548488f9c4: SuccessfulDelete |
| 22:38:52Z | k8s | Pod/gateway-7b5f489dfb-x6rp7: Scheduled |
| 22:38:54Z | k8s | Pod/retriever-797b99c974-5qthg: Killing |
| 22:38:54Z | k8s | ReplicaSet/retriever-797b99c974: SuccessfulDelete |
| 22:38:54Z | k8s | Pod/gateway-7b5f489dfb-x6rp7: Started |
| 22:38:54Z | k8s | Pod/gateway-7b5f489dfb-x6rp7: Pulled |
| 22:38:54Z | k8s | Pod/gateway-7b5f489dfb-x6rp7: Created |
| 22:39:06Z | k8s | Pod/seed-jbbnv: Started |
| 22:39:06Z | k8s | Pod/seed-jbbnv: Pulled |
| 22:39:06Z | k8s | Pod/seed-jbbnv: Created |
| 22:39:08Z | k8s | Pod/seed-jbbnv: BackOff |
| 22:39:23Z | deploy:ci | CI run #38 in_progress on postmortem/inc_19f8bf69762af4: obs: postmortem: gateway-p95-stale-db-secret-recurrence |
| 22:39:31Z | k8s | Pod/seed-jbbnv: Started |
| 22:39:31Z | k8s | Pod/seed-jbbnv: Pulled |
| 22:39:31Z | k8s | Pod/seed-jbbnv: Created |
| 22:39:32Z | k8s | Job/seed: SuccessfulDelete |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759625752%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759625752%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
A sev1 "SLO gateway latency — fast burn" alert fired for tenant acme. Investigation traced it to a stale Postgres credential: the `subject-db-credentials` k8s Secret had not been touched in ~4 days, but the underlying Postgres password for user `lab` had been rotated in the vault without the Secret being updated. `retriever` — the only workload that talks to Postgres directly — could no longer authenticate, so every retrieval call gateway depends on failed/timed out, which manifested as both a gateway latency SLO burn and a coincident availability SLO burn (5m error ratios up around 92–97%).

## Impact
Gateway requests that fan out to retriever were failing or hanging on DB auth for the duration of the incident, driving the 5m/1h gateway latency error-budget burn rate to sev1 thresholds (and availability error ratio to ~97.5% over the same window). Postgres itself logged repeated `FATAL: password authentication failed for user "lab"` during the window, confirming the credential mismatch server-side rather than a network or app-code issue.

## Root cause
Credential drift between the vault (rotated Postgres password for user `lab`) and the live `secret/subject-db-credentials` k8s Secret, which still held the old password. Kubernetes does not restart pods automatically when a referenced Secret's backing value changes upstream, so already-running `retriever` pods kept presenting the stale credential to Postgres on every connection attempt. This is the same failure class as the `stale-secret` runbook describes, and recurred shortly after an earlier same-shift incident of the identical type had just been remediated and closed — the underlying chaos/rotation condition fired again independently of the redeploy churn happening around the same time from unrelated postmortem-PR auto-merges (ruled out as a contributing cause: no retriever/gateway code changes landed in the window, and the failure signature — password rejection at the Postgres server — is a credential problem, not an application regression).

## What fixed it
1. Confirmed via `update_db_secret` dry-run that the vault held a rotated password differing from the live Secret.
2. Got operator approval and executed `update_db_secret` to sync the Secret with the vault's current credential.
3. Got operator approval and rolling-restarted `retriever` and `gateway` so their pods picked up the refreshed credential (Secret updates alone don't propagate into already-running pod environments).
4. Verified: `retriever`'s Postgres auth-failure log stream went silent, and the `SLO gateway latency — fast burn` alert cleared and stayed cleared across repeated `alert_status` checks.

## Lessons
- No runbook is auto-matched for this specific alertname (`SLO gateway latency — fast burn`); the existing `stale-secret` runbook only lists `slo-avail-fast`/`gw-5xx` as its documented triggers even though the same root cause clearly also burns the latency SLO through a slow/failing downstream dependency. Worth widening that runbook's trigger list or adding an explicit cross-reference so latency-burn pages route here directly instead of relying on manual pattern-matching against the postgres-error log signature.
- A separate one-off `seed` Job was independently hitting the same stale password during the incident window and continued afterward — it's outside gateway/retriever's blast radius and wasn't touched by this remediation, but it will need its own credential refresh (likely just needs to be re-run now that the Secret is current) since Jobs don't get rolling-restarted the way Deployments do.
- Consider alerting directly on Secret-vs-vault credential drift (or auto-triggering a restart on Secret change via a controller) so this class of incident is caught before it burns an SLO rather than after.
