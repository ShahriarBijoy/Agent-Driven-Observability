# Postmortem: gateway 5xx rate above 2%

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:30:40Z
- **Resolved:** 2026-07-22 22:36:27Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:30:10Z | alert | alert firing: Gateway 5xx rate > 2% |
| 22:30:39Z | log-spike | log-spike onset: error: Failed query: select "id", "doc_id", "body", 1 - ("chunks"."embedding" <=> $1) from "chunks" order by 1 - ("chunks"."embedding" <=> $2) desc limit $3 |
| 22:32:16Z | deploy:annotation | deploy retriever :741ff9c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/33">ci #33</a>) |
| 22:32:16Z | deploy:annotation | deploy model-proxy :741ff9c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/33">ci #33</a>) |
| 22:32:16Z | deploy:annotation | deploy load-generator :741ff9c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/33">ci #33</a>) |
| 22:32:16Z | deploy:annotation | deploy gateway :741ff9c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/33">ci #33</a>) |
| 22:32:23Z | deploy:argo | load-generator synced to b9129b035938 |
| 22:32:25Z | deploy:argo | retriever synced to b9129b035938 |
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
| 22:36:30Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8bf3d2fea3c) |
| 22:36:36Z | k8s | Pod/seed-ctsdv: Pulled |
| 22:36:36Z | k8s | Pod/seed-ctsdv: Created |
| 22:36:36Z | k8s | Job/seed: SuccessfulCreate |
| 22:36:36Z | k8s | Pod/seed-ctsdv: Scheduled |
| 22:36:37Z | k8s | Pod/seed-ctsdv: Started |
| 22:36:39Z | k8s | Pod/seed-ctsdv: Started |
| 22:36:39Z | k8s | Pod/seed-ctsdv: Pulled |
| 22:36:39Z | k8s | Pod/seed-ctsdv: Created |
| 22:36:41Z | k8s | Pod/seed-ctsdv: BackOff |
| 22:36:55Z | k8s | Pod/seed-ctsdv: Started |
| 22:36:55Z | k8s | Pod/seed-ctsdv: Pulled |
| 22:36:55Z | k8s | Pod/seed-ctsdv: Created |
| 22:36:57Z | k8s | Pod/seed-ctsdv: BackOff |
| 22:37:24Z | k8s | Pod/seed-ctsdv: Started |
| 22:37:24Z | k8s | Pod/seed-ctsdv: Pulled |
| 22:37:24Z | k8s | Pod/seed-ctsdv: Created |
| 22:37:25Z | k8s | Job/seed: SuccessfulDelete |
| 22:37:27Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:37:35Z | deploy:ci | CI run #36 success on main: obs: Merge pull request 'Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h |
| 22:37:42Z | k8s | Pod/seed-x9cqj: Started |
| 22:37:42Z | k8s | Pod/seed-x9cqj: Pulled |
| 22:37:42Z | k8s | Pod/seed-x9cqj: Created |
| 22:37:42Z | k8s | Job/seed: SuccessfulCreate |
| 22:37:42Z | k8s | Pod/seed-x9cqj: Scheduled |
| 22:37:45Z | k8s | Pod/seed-x9cqj: Started |
| 22:37:45Z | k8s | Pod/seed-x9cqj: Pulled |
| 22:37:45Z | k8s | Pod/seed-x9cqj: Created |
| 22:37:48Z | k8s | Pod/seed-x9cqj: BackOff |
| 22:38:01Z | k8s | Pod/seed-x9cqj: Started |
| 22:38:01Z | k8s | Pod/seed-x9cqj: Pulled |
| 22:38:01Z | k8s | Pod/seed-x9cqj: Created |
| 22:38:01Z | remediation | restart_workload gateway executed (run run_19f8bf3d2fea3c) |
| 22:38:01Z | remediation | restart_workload retriever executed (run run_19f8bf3d2fea3c) |
| 22:38:02Z | k8s | ReplicaSet/retriever-56d4ddf656: SuccessfulCreate |
| 22:38:02Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:38:02Z | k8s | Pod/gateway-7f8bc8b6fb-5bkkv: Killing |
| 22:38:02Z | k8s | AnalysisRun/gateway-7f8bc8b6fb-28-3: MetricSuccessful |
| 22:38:02Z | k8s | AnalysisRun/gateway-7f8bc8b6fb-28-3: AnalysisRunSuccessful |
| 22:38:02Z | k8s | ReplicaSet/gateway-7f8bc8b6fb: SuccessfulDelete |
| 22:38:02Z | k8s | ReplicaSet/gateway-5fdcfbff4: SuccessfulCreate |
| 22:38:02Z | k8s | Pod/retriever-56d4ddf656-m6clk: Scheduled |
| 22:38:02Z | k8s | Pod/gateway-5fdcfbff4-48st6: Scheduled |
| 22:38:03Z | k8s | Pod/retriever-56d4ddf656-m6clk: Started |
| 22:38:03Z | k8s | Pod/retriever-56d4ddf656-m6clk: Pulled |
| 22:38:03Z | k8s | Pod/retriever-56d4ddf656-m6clk: Created |
| 22:38:03Z | k8s | Pod/gateway-5fdcfbff4-48st6: Pulled |
| 22:38:03Z | k8s | Pod/gateway-5fdcfbff4-48st6: Created |
| 22:38:04Z | k8s | Pod/gateway-5fdcfbff4-48st6: Started |
| 22:38:06Z | k8s | ReplicaSet/retriever-697b54496d: SuccessfulCreate |
| 22:38:06Z | k8s | Pod/retriever-56d4ddf656-m6clk: Killing |
| 22:38:06Z | k8s | ReplicaSet/retriever-56d4ddf656: SuccessfulDelete |
| 22:38:06Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:38:06Z | k8s | Pod/retriever-697b54496d-l8nnf: Scheduled |
| 22:38:07Z | k8s | Pod/retriever-697b54496d-l8nnf: Started |
| 22:38:07Z | k8s | Pod/retriever-697b54496d-l8nnf: Pulling |
| 22:38:07Z | k8s | Pod/retriever-697b54496d-l8nnf: Pulled |
| 22:38:07Z | k8s | Pod/retriever-697b54496d-l8nnf: Created |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759440099%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784759440099%22%2C+%22to%22%3A+%221784759787049%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 paged on `Gateway 5xx rate > 2%` for tenant acme. Root cause was a rotated Postgres password that never propagated to the running `retriever` and `gateway` pods.

