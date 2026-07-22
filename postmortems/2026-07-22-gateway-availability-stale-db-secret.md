# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:33:42Z
- **Resolved:** 2026-07-22 22:36:27Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:32:23Z | deploy:argo | load-generator synced to b9129b035938 |
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
| 22:33:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 22:37:35Z | deploy:ci | CI run #36 success on main: obs: Merge pull request 'Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h |
| 22:37:55Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8bf69cfcafd) |
| 22:38:09Z | deploy:argo | platform synced to 7e0f43228a11 |
| 22:38:11Z | k8s | ReplicaSet/gateway-64f8cc978f: SuccessfulCreate |
| 22:38:11Z | k8s | Pod/gateway-64f8cc978f-ktt25: Scheduled |
| 22:38:12Z | deploy:annotation | deploy platform via gitops 7e0f432 (argo sync) |
| 22:38:12Z | k8s | Pod/gateway-64f8cc978f-ktt25: Started |
| 22:38:12Z | k8s | Pod/gateway-64f8cc978f-ktt25: Pulled |
| 22:38:12Z | k8s | Pod/gateway-64f8cc978f-ktt25: Created |
| 22:38:14Z | k8s | Pod/retriever-68896d855f-xvj8k: Killing |
| 22:38:14Z | k8s | ReplicaSet/retriever-68896d855f: SuccessfulDelete |
| 22:38:14Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:38:33Z | deploy:annotation | deploy retriever :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy gateway :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy embedder :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy load-generator :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:33Z | deploy:annotation | deploy model-proxy :fe4237f (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/36">ci #36</a>) |
| 22:38:35Z | deploy:argo | load-generator synced to 6867477263e1 |
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
| 22:38:44Z | remediation | restart_workload gateway executed (run run_19f8bf69cfcafd) |
| 22:38:45Z | deploy:ci | CI run #37 in_progress on postmortem/inc_19f8bf3d2e2a3a: obs: postmortem: gateway-5xx-stale-db-secret |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Started |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Pulled |
| 22:38:45Z | k8s | Pod/seed-jbbnv: Created |
| 22:38:45Z | k8s | Pod/embedder-847c7d6b54-87hkq: Killing |
| 22:38:45Z | k8s | ReplicaSet/embedder-847c7d6b54: SuccessfulDelete |
| 22:38:45Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:38:45Z | remediation | restart_workload retriever executed (run run_19f8bf69cfcafd) |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759622895%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759622895%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
The `SLO gateway availability — fast burn` (sev1) alert fired for tenant `acme`. Root cause was a stale `subject-db-credentials` Kubernetes Secret: the in-cluster Postgres password had been rotated at the database/vault level without the Secret object being updated, so any pod reading that Secret (fresh or old) authenticated with the wrong password.

## Impact
Gateway availability error budget burned fast (2% of the 28-day budget in 1h across 5m & 1h windows). Downstream, `retriever` pods could not open Postgres connections at all — every query failed with `PostgresError: password authentication failed for user "lab"`, which the gateway surfaced as request failures. A `postgres` FATAL log burst for the same user corroborated the failures server-side. One-off `seed` job pods hit the same failure independently, confirming the credential mismatch was cluster-wide, not scoped to one deployment.

## Root cause
`subject-db-credentials` had not been modified since its creation, while the live Postgres password had since been rotated (out-of-band, via the vault) — the classic "rotated but never synced" stale-secret failure mode this environment's `update_db_secret` tool exists to fix. Evidence ruling out alternatives:
- The failure onset (password-auth FATALs) landed in a tight burst, coincident with the alert, not spread across the deploy history.
- Brand-new pods (gateway and retriever pods only ~1-2 minutes old at investigation time) failed authentication immediately on startup — proving the failure was credential-based, not a code regression, since a fresh pod pulling a bad Secret fails identically to an old one.
- `deploy_history` showed heavy Argo/gitops churn in the window, but all of it traced to unrelated postmortem-PR merges auto-redeploying via GitOps — no commit touched database configuration or credentials.
- This matches the `stale-secret.md` runbook's exact signature: secret_age long-stable while auth failures spike sharply, no correlated code deploy.

## What fixed it
1. Dry-ran and then executed `update_db_secret` to resync `subject-db-credentials` from the vault, rotating `POSTGRES_PASSWORD` and rebuilding `DATABASE_URL` to the current value.
2. Rolling-restarted `gateway` and `retriever` (both approved) so their pods picked up the refreshed Secret — a Secret update alone does not restart pods holding the old value in their environment.
3. Verified: password-auth failures stopped, retriever came back on a fresh pod, and `alert_status` reported the alert inactive on two consecutive checks.

## Lessons
- Secret rotation at the vault/database layer needs to be paired with an automatic Secret-object sync and a rollout trigger — right now it's a fully manual, alert-driven recovery.
- The `seed` job also depends on this Secret and failed identically; it isn't part of the gateway request path so it didn't block recovery, but it's worth confirming seed jobs are idempotent/retried after credential fixes.
- `secret_age` alone is a weak signal for "was this just rotated" when rotation happens out-of-band at the vault without touching the Kubernetes Secret — the runbook's log-correlation step (auth-failure onset vs fresh-pod immediate failure) was the decisive evidence here, not the age check.
