# Postmortem: a high-severity data-quality violation fired in the last 5 minutes

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 19:38:00Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 19:33:01Z | deploy:ci | CI run #17 success on postmortem/inc_19f8b4932351: obs: postmortem: gateway-5xx-storm-self-recovered |
| 19:37:30Z | alert | alert firing: DQ high-severity violation |
| 19:37:50Z | log-spike | log-spike onset: {"level":"warn","service":"retriever","message":"lineage emit failed","trace_id":"6f8f00a96d48831a641568c3244bae99","span_id":"06fc1859aaf9e222","time":"2026-07-22T19:37:50.038Z","reason":"The operation timed out.","job":"rag.retrieve","eventType":"COMPLETE"} |
| 19:38:56Z | k8s | Job/seed: SuccessfulCreate |
| 19:38:57Z | k8s | Pod/seed-mxgvc: Started |
| 19:38:57Z | k8s | Pod/seed-mxgvc: Pulled |
| 19:38:57Z | k8s | Pod/seed-mxgvc: Created |
| 19:38:57Z | k8s | Pod/seed-mxgvc: Scheduled |
| 19:39:00Z | k8s | Pod/seed-mxgvc: Started |
| 19:39:00Z | k8s | Pod/seed-mxgvc: Pulled |
| 19:39:00Z | k8s | Pod/seed-mxgvc: Created |
| 19:39:03Z | k8s | Pod/seed-mxgvc: BackOff |
| 19:39:14Z | k8s | Pod/seed-mxgvc: Started |
| 19:39:14Z | k8s | Pod/seed-mxgvc: Pulled |
| 19:39:14Z | k8s | Pod/seed-mxgvc: Created |
| 19:39:15Z | k8s | Rollout/gateway: RolloutUpdated |
| 19:39:15Z | k8s | Rollout/gateway: RolloutNotCompleted |
| 19:39:15Z | k8s | Rollout/gateway: NewReplicaSetCreated |
| 19:39:16Z | k8s | Pod/seed-mxgvc: BackOff |
| 19:39:16Z | k8s | Pod/gateway-777dd5847b-lnwbd: Unhealthy |
| 19:39:16Z | k8s | Pod/gateway-777dd5847b-lnwbd: Killing |
| 19:39:16Z | k8s | ReplicaSet/gateway-777dd5847b: SuccessfulDelete |
| 19:39:16Z | k8s | ReplicaSet/gateway-6d75697f86: SuccessfulCreate |
| 19:39:16Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 19:39:16Z | k8s | Pod/gateway-6d75697f86-bdb9c: Scheduled |
| 19:39:17Z | k8s | ReplicaSet/retriever-69d4959dfb: SuccessfulCreate |
| 19:39:17Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 19:39:17Z | k8s | Pod/retriever-69d4959dfb-f2vdc: Scheduled |
| 19:39:18Z | k8s | Pod/retriever-69d4959dfb-f2vdc: Started |
| 19:39:18Z | k8s | Pod/retriever-69d4959dfb-f2vdc: Pulled |
| 19:39:18Z | k8s | Pod/retriever-69d4959dfb-f2vdc: Created |
| 19:39:18Z | k8s | Pod/gateway-6d75697f86-bdb9c: Started |
| 19:39:18Z | k8s | Pod/gateway-6d75697f86-bdb9c: Pulled |
| 19:39:18Z | k8s | Pod/gateway-6d75697f86-bdb9c: Created |
| 19:39:25Z | k8s | Pod/retriever-5865685ccc-s27qf: Killing |
| 19:39:25Z | k8s | ReplicaSet/retriever-5865685ccc: SuccessfulDelete |
| 19:39:25Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 19:39:25Z | k8s | Rollout/gateway: RolloutStepCompleted |
| 19:39:26Z | k8s | Rollout/gateway: AnalysisRunRunning |
| 19:39:40Z | k8s | Pod/seed-mxgvc: Started |
| 19:39:40Z | k8s | Pod/seed-mxgvc: Pulled |
| 19:39:40Z | k8s | Pod/seed-mxgvc: Created |
| 19:39:41Z | k8s | Pod/seed-mxgvc: Killing |
| 19:39:41Z | k8s | Job/seed: SuccessfulDelete |
| 19:39:43Z | k8s | Job/seed: BackoffLimitExceeded |
| 19:39:58Z | k8s | Job/seed: SuccessfulCreate |
| 19:39:58Z | k8s | Pod/seed-h6nz2: Scheduled |
| 19:39:59Z | k8s | Pod/seed-h6nz2: Started |
| 19:39:59Z | k8s | Pod/seed-h6nz2: Pulled |
| 19:39:59Z | k8s | Pod/seed-h6nz2: Created |
| 19:40:02Z | k8s | Pod/seed-h6nz2: Started |
| 19:40:02Z | k8s | Pod/seed-h6nz2: Pulled |
| 19:40:02Z | k8s | Pod/seed-h6nz2: Created |
| 19:40:04Z | k8s | Pod/seed-h6nz2: BackOff |
| 19:40:16Z | k8s | Pod/seed-h6nz2: Started |
| 19:40:16Z | k8s | Pod/seed-h6nz2: Pulled |
| 19:40:16Z | k8s | Pod/seed-h6nz2: Created |
| 19:40:19Z | k8s | Pod/seed-h6nz2: BackOff |
| 19:40:25Z | k8s | AnalysisRun/gateway-6d75697f86-15-1: MetricFailed |
| 19:40:25Z | k8s | AnalysisRun/gateway-6d75697f86-15-1: AnalysisRunFailed |
| 19:40:26Z | k8s | Rollout/gateway: RolloutAborted |
| 19:40:26Z | k8s | Rollout/gateway: AnalysisRunFailed |
| 19:40:27Z | k8s | ReplicaSet/gateway-777dd5847b: SuccessfulCreate |
| 19:40:27Z | k8s | Pod/gateway-6d75697f86-bdb9c: Killing |
| 19:40:27Z | k8s | ReplicaSet/gateway-6d75697f86: SuccessfulDelete |
| 19:40:27Z | k8s | Rollout/gateway: ScalingReplicaSet |
| 19:40:27Z | k8s | Pod/gateway-777dd5847b-dtwzj: Scheduled |
| 19:40:28Z | k8s | Pod/gateway-777dd5847b-dtwzj: Started |
| 19:40:28Z | k8s | Pod/gateway-777dd5847b-dtwzj: Pulled |
| 19:40:28Z | k8s | Pod/gateway-777dd5847b-dtwzj: Created |
| 19:40:40Z | k8s | Pod/seed-h6nz2: Started |
| 19:40:40Z | k8s | Pod/seed-h6nz2: Pulled |
| 19:40:40Z | k8s | Pod/seed-h6nz2: Created |
| 19:40:42Z | k8s | Pod/seed-h6nz2: BackOff |
| 19:40:42Z | k8s | Job/seed: SuccessfulDelete |
| 19:40:44Z | k8s | Job/seed: BackoffLimitExceeded |
| 19:41:09Z | k8s | Job/seed: SuccessfulCreate |
| 19:41:09Z | k8s | Pod/seed-zd9dq: Scheduled |
| 19:41:10Z | k8s | Pod/seed-zd9dq: Started |
| 19:41:10Z | k8s | Pod/seed-zd9dq: Pulled |
| 19:41:10Z | k8s | Pod/seed-zd9dq: Created |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784749080061%22%2C+%22to%22%3A+%221784749272551%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784749080061%22%2C+%22to%22%3A+%221784749272551%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
Sev1 `DQ high-severity violation` fired for the `inferences` dataset. The dq-runner's freshness and volume checks flagged **all three tenants** (acme, bravo, abuser) at once — not a single tenant, which is the key signal this is a real pipeline stall rather than the runbook's "stale-by-design" hypothesis.

