# Postmortem: gateway p95 latency above 2s

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:33:41Z
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
| 22:33:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 22:37:35Z | deploy:ci | CI run #36 success on main: obs: Merge pull request 'Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h |
| 22:37:52Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8bf6976daf6) |
| 22:38:05Z | remediation | restart_workload gateway executed (run run_19f8bf6976daf6) |
| 22:38:05Z | remediation | restart_workload retriever executed (run run_19f8bf6976daf6) |
| 22:38:07Z | k8s | Pod/retriever-697b54496d-l8nnf: Pulled |
| 22:38:08Z | k8s | Job/seed: Completed |
| 22:38:09Z | deploy:argo | platform synced to 7e0f43228a11 |
| 22:38:11Z | k8s | Pod/gateway-7f8bc8b6fb-vcxzs: Killing |
| 22:38:11Z | k8s | ReplicaSet/gateway-7f8bc8b6fb: SuccessfulDelete |
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
| 22:38:45Z | deploy:ci | CI run #37 in_progress on postmortem/inc_19f8bf3d2e2a3a: obs: postmortem: gateway-5xx-stale-db-secret |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759621476%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759621476%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 alert "Gateway p95 latency > 2s" fired for tenant acme. Root cause was a stale database credential: the Postgres password for user `lab` had been rotated in the vault/database but the in-cluster `subject-db-credentials` Secret was never updated, so every pod using that Secret was authenticating with an invalid password.

## Impact
Gateway p95 latency and error rate both breached SLO hard — the `slo:gateway_latency:sli_ratio5m` and `slo:gateway_availability:sli_ratio5m` recording rules dropped to roughly 2-11% success (i.e. ~90%+ of requests were either erroring or exceeding the 2s latency budget) during the incident window. Retriever pods logged continuous `PostgresError: password authentication failed for user "lab"` on essentially every database call, and the Postgres pod itself logged matching `FATAL: password authentication failed for user "lab"` entries at a sustained high rate (the pre-check log-spike lead measured ~200x baseline error/failed log volume). Retrieval calls timed out (`lineage emit failed ... The operation timed out`), which cascaded into elevated gateway request latency and errors for tenant acme traffic.

## Root cause
A credential rotation (the lab's `stale-secret` chaos fault) rotated the Postgres password for user `lab` without updating the `subject-db-credentials` Kubernetes Secret. Pods that were already running, plus any newly scheduled pods that mounted the (still-stale) Secret, continued presenting the old password to Postgres, which rejected every connection with `FATAL: password authentication failed`. This matches the `stale-secret.md` runbook signature exactly (secret_age pre-check lead reporting an untouched Secret age alongside a fresh log-spike of auth failures). A dry-run of `update_db_secret` confirmed a rotated credential was sitting in the vault, unsynced (`POSTGRES_PASSWORD` hash differed from the value baked into the live Secret). Heavy, unrelated CI/CD and Argo Rollout redeploy churn was occurring in the same window from a string of postmortem-PR merges, but none of that churn explains a password-auth failure — the deploy correlation was a red herring; the Postgres FATAL logs pointed directly and unambiguously at the credential mismatch, and no gateway/retriever code change in the window plausibly explains authentication rejection at the database layer.

## What fixed it
1. Dry-ran `update_db_secret`, confirmed the diff (rotated `POSTGRES_PASSWORD` hash), got operator approval, then executed it for real to sync `subject-db-credentials` from the vault.
2. Because Kubernetes does not restart pods automatically when a referenced Secret changes, dry-ran and (after approval) executed `restart_workload` for both `gateway` and `retriever` — the two workloads observed hitting the stale credential — so their pods picked up the refreshed password on startup.
3. Re-queried `alert_status` repeatedly post-restart; it reported resolved on three consecutive checks. New gateway/retriever pods came up `1/1 Running` with no further auth failures from either workload (a lingering `seed` Job pod logged two stale-credential retries from before the patch landed, then completed normally on retry — it is not part of the gateway request-serving path).

## Lessons
- This is a recurrence of the same failure class already documented earlier tonight (`gateway-latency-stale-db-secret`); the `stale-secret.md` runbook's diagnose→mitigate→verify sequence worked cleanly end to end and should stay the first stop whenever the `secret_age` and log-spike leads co-occur.
- The heavy volume of unrelated CI/CD redeploy activity in the incident window (multiple postmortem-PR merges each triggering full gitops syncs) added noise to the deploy-correlation step and could mislead a less careful read toward "bad deploy" — the runbook's explicit instruction to confirm no deploy actually explains the failure signature (password auth, not application error) was the deciding factor. Worth checking why postmortem-only merges still appear to trigger redeploys despite the `p11-postmortem-policy` exclusion PR merged earlier in the window.
- Consider whether the stale-secret chaos fault or its detection could trigger an automatic secret-sync + restart, since this is now a repeat page for the same root cause.