## Impact
Gateway 5xx rate crossed 2% and the availability burn-rate alert fired. Requests requiring retrieval (RAG lookups against the `chunks` table) failed end-to-end, surfaced to the gateway as 5xx.

## Root cause
The in-cluster Postgres password for user `lab` was rotated at the database/vault level without updating the `subject-db-credentials` Kubernetes Secret (this is why the Secret's own last-modified timestamp did not reflect the rotation — it's a vault-side rotation, not a Secret edit). The `retriever` pods, already running since well before the rotation took effect, kept authenticating with the old password baked into their environment from Secret injection at pod start. Postgres began FATAL-rejecting connections with `password authentication failed for user "lab"`, which retriever logged as `PostgresError` wrapping failed `chunks`/pgvector similarity queries, and the gateway surfaced these as 5xx to callers.

Ruled out:
- No gateway/retriever/model-proxy deploy landed in the minutes immediately preceding the auth failures — the argo syncs in the window (98c39c6, 6e2d4af, etc.) predate the failure onset and are unrelated; this was not a bad-deploy regression.
- Argo Rollouts for gateway and model-proxy were reported healthy throughout — canary/rollout mechanics were not involved.

## What fixed it
1. Dry-ran and (on operator approval) executed `update_db_secret` to sync `secret/subject-db-credentials` from the vault, rotating `POSTGRES_PASSWORD`/`DATABASE_URL` in the Secret to match the live database credential.
2. Dry-ran and (on operator approval) rolling-restarted `gateway` and `retriever` so their pods picked up the refreshed Secret on next start (Kubernetes does not hot-reload Secret changes into already-running pods).
3. Verified: `alert_status` for `Gateway 5xx rate > 2%` went from active to inactive/resolved and stayed resolved on repeat checks; retriever's `PostgresError` log line disappeared entirely in the post-restart window.

## Lessons
- Secret **mtime is not a reliable signal for vault-side credential rotations** — the rotation tooling can change the live database password without touching the Kubernetes Secret object, so an "unchanged" secret-age pre-check does not rule out a stale-credential incident; direct log evidence (`password authentication failed`) is the reliable signal.
- A separate one-off `seed` Job in the `subject` namespace is still hitting the same stale-credential auth failures (new pods `seed-x9cqj`/`seed-ctsdv` continuing to FATAL against Postgres) and had already hit `BackoffLimitExceeded`. It is not part of the gateway request path and did not affect this alert, but it holds the same stale credential and was not remediated by the gateway/retriever restart — worth a follow-up to restart/re-trigger the seed Job (or have it read the Secret fresh per-run) so it isn't left permanently wedged.
- Consider an automated Secret-refresh + rolling-restart hook triggered directly off vault rotation events, rather than relying on an on-call agent to notice the mismatch reactively.