## Impact
Zero new `inferences` rows were written for any tenant from the stall onset onward. Freshness climbed linearly with wall-clock time across two independent checks (~145s → ~295s and counting) with no new rows appearing, confirming an ongoing outage, not a blip. Any downstream consumer of the `inferences` table (RAG quality dashboards, billing/usage rollups, lineage graph) was blind for the duration.

## Root cause
- `deploy_history` shows no deploy in the last 3 hours (only steady-state rollout status and one CI entry tied to an already-closed, unrelated prior incident) — ruling out the reflex "bad deploy" explanation per the pre-check lead.
- `pg_select` against `dq_violations` and `inferences` shows every tenant's last successful write landed within ~2 seconds of each other, then stopped completely and simultaneously — a synchronized, pipeline-wide halt rather than per-tenant traffic drying up.
- This coincides exactly with the pre-check log-spike lead: the `retriever` service logged a burst of `lineage emit failed` warnings (200x baseline) with `reason: "The operation timed out"` on the `rag.retrieve` job's completion event, right as writes stopped.
- kube_scan/rollout_state pre-checks show all pods `Ready` with no restarts and no failed canary analysis — consistent with the retriever process being alive but **hung**, not crashed.
- Most consistent explanation: the retriever's OpenLineage emit call on the `rag.retrieve` completion path is synchronous/blocking. A slow or unreachable lineage backend causes that call to hang/time out, which in turn blocks finalization of the corresponding `inferences` row for every tenant sharing that code path — explaining the simultaneous, full stop across all three tenants.

## What fixed it
Nothing yet — **not resolved**. The runbook's mitigation step ("restart the producing job") requires a workload-restart capability that was not in this incident's granted toolset (diagnostics/reporting tools only: alert/deploy/metrics/DB queries, approval, and postmortem — no restart/rollout/scale tool). Two `alert_status` checks ~2 minutes apart both showed the alert still firing with freshness still climbing, confirming this will not self-heal without intervention. Escalating: a human operator needs to restart the `retriever` deployment (or recover/bypass its OpenLineage/Marquez client) to clear the hang.

## Lessons
1. The retriever's OpenLineage emit on the `rag.retrieve` completion path appears to be synchronous and blocking — a degraded lineage backend can take down primary inference ingestion for every tenant at once. It should be made async/fire-and-forget with a bounded timeout so lineage-backend health can't stall the write path.
2. This alert class currently has no executable remediation in the on-call tool grant — add a scoped restart action for `retriever` (or the dq-runner) so freshness-stall incidents don't dead-end at diagnosis.
3. Add an OpenLineage/Marquez backend reachability check to this alert's pre-check leads so "lineage backend degraded" is surfaced directly alongside the runbook's three existing hypotheses instead of requiring manual log correlation to find it.
