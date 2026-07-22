# Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h windows)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:10:42Z
- **Resolved:** 2026-07-22 22:15:42Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:04:37Z | log-spike | log-spike onset: error: Malformed JSON in request body |
| 22:10:10Z | alert | alert firing: SLO gateway availability — fast burn |
| 22:10:10Z | alert | alert resolved: SLO gateway availability — fast burn |
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
| 22:12:57Z | deploy:annotation | deploy load-generator via gitops 98c39c6 (argo sync) |
| 22:12:57Z | deploy:argo | gateway synced to 98c39c63be83 |
| 22:12:57Z | deploy:argo | model-proxy synced to 98c39c63be83 |
| 22:13:03Z | deploy:annotation | deploy embedder via gitops 98c39c6 (argo sync) |
| 22:13:05Z | deploy:annotation | deploy retriever via gitops 98c39c6 (argo sync) |
| 22:17:09Z | deploy:ci | CI run #28 success on postmortem/inc_19f8bdddf50595: obs: postmortem: gateway-load-burst-retriever-capacity-cut |
| 22:18:21Z | deploy:ci | CI run #29 success on p11-postmortem-policy: obs: p11: make postmortems/ a deliberate, format-excluded convention

The on-call agent's postmortem PRs merged into mai |
| 22:19:14Z | k8s | Pod/seed-8w5pw: BackOff |
| 22:19:26Z | k8s | Pod/seed-8w5pw: Started |
| 22:19:26Z | k8s | Pod/seed-8w5pw: Pulled |
| 22:19:26Z | k8s | Pod/seed-8w5pw: Created |
| 22:19:28Z | k8s | Pod/seed-8w5pw: BackOff |
| 22:19:56Z | k8s | Pod/seed-8w5pw: Started |
| 22:19:56Z | k8s | Pod/seed-8w5pw: Pulled |
| 22:19:56Z | k8s | Pod/seed-8w5pw: Created |
| 22:19:57Z | k8s | Job/seed: SuccessfulDelete |
| 22:19:58Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:20:07Z | k8s | ReplicaSet/retriever-59c9d56fcf: SuccessfulCreate |
| 22:20:07Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:20:07Z | k8s | Rollout/gateway: RolloutUpdated |
| 22:20:07Z | k8s | Pod/retriever-59c9d56fcf-p428d: Scheduled |
| 22:20:08Z | k8s | Pod/retriever-59c9d56fcf-p428d: Pulled |
| 22:20:08Z | k8s | Pod/retriever-59c9d56fcf-p428d: Created |
| 22:20:08Z | k8s | AnalysisRun/model-proxy-6fbf6cc566-14-3: MetricSuccessful |
| 22:20:08Z | k8s | AnalysisRun/model-proxy-6fbf6cc566-14-3: AnalysisRunSuccessful |
| 22:20:08Z | k8s | Rollout/model-proxy: AnalysisRunSuccessful |
| 22:20:08Z | k8s | Pod/gateway-8cdd67dd4-b7tgj: Killing |
| 22:20:08Z | k8s | AnalysisRun/gateway-8cdd67dd4-23-3: MetricSuccessful |
| 22:20:08Z | k8s | AnalysisRun/gateway-8cdd67dd4-23-3: AnalysisRunSuccessful |
| 22:20:08Z | k8s | ReplicaSet/gateway-8cdd67dd4: SuccessfulDelete |
| 22:20:08Z | k8s | ReplicaSet/gateway-659b5cb47d: SuccessfulCreate |
| 22:20:08Z | k8s | ReplicaSet/embedder-78996c4488: SuccessfulCreate |
| 22:20:08Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:20:08Z | k8s | Pod/embedder-78996c4488-qx57j: Scheduled |
| 22:20:08Z | k8s | Pod/gateway-659b5cb47d-n27mp: Scheduled |
| 22:20:09Z | k8s | Pod/retriever-59c9d56fcf-p428d: Started |
| 22:20:09Z | k8s | Pod/model-proxy-7b757c8887-t8tdv: Killing |
| 22:20:09Z | k8s | ReplicaSet/model-proxy-7b757c8887: SuccessfulDelete |
| 22:20:09Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulCreate |
| 22:20:09Z | k8s | Pod/model-proxy-6fbf6cc566-hk5dj: Scheduled |
| 22:20:10Z | k8s | Pod/gateway-659b5cb47d-n27mp: Started |
| 22:20:10Z | k8s | Pod/gateway-659b5cb47d-n27mp: Pulled |
| 22:20:10Z | k8s | Pod/gateway-659b5cb47d-n27mp: Created |
| 22:20:10Z | k8s | Pod/embedder-78996c4488-qx57j: Started |
| 22:20:10Z | k8s | Pod/embedder-78996c4488-qx57j: Pulled |
| 22:20:10Z | k8s | Pod/embedder-78996c4488-qx57j: Created |
| 22:20:11Z | k8s | ReplicaSet/model-proxy-7b757c8887: SuccessfulCreate |
| 22:20:11Z | k8s | Pod/model-proxy-6fbf6cc566-hk5dj: Pulled |
| 22:20:11Z | k8s | Pod/model-proxy-6fbf6cc566-hk5dj: Created |
| 22:20:11Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulDelete |
| 22:20:11Z | k8s | Pod/model-proxy-7b757c8887-qpqjx: Scheduled |
| 22:20:11Z | remediation | restart_workload gateway executed (run run_19f8be18e5761f) |
| 22:20:12Z | k8s | Pod/model-proxy-7b757c8887-qpqjx: Pulled |
| 22:20:12Z | k8s | Pod/model-proxy-7b757c8887-qpqjx: Created |
| 22:20:12Z | k8s | Pod/model-proxy-6fbf6cc566-hk5dj: Started |
| 22:20:13Z | k8s | Pod/model-proxy-7b757c8887-qpqjx: Started |
| 22:20:13Z | k8s | Pod/model-proxy-6fbf6cc566-hk5dj: Killing |
| 22:20:15Z | k8s | Job/seed: SuccessfulCreate |
| 22:20:15Z | k8s | Pod/seed-xqxj6: Scheduled |
| 22:20:16Z | k8s | Pod/seed-xqxj6: Started |
| 22:20:16Z | k8s | Pod/seed-xqxj6: Pulled |
| 22:20:16Z | k8s | Pod/seed-xqxj6: Created |
| 22:20:17Z | k8s | Pod/retriever-f958f966b-zvl72: Killing |
| 22:20:17Z | k8s | ReplicaSet/retriever-f958f966b: SuccessfulDelete |
| 22:20:17Z | k8s | ReplicaSet/retriever-59c9d56fcf: SuccessfulCreate |
| 22:20:17Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:20:17Z | k8s | Pod/embedder-677464dfc6-wmftp: Killing |
| 22:20:17Z | k8s | ReplicaSet/embedder-677464dfc6: SuccessfulDelete |
| 22:20:17Z | k8s | Deployment/embedder: ScalingReplicaSet |
| 22:20:17Z | k8s | Pod/retriever-59c9d56fcf-hhlhn: Scheduled |
| 22:20:18Z | k8s | Pod/gateway-8cdd67dd4-r6gfm: Killing |
| 22:20:18Z | k8s | ReplicaSet/gateway-8cdd67dd4: SuccessfulDelete |
| 22:20:19Z | k8s | Pod/seed-xqxj6: Started |
| 22:20:19Z | k8s | Pod/seed-xqxj6: Pulled |
| 22:20:19Z | k8s | Pod/seed-xqxj6: Created |
| 22:20:19Z | k8s | Pod/retriever-59c9d56fcf-hhlhn: Started |
| 22:20:19Z | k8s | Pod/retriever-59c9d56fcf-hhlhn: Pulled |
| 22:20:19Z | k8s | Pod/retriever-59c9d56fcf-hhlhn: Created |
| 22:20:19Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulDelete |
| 22:20:19Z | k8s | ReplicaSet/gateway-5fdcfbff4: SuccessfulCreate |
| 22:20:19Z | k8s | Pod/gateway-5fdcfbff4-72n9t: Scheduled |
| 22:20:20Z | k8s | ReplicaSet/model-proxy-7b757c8887: SuccessfulCreate |
| 22:20:20Z | k8s | Pod/model-proxy-6fbf6cc566-8l2z9: Killing |
| 22:20:20Z | k8s | Pod/gateway-5fdcfbff4-72n9t: Started |
| 22:20:20Z | k8s | Pod/gateway-5fdcfbff4-72n9t: Pulled |
| 22:20:20Z | k8s | Pod/gateway-5fdcfbff4-72n9t: Created |
| 22:20:20Z | k8s | Pod/model-proxy-7b757c8887-kb495: Scheduled |
| 22:20:21Z | k8s | Pod/model-proxy-7b757c8887-kb495: Started |
| 22:20:21Z | k8s | Pod/model-proxy-7b757c8887-kb495: Pulled |
| 22:20:21Z | k8s | Pod/model-proxy-7b757c8887-kb495: Created |
| 22:20:22Z | k8s | Pod/seed-xqxj6: BackOff |
| 22:20:27Z | k8s | Pod/retriever-f958f966b-v5795: Killing |
| 22:20:27Z | k8s | ReplicaSet/retriever-f958f966b: SuccessfulDelete |
| 22:20:27Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 22:20:29Z | k8s | Pod/model-proxy-6fbf6cc566-llv5c: Killing |
| 22:20:29Z | k8s | ReplicaSet/model-proxy-6fbf6cc566: SuccessfulDelete |
| 22:20:30Z | k8s | Pod/model-proxy-56848dd69-7sp7t: Started |
| 22:20:30Z | k8s | Pod/model-proxy-56848dd69-7sp7t: Pulled |
| 22:20:30Z | k8s | Pod/model-proxy-56848dd69-7sp7t: Created |
| 22:20:30Z | k8s | ReplicaSet/model-proxy-56848dd69: SuccessfulCreate |
| 22:20:30Z | k8s | Pod/model-proxy-56848dd69-7sp7t: Scheduled |
| 22:20:33Z | k8s | Pod/seed-xqxj6: Started |
| 22:20:33Z | k8s | Pod/seed-xqxj6: Pulled |
| 22:20:33Z | k8s | Pod/seed-xqxj6: Created |
| 22:20:35Z | k8s | Pod/seed-xqxj6: BackOff |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784758242888%22%2C+%22to%22%3A+%221784758542890%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784758242888%22%2C+%22to%22%3A+%221784758542890%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 "SLO gateway availability — fast burn" fired for tenant acme after the gateway's 5-minute error ratio climbed from a 0% baseline to a peak of ~9%, burning ~2% of the 28-day error budget within an hour.

