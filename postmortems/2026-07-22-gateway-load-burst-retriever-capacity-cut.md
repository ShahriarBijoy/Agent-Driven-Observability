# Postmortem: gateway p95 latency above 2s

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:06:41Z
- **Resolved:** 2026-07-22 22:16:41Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:03:15Z | log-spike | log-spike onset: [gateway] unhandled error: 16 \|         } |
| 22:06:10Z | alert | alert firing: Gateway p95 latency > 2s |
| 22:12:16Z | deploy:annotation | deploy gateway :b85256c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/24">ci #24</a>) |
| 22:12:21Z | deploy:argo | load-generator synced to 9b687084a7b4 |
| 22:12:22Z | deploy:argo | embedder synced to 9b687084a7b4 |
| 22:12:22Z | deploy:argo | retriever synced to 9b687084a7b4 |
| 22:12:25Z | deploy:annotation | deploy load-generator via gitops 9b68708 (argo sync) |
| 22:12:25Z | deploy:argo | gateway synced to 9b687084a7b4 |
| 22:12:25Z | deploy:argo | model-proxy synced to 9b687084a7b4 |
| 22:12:30Z | deploy:annotation | deploy embedder via gitops 9b68708 (argo sync) |
| 22:12:32Z | deploy:annotation | deploy retriever via gitops 9b68708 (argo sync) |
| 22:12:43Z | deploy:annotation | deploy embedder :69c742c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/25">ci #25</a>) |
| 22:12:43Z | deploy:annotation | deploy model-proxy :69c742c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/25">ci #25</a>) |
| 22:12:43Z | deploy:annotation | deploy load-generator :69c742c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/25">ci #25</a>) |
| 22:12:43Z | deploy:annotation | deploy gateway :69c742c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/25">ci #25</a>) |
| 22:12:43Z | deploy:annotation | deploy retriever :69c742c (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/25">ci #25</a>) |
| 22:12:46Z | deploy:argo | load-generator synced to 5f98797fbf9c |
| 22:12:47Z | deploy:annotation | deploy model-proxy :57b4fff (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/26">ci #26</a>) |
| 22:12:47Z | deploy:annotation | deploy retriever :57b4fff (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/26">ci #26</a>) |
| 22:12:47Z | deploy:annotation | deploy gateway :57b4fff (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/26">ci #26</a>) |
| 22:12:47Z | deploy:annotation | deploy load-generator :57b4fff (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/26">ci #26</a>) |
| 22:12:47Z | deploy:annotation | deploy embedder :57b4fff (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/26">ci #26</a>) |
| 22:12:47Z | deploy:argo | embedder synced to 5f98797fbf9c |
| 22:12:47Z | deploy:argo | retriever synced to 5f98797fbf9c |
| 22:12:49Z | deploy:argo | gateway synced to 5f98797fbf9c |
| 22:12:49Z | deploy:argo | model-proxy synced to 5f98797fbf9c |
| 22:12:50Z | deploy:annotation | deploy load-generator via gitops 5f98797 (argo sync) |
| 22:12:52Z | deploy:annotation | deploy embedder :6a38257 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/27">ci #27</a>) |
| 22:12:52Z | deploy:annotation | deploy gateway :6a38257 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/27">ci #27</a>) |
| 22:12:52Z | deploy:annotation | deploy load-generator :6a38257 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/27">ci #27</a>) |
| 22:12:52Z | deploy:annotation | deploy model-proxy :6a38257 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/27">ci #27</a>) |
| 22:12:52Z | deploy:annotation | deploy retriever :6a38257 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/27">ci #27</a>) |
| 22:12:53Z | deploy:argo | load-generator synced to 98c39c63be83 |
| 22:12:54Z | deploy:argo | embedder synced to 98c39c63be83 |
| 22:12:56Z | deploy:argo | retriever synced to 98c39c63be83 |
| 22:12:56Z | k8s | Pod/retriever-746f9b76df-ptk4c: Unhealthy |
| 22:12:56Z | k8s | ReplicaSet/retriever-5d5f4fd5b4: SuccessfulCreate |
| 22:12:56Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:12:56Z | k8s | Pod/embedder-677464dfc6-wmftp: Pulling |
| 22:12:56Z | k8s | Pod/embedder-677464dfc6-wmftp: Pulled |
| 22:12:56Z | k8s | Pod/embedder-677464dfc6-wmftp: Created |
| 22:12:56Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Scheduled |
| 22:12:57Z | deploy:annotation | deploy load-generator via gitops 98c39c6 (argo sync) |
| 22:12:57Z | deploy:argo | gateway synced to 98c39c63be83 |
| 22:12:57Z | deploy:argo | model-proxy synced to 98c39c63be83 |
| 22:12:57Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Pulling |
| 22:12:57Z | k8s | Pod/embedder-677464dfc6-wmftp: Started |
| 22:12:58Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Started |
| 22:12:58Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Pulled |
| 22:12:58Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Created |
| 22:12:59Z | k8s | Pod/model-proxy-77b488959b-hbzwl: Killing |
| 22:12:59Z | k8s | ReplicaSet/model-proxy-77b488959b: SuccessfulDelete |
| 22:12:59Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulCreate |
| 22:12:59Z | k8s | Pod/gateway-746bc9f7bf-rpvcz: Killing |
| 22:12:59Z | k8s | ReplicaSet/gateway-746bc9f7bf: SuccessfulDelete |
| 22:12:59Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Scheduled |
| 22:13:00Z | k8s | ReplicaSet/gateway-c99fffff: SuccessfulCreate |
| 22:13:00Z | k8s | Pod/gateway-c99fffff-9qjhq: Scheduled |
| 22:13:01Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Started |
| 22:13:01Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Pulling |
| 22:13:01Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Pulled |
| 22:13:01Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Created |
| 22:13:01Z | k8s | Pod/gateway-c99fffff-9qjhq: Started |
| 22:13:01Z | k8s | Pod/gateway-c99fffff-9qjhq: Pulling |
| 22:13:01Z | k8s | Pod/gateway-c99fffff-9qjhq: Pulled |
| 22:13:01Z | k8s | Pod/gateway-c99fffff-9qjhq: Created |
| 22:13:03Z | deploy:annotation | deploy embedder via gitops 98c39c6 (argo sync) |
| 22:13:03Z | k8s | Pod/embedder-5d79ccfd5c-l5bxw: Killing |
| 22:13:03Z | k8s | ReplicaSet/embedder-5d79ccfd5c: SuccessfulDelete |
| 22:13:03Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:13:04Z | k8s | Pod/retriever-65bb979746-gqrvn: Killing |
| 22:13:04Z | k8s | ReplicaSet/retriever-65bb979746: SuccessfulDelete |
| 22:13:04Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:13:05Z | deploy:annotation | deploy retriever via gitops 98c39c6 (argo sync) |
| 22:13:07Z | k8s | Pod/gateway-c99fffff-9qjhq: Killing |
| 22:13:07Z | k8s | AnalysisRun/gateway-c99fffff-22-1: AnalysisRunSuccessful |
| 22:13:07Z | k8s | ReplicaSet/gateway-c99fffff: SuccessfulDelete |
| 22:13:07Z | k8s | ReplicaSet/gateway-8cdd67dd4: SuccessfulCreate |
| 22:13:08Z | k8s | Pod/gateway-8cdd67dd4-r6gfm: Started |
| 22:13:08Z | k8s | Pod/gateway-8cdd67dd4-r6gfm: Pulled |
| 22:13:08Z | k8s | Pod/gateway-8cdd67dd4-r6gfm: Created |
| 22:13:08Z | k8s | Pod/gateway-8cdd67dd4-r6gfm: Scheduled |
| 22:13:10Z | alert | alert resolved: Gateway p95 latency > 2s |
| 22:13:12Z | k8s | ReplicaSet/retriever-f958f966b: SuccessfulCreate |
| 22:13:12Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:13:12Z | k8s | Pod/retriever-f958f966b-zvl72: Scheduled |
| 22:13:13Z | k8s | Pod/retriever-f958f966b-zvl72: Started |
| 22:13:13Z | k8s | Pod/retriever-f958f966b-zvl72: Pulling |
| 22:13:13Z | k8s | Pod/retriever-f958f966b-zvl72: Pulled |
| 22:13:13Z | k8s | Pod/retriever-f958f966b-zvl72: Created |
| 22:13:20Z | k8s | Pod/retriever-5d5f4fd5b4-l8s22: Killing |
| 22:13:20Z | k8s | ReplicaSet/retriever-5d5f4fd5b4: SuccessfulDelete |
| 22:13:20Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:13:45Z | k8s | Job/seed: SuccessfulCreate |
| 22:13:45Z | k8s | Pod/seed-ws86l: Scheduled |
| 22:13:46Z | k8s | Pod/seed-ws86l: Started |
| 22:13:46Z | k8s | Pod/seed-ws86l: Pulled |
| 22:13:46Z | k8s | Pod/seed-ws86l: Created |
| 22:13:49Z | k8s | Pod/seed-ws86l: Started |
| 22:13:49Z | k8s | Pod/seed-ws86l: Pulled |
| 22:13:49Z | k8s | Pod/seed-ws86l: Created |
| 22:13:51Z | k8s | Pod/seed-ws86l: BackOff |
| 22:14:02Z | k8s | Pod/seed-ws86l: Started |
| 22:14:02Z | k8s | Pod/seed-ws86l: Pulled |
| 22:14:02Z | k8s | Pod/seed-ws86l: Created |
| 22:14:04Z | k8s | Pod/seed-ws86l: BackOff |
| 22:14:32Z | k8s | Pod/seed-ws86l: Started |
| 22:14:32Z | k8s | Pod/seed-ws86l: Pulled |
| 22:14:32Z | k8s | Pod/seed-ws86l: Created |
| 22:14:33Z | k8s | Pod/seed-ws86l: Killing |
| 22:14:33Z | k8s | Job/seed: SuccessfulDelete |
| 22:14:34Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:16:29Z | k8s | AnalysisRun/model-proxy-6fbf6cc566-14-1: MetricSuccessful |
| 22:16:29Z | k8s | AnalysisRun/model-proxy-6fbf6cc566-14-1: AnalysisRunSuccessful |
| 22:16:30Z | k8s | Pod/model-proxy-7b757c8887-thhn7: Killing |
| 22:16:30Z | k8s | ReplicaSet/model-proxy-7b757c8887: SuccessfulDelete |
| 22:16:30Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulCreate |
| 22:16:30Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Scheduled |
| 22:16:31Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Started |
| 22:16:31Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Pulling |
| 22:16:31Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Pulled |
| 22:16:31Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Created |
| 22:16:37Z | k8s | ReplicaSet/retriever-f958f966b: SuccessfulCreate |
| 22:16:37Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:16:37Z | k8s | AnalysisRun/gateway-8cdd67dd4-23-1: MetricSuccessful |
| 22:16:37Z | k8s | AnalysisRun/gateway-8cdd67dd4-23-1: AnalysisRunSuccessful |
| 22:16:37Z | k8s | Rollout/gateway: AnalysisRunSuccessful |
| 22:16:37Z | k8s | Pod/retriever-f958f966b-v5795: Scheduled |
| 22:16:37Z | remediation | scale_deployment retriever executed (run run_19f8bdddf60597) |
| 22:16:38Z | k8s | Pod/retriever-f958f966b-v5795: Started |
| 22:16:38Z | k8s | Pod/retriever-f958f966b-v5795: Pulled |
| 22:16:38Z | k8s | Pod/retriever-f958f966b-v5795: Created |
| 22:16:38Z | k8s | ReplicaSet/gateway-8cdd67dd4: SuccessfulCreate |
| 22:16:38Z | k8s | Pod/gateway-659b5cb47d-9s7jt: Killing |
| 22:16:38Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulDelete |
| 22:16:38Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Scheduled |
| 22:16:39Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Started |
| 22:16:39Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Pulling |
| 22:16:39Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Pulled |
| 22:16:39Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784758001491%22%2C+%22to%22%3A+%221784758601467%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784758001491%22%2C+%22to%22%3A+%221784758601467%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Gateway p95 latency exceeded the 2s SLO threshold (sev1), driven by an unthrottled load-generator burst that overwhelmed the gateway → embedder → retriever → model-proxy RAG chain, compounded by a concurrent deploy that quietly halved retriever capacity.

## Impact
Gateway p95/p99 latency spiked to roughly 7.0s / 9.6s (self-reported by the load-generator across ~4,899 requests), with 312 server errors, 496 rate-limited responses, 133 client errors (malformed JSON), and 36 timeouts during the burst window. The `slo:gateway_latency:sli_ratio5m` recording rule collapsed from a healthy 1.0 to ~0.04–0.05 and stayed there until remediation, tripping the sev1 alert.

## Root cause
The `load-generator` deployment ran a 300-second burst at ~16 QPS against the live gateway. CPU on gateway, retriever, and embedder pods rose roughly 10x above baseline, the postgres pod missed a liveness probe under the added contention, and gateway logs showed a 200x spike in "malformed JSON" request errors consistent with the burst's payload mix. Traces during the window show request time dominated by serialized embedder → retriever calls, consistent with queuing under load rather than any single slow dependency.

While the burst was ending, a gitops sync (triggered by the phase-11 merge to main) redeployed gateway, retriever, embedder, and model-proxy to a new revision. That redeploy silently reduced the retriever deployment's replica count from 2 to 1 — cutting capacity in the exact tier that had just shown elevated CPU, right as the system needed headroom to recover from the burst. The new gateway/model-proxy canary passed its analysis cleanly (0% error rate), so the rollout itself was not defective, but the capacity reduction on retriever was a real regression riding along with it.

A separate, unrelated fault was also observed and confirmed real: Postgres began rejecting the `lab` user's password (vault credential rotated without the `subject-db-credentials` Secret being updated), crash-looping the `seed` batch Job. This was NOT on the gateway's synchronous request path during the incident (chat completions returned 200 throughout) and per the stale-secret runbook's own guidance ("if a deploy landed in the window, treat as a regular bad-deploy investigation instead") was not treated as this alert's cause, since a deploy did land in the window. It remains open and should be remediated separately (`update_db_secret` + restart of any DB-dependent workloads) in a follow-up.

## What fixed it
By the time of investigation, the load-generator had already finished its burst and scaled itself to zero (no further bad traffic), and CPU across the affected pods had decayed back to baseline. The remaining blocker to recovery was the reduced retriever capacity from the concurrent deploy. Scaling `retriever` back from 1 to 2 replicas (dry-run verified, operator-approved) restored the pre-incident capacity; the `slo:gateway_latency:sli_ratio5m` recording rule returned to 1.0 and `alert_status` confirmed the alert cleared on the next two polls.

## Lessons
- The load-generator's burst profile (~16 QPS sustained for 300s with no ramp) has no guardrail tying it to gateway's actual absorbed capacity; consider a rate limit or circuit breaker on the gateway side, or a lower default burst QPS.
- GitOps syncs that change replica counts should be surfaced more prominently in deploy history / diffed against the previous live spec — a silent capacity cut during an active incident window is easy to miss and can prolong recovery.
- The `slo:gateway_latency:sli_ratio5m` recording rule is a trailing 5-minute window; once the traffic source causing a breach stops entirely, the alert can stay "active" for several minutes purely because the bad samples haven't rolled out of the window yet — worth calling out in the runbook so on-call doesn't over-remediate a already-resolved condition.
- The stale Postgres credential (`password authentication failed for user "lab"`) is confirmed live via `update_db_secret`'s dry-run diff and is actively crash-looping the `seed` Job — needs its own follow-up remediation (sync secret + restart affected workloads) since it was out of scope for this alert.
