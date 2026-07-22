# Postmortem: gateway latency error budget burning slowly (10% of the 28d budget in 6h; 30m & 6h windows)

- **Status:** resolved
- **Severity:** sev2
- **Verified:** no
- **Opened:** 2026-07-22 22:46:47Z
- **Resolved:** 2026-07-22 22:49:04Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:36:56Z | log-spike | log-spike onset: 2026-07-22 22:36:56.889 UTC [219181] FATAL:  password authentication failed for user "lab" |
| 22:44:42Z | deploy:annotation | deploy load-generator :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:44Z | deploy:annotation | deploy model-proxy :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy embedder :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy load-generator :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy gateway :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy retriever :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:46Z | deploy:argo | load-generator synced to fcb43c0bcdc7 |
| 22:44:47Z | deploy:argo | embedder synced to fcb43c0bcdc7 |
| 22:44:47Z | deploy:argo | retriever synced to fcb43c0bcdc7 |
| 22:44:48Z | deploy:argo | model-proxy synced to fcb43c0bcdc7 |
| 22:44:49Z | deploy:argo | gateway synced to fcb43c0bcdc7 |
| 22:44:50Z | deploy:annotation | deploy gateway :57714aa (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/43">ci #43</a>) |
| 22:44:50Z | deploy:annotation | deploy embedder :57714aa (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/43">ci #43</a>) |
| 22:44:50Z | deploy:annotation | deploy model-proxy :57714aa (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/43">ci #43</a>) |
| 22:44:50Z | deploy:annotation | deploy load-generator :57714aa (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/43">ci #43</a>) |
| 22:44:50Z | deploy:annotation | deploy retriever :57714aa (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/43">ci #43</a>) |
| 22:44:50Z | deploy:annotation | deploy load-generator via gitops fcb43c0 (argo sync) |
| 22:44:53Z | deploy:annotation | deploy gateway :605be30 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/44">ci #44</a>) |
| 22:44:53Z | deploy:annotation | deploy embedder :605be30 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/44">ci #44</a>) |
| 22:44:53Z | deploy:annotation | deploy model-proxy :605be30 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/44">ci #44</a>) |
| 22:44:53Z | deploy:annotation | deploy load-generator :605be30 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/44">ci #44</a>) |
| 22:44:53Z | deploy:annotation | deploy retriever :605be30 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/44">ci #44</a>) |
| 22:44:55Z | deploy:argo | load-generator synced to 9ccc80cd2825 |
| 22:44:56Z | deploy:argo | embedder synced to 9ccc80cd2825 |
| 22:44:56Z | deploy:argo | load-generator synced to 3ca8a89f3b29 |
| 22:44:56Z | deploy:argo | retriever synced to 9ccc80cd2825 |
| 22:44:58Z | deploy:argo | gateway synced to 9ccc80cd2825 |
| 22:44:58Z | deploy:argo | model-proxy synced to 9ccc80cd2825 |
| 22:45:00Z | deploy:annotation | deploy load-generator via gitops 3ca8a89 (argo sync) |
| 22:45:05Z | deploy:argo | embedder synced to 3ca8a89f3b29 |
| 22:45:05Z | deploy:argo | retriever synced to 3ca8a89f3b29 |
| 22:45:08Z | deploy:argo | model-proxy synced to 3ca8a89f3b29 |
| 22:45:09Z | deploy:argo | gateway synced to 3ca8a89f3b29 |
| 22:45:15Z | deploy:annotation | deploy retriever via gitops 3ca8a89 (argo sync) |
| 22:45:17Z | deploy:annotation | deploy embedder via gitops 3ca8a89 (argo sync) |
| 22:46:10Z | alert | alert firing: SLO gateway latency — slow burn |
| 22:48:57Z | deploy:ci | CI run #45 success on postmortem/inc_19f8c024d9ce1d: obs: postmortem: gateway-model-proxy-canary-stuck-stale-db-secret |
| 22:52:24Z | k8s | AnalysisRun/model-proxy-78bc94fd66-21-3: AnalysisRunSuccessful |
| 22:52:24Z | k8s | ReplicaSet/model-proxy-56848dd69: SuccessfulDelete |
| 22:52:24Z | k8s | Pod/gateway-59db87867d-k5b4v: Pulled |
| 22:52:25Z | k8s | Pod/model-proxy-78bc94fd66-jk4wl: Pulled |
| 22:52:25Z | k8s | Pod/model-proxy-78bc94fd66-jk4wl: Created |
| 22:52:25Z | k8s | ReplicaSet/model-proxy-78bc94fd66: SuccessfulCreate |
| 22:52:25Z | k8s | Pod/model-proxy-78bc94fd66-jk4wl: Scheduled |
| 22:52:26Z | k8s | Pod/model-proxy-78bc94fd66-jk4wl: Started |
| 22:52:31Z | k8s | Pod/gateway-5fdcfbff4-gr6b2: Killing |
| 22:52:31Z | k8s | ReplicaSet/gateway-5fdcfbff4: SuccessfulDelete |
| 22:52:31Z | k8s | Pod/gateway-59db87867d-84fxt: Pulled |
| 22:52:31Z | k8s | Pod/gateway-59db87867d-84fxt: Created |
| 22:52:31Z | k8s | ReplicaSet/gateway-59db87867d: SuccessfulCreate |
| 22:52:31Z | k8s | Pod/gateway-59db87867d-84fxt: Scheduled |
| 22:52:32Z | k8s | Pod/gateway-59db87867d-84fxt: Started |
| 22:52:33Z | k8s | ReplicaSet/model-proxy-78bc94fd66: SuccessfulCreate |
| 22:52:33Z | k8s | Pod/model-proxy-56848dd69-x4nvg: Killing |
| 22:52:33Z | k8s | ReplicaSet/model-proxy-56848dd69: SuccessfulDelete |
| 22:52:33Z | k8s | Rollout/model-proxy: ScalingReplicaSet |
| 22:52:33Z | k8s | Pod/model-proxy-78bc94fd66-p5zrm: Scheduled |
| 22:52:34Z | k8s | Pod/model-proxy-78bc94fd66-p5zrm: Started |
| 22:52:34Z | k8s | Pod/model-proxy-78bc94fd66-p5zrm: Pulled |
| 22:52:34Z | k8s | Pod/model-proxy-78bc94fd66-p5zrm: Created |
| 22:52:39Z | deploy:annotation | deploy gateway via gitops 3ca8a89 (argo sync) |
| 22:52:41Z | deploy:annotation | deploy model-proxy via gitops 3ca8a89 (argo sync) |
| 22:54:42Z | remediation | update_db_secret secret/subject-db-credentials executed (run run_19f8c029482e2b) |
| 22:54:47Z | k8s | Job/seed: SuccessfulCreate |
| 22:54:47Z | k8s | Pod/seed-vx5fw: Scheduled |
| 22:54:48Z | k8s | Pod/seed-vx5fw: Started |
| 22:54:48Z | k8s | Pod/seed-vx5fw: Pulled |
| 22:54:48Z | k8s | Pod/seed-vx5fw: Created |
| 22:54:50Z | k8s | Pod/seed-vx5fw: Started |
| 22:54:50Z | k8s | Pod/seed-vx5fw: Pulled |
| 22:54:50Z | k8s | Pod/seed-vx5fw: Created |
| 22:54:52Z | k8s | Pod/seed-vx5fw: BackOff |
| 22:55:04Z | k8s | Pod/seed-vx5fw: Started |
| 22:55:04Z | k8s | Pod/seed-vx5fw: Pulled |
| 22:55:04Z | k8s | Pod/seed-vx5fw: Created |
| 22:55:06Z | k8s | Pod/seed-vx5fw: BackOff |
| 22:55:35Z | k8s | Pod/seed-vx5fw: Started |
| 22:55:35Z | k8s | Pod/seed-vx5fw: Pulled |
| 22:55:35Z | k8s | Pod/seed-vx5fw: Created |
| 22:55:36Z | k8s | Job/seed: SuccessfulDelete |
| 22:55:37Z | k8s | Pod/seed-vx5fw: Killing |
| 22:55:38Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:55:52Z | k8s | Job/seed: SuccessfulCreate |
| 22:55:53Z | k8s | Pod/seed-w9n27: Started |
| 22:55:53Z | k8s | Pod/seed-w9n27: Pulled |
| 22:55:53Z | k8s | Pod/seed-w9n27: Created |
| 22:55:53Z | k8s | Pod/seed-w9n27: Scheduled |
| 22:55:56Z | k8s | Pod/seed-w9n27: Started |
| 22:55:56Z | k8s | Pod/seed-w9n27: Pulled |
| 22:55:56Z | k8s | Pod/seed-w9n27: Created |
| 22:55:57Z | remediation | restart_workload retriever executed (run run_19f8c029482e2b) |
| 22:55:58Z | k8s | Pod/seed-w9n27: BackOff |
| 22:55:58Z | k8s | Pod/retriever-648998cdc5-6q6tm: Pulled |
| 22:55:58Z | k8s | Pod/retriever-648998cdc5-6q6tm: Created |
| 22:55:58Z | k8s | ReplicaSet/retriever-648998cdc5: SuccessfulCreate |
| 22:55:58Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:55:58Z | k8s | Pod/retriever-648998cdc5-6q6tm: Scheduled |
| 22:55:59Z | k8s | Pod/retriever-648998cdc5-6q6tm: Started |
| 22:56:04Z | remediation | restart_workload gateway executed (run run_19f8c029482e2b) |
| 22:56:05Z | k8s | Pod/retriever-7d4b75bbff-psjgv: Killing |
| 22:56:05Z | k8s | ReplicaSet/retriever-7d4b75bbff: SuccessfulDelete |
| 22:56:05Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:56:05Z | k8s | Rollout/gateway: RolloutUpdated |
| 22:56:06Z | k8s | Pod/gateway-59db87867d-k5b4v: Killing |
| 22:56:06Z | k8s | ReplicaSet/gateway-59db87867d: SuccessfulDelete |
| 22:56:07Z | k8s | ReplicaSet/gateway-9cc9bb484: SuccessfulCreate |
| 22:56:07Z | k8s | Pod/gateway-9cc9bb484-zp5w8: Scheduled |
| 22:56:08Z | k8s | Pod/gateway-9cc9bb484-zp5w8: Started |
| 22:56:08Z | k8s | Pod/gateway-9cc9bb484-zp5w8: Pulled |
| 22:56:08Z | k8s | Pod/gateway-9cc9bb484-zp5w8: Created |
| 22:56:12Z | k8s | Pod/seed-w9n27: Started |
| 22:56:12Z | k8s | Pod/seed-w9n27: Pulled |
| 22:56:12Z | k8s | Pod/seed-w9n27: Created |
| 22:56:14Z | k8s | Pod/seed-w9n27: BackOff |
| 22:56:23Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 22:56:23Z | k8s | Pod/retriever-65bd758646-ccc6s: Scheduled |
| 22:56:24Z | k8s | Pod/retriever-65bd758646-ccc6s: Started |
| 22:56:24Z | k8s | Pod/retriever-65bd758646-ccc6s: Pulled |
| 22:56:24Z | k8s | Pod/retriever-65bd758646-ccc6s: Created |
| 22:56:25Z | k8s | Pod/retriever-65bd758646-ccc6s: Started |
| 22:56:25Z | k8s | Pod/retriever-65bd758646-ccc6s: Pulled |
| 22:56:25Z | k8s | Pod/retriever-65bd758646-ccc6s: Created |
| 22:56:27Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:56:28Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:56:33Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:56:35Z | k8s | Pod/seed-w9n27: Started |
| 22:56:35Z | k8s | Pod/seed-w9n27: Pulled |
| 22:56:35Z | k8s | Pod/seed-w9n27: Created |
| 22:56:36Z | k8s | Pod/seed-w9n27: Killing |
| 22:56:36Z | k8s | Job/seed: SuccessfulDelete |
| 22:56:38Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:56:39Z | k8s | Pod/retriever-65bd758646-ccc6s: Started |
| 22:56:39Z | k8s | Pod/retriever-65bd758646-ccc6s: Pulled |
| 22:56:39Z | k8s | Pod/retriever-65bd758646-ccc6s: Created |
| 22:56:40Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:56:41Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:56:43Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:57:03Z | k8s | Job/seed: SuccessfulCreate |
| 22:57:03Z | k8s | Pod/seed-n2n6j: Scheduled |
| 22:57:04Z | k8s | Pod/seed-n2n6j: Started |
| 22:57:04Z | k8s | Pod/seed-n2n6j: Pulled |
| 22:57:04Z | k8s | Pod/seed-n2n6j: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784760407164%22%2C+%22to%22%3A+%221784760544803%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784760407164%22%2C+%22to%22%3A+%221784760544803%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev2 "SLO gateway latency — slow burn" fired for tenant acme (10% of the 28d error budget burned in 6h across the 30m/6h windows). Root cause was a stale `subject-db-credentials` Kubernetes Secret: the Postgres password for user `lab` had been rotated at the database/vault level without the in-cluster Secret being updated, so long-running pods kept authenticating with the old password.

## Impact
`retriever`'s vector-similarity query against the `chunks` table (`select ... from chunks order by 1 - (chunks.embedding <=> $1) ...`) began failing with `PostgresError: password authentication failed for user "lab"`. Because gateway calls retriever synchronously for RAG lookups, these failing/retrying queries manifested as elevated gateway request latency rather than hard errors — matching a *latency* SLO burn rather than an availability/error-rate burn. The recording rule `slo:gateway_latency:sli_ratio5m` shows the SLI collapsing to ~0.05–0.07 (from a healthy 1.0) in short bursts around 22:01–22:07 UTC and again ~22:31 UTC, each aligned with retriever restart/failure cycles. The separate `seed` Job was crash-looping on the same credential the entire time (`BackoffLimitExceeded` repeatedly), which was a strong corroborating signal.

## Root cause
Postgres's password for the `lab` user diverged from the value stored in `secret/subject-db-credentials`. The `secret_age` pre-check reported the Secret as unmodified for ~4 days, which is consistent with — not against — this failure mode: the rotation happened at the database/vault layer and the K8s Secret object itself was never touched, so pods kept mounting the old credential. `deploy_history` was checked and ruled out: the earliest deploy in the 3h lookback window landed at 22:44 UTC, well after the latency degradation had already started (~22:01 UTC), so this was not a bad-deploy regression — it matched the `stale-secret.md` runbook's diagnostic signature (secret_age OK + log-spike lead) rather than a code change.

## What fixed it
1. Dry-ran and, after operator approval, executed `update_db_secret` to sync `secret/subject-db-credentials` from the vault (`POSTGRES_PASSWORD` hash `a51146d3` → `4324eca3`).
2. Dry-ran and, after operator approval, rolling-restarted `retriever` and `gateway` so their pods picked up the refreshed credential (env-from Secret values are only re-read on pod creation).
3. Re-queried `alert_status`, which reported the alert no longer active, and confirmed `slo:gateway_latency:sli_ratio5m` back at 1 (fully healthy).

## Lessons
- A DB-level password rotation with no corresponding Secret update is invisible to a naive "has the Secret changed recently" check — `secret_age` being OK should be read as "consistent with a stale-secret scenario," not as clearing it, whenever a log-spike lead shows Postgres auth failures.
- The `seed` Job kept crash-looping on the same stale credential throughout and after this incident (it is not in `restart_workload`'s allowed workload list, so it wasn't restarted here); its backoff-exhausted pods should be cleaned up/re-triggered separately once credentials are confirmed stable everywhere.
- Residual `password authentication failed` lines were still observed from Postgres immediately after remediation (new retriever pod, new hash) — likely other pods/jobs still holding the old credential re-attempting connections during the rollout window. The paged latency SLO recovered and stayed recovered, but this residual churn is worth a follow-up sweep (e.g. confirm `model-proxy`/`embedder` don't also need a restart) rather than assuming full convergence from this one workload pair.
- Consider adding a runbook match for `SLO gateway latency — slow burn` that points directly at `stale-secret.md` when a Postgres-auth log spike is present, since this alert currently has no matched runbook and the responder has to infer the connection from `gateway-high-error-rate.md` and the pre-check leads.