## Impact
Gateway `POST /v1/chat` requests saw an elevated 400 error rate (gateway-side JSON body parse failures) plus a preceding wave of unusually slow (2.4s–5.1s), erroring multi-hop traces through embedder/retriever/model-proxy. The gateway latency SLO was also briefly and severely violated (5m error ratio ~95%) alongside the availability burn.

## Root cause
Two pre-check leads pointed at plausible-but-wrong causes and were ruled out with direct evidence before landing on the real one:
- **Stale secret** was ruled out: `secret_age` reported the DB credential unmodified since creation (no rotation event), and the ongoing "password authentication failed" errors in Loki were isolated to an unrelated `seed` Job/Postgres pair, not the gateway path.
- **Bad deploy** was ruled out for the *onset*: the only main-branch merge in the minutes before the error spike began was a postmortem-markdown-only PR; the actual gateway/model-proxy code deploy (commit 6e2d4af, gitops rev 4c4d19c85aff) landed a few minutes *after* the burst had already started, via an Argo Rollout canary — it did not cause the spike, though its rollout was already healthily replacing pods and visibly correcting the error ratio in Mimir before any manual action was taken.
- **Downstream crash/OOM** was ruled out: model-proxy, retriever, and embedder stable replicas showed 0 restarts, no warning events, and healthy liveness/readiness over many hours of uptime.

The evidence that held up: a burst of gateway-side `error: Malformed JSON in request body` (HTTP 400) logged across all three long-lived stable gateway replicas, immediately preceded by a cluster of abnormally slow, erroring chat traces through the downstream chain. The load-generator (gateway's primary caller) logged a "Polite quit request" SIGTERM right at the tail of the burst as the in-flight rollout began cycling it out — consistent with the bad-body burst being tied to that in-flight replica churn rather than any credential or code regression. The three original gateway replicas that served the entire burst window were still running unrestarted at investigation time.

## What fixed it
Per the gateway-high-error-rate runbook's mitigation step ("if errors correlate with a component, restart it"), the gateway workload was rolling-restarted (operator-approved, dry-run diff verified beforehand: annotation-only restart, no spec change). `alert_status` reported the alert resolved on the very next check, and `slo:gateway_availability:error_ratio5m` read back at 0 afterward.

## Lessons
- The stale-secret and bad-deploy leads are useful shortcuts but need their preconditions checked, not assumed — here neither held up under `secret_age` and `deploy_history` scrutiny, and treating either as the cause would have wasted the response.
- A concurrent, unrelated `seed` Job auth-failure loop was noisy in the same log window and could easily be mistaken for the gateway incident's cause; namespace/service-scoped log correlation was needed to separate them.
- Consider tightening gateway's request-body error handling/observability (e.g., tagging malformed-body 400s with the originating client/tenant) so a future occurrence can be attributed to a specific caller faster.
