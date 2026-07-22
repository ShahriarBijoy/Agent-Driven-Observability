# Postmortem: subject/retriever-65bd758646-vg6tf container retriever is in CrashLoopBackOff

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 23:04:56Z
- **Resolved:** 2026-07-22 23:09:56Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:44:44Z | deploy:annotation | deploy model-proxy :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
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
| 22:48:57Z | deploy:ci | CI run #45 success on postmortem/inc_19f8c024d9ce1d: obs: postmortem: gateway-model-proxy-canary-stuck-stale-db-secret |
| 22:52:39Z | deploy:annotation | deploy gateway via gitops 3ca8a89 (argo sync) |
| 22:52:41Z | deploy:annotation | deploy model-proxy via gitops 3ca8a89 (argo sync) |
| 22:57:14Z | deploy:ci | CI run #46 success on postmortem/inc_19f8c02947be29: obs: postmortem: gateway-latency-stale-db-secret |
| 23:03:58Z | deploy:ci | CI run #47 success on postmortem/inc_19f8c0db411fe0: obs: postmortem: retriever-crashloop-bad-database-url-env |
| 23:04:20Z | alert | alert firing: KubePodCrashLooping |
| 23:04:24Z | k8s | Pod/seed-5v8tp: Pulled |
| 23:04:27Z | k8s | Pod/seed-5v8tp: Started |
| 23:04:27Z | k8s | Pod/seed-5v8tp: Pulled |
| 23:04:27Z | k8s | Pod/seed-5v8tp: Created |
| 23:04:29Z | k8s | Pod/seed-5v8tp: BackOff |
| 23:04:43Z | k8s | Pod/seed-5v8tp: Started |
| 23:04:43Z | k8s | Pod/seed-5v8tp: Pulled |
| 23:04:43Z | k8s | Pod/seed-5v8tp: Created |
| 23:04:45Z | k8s | Pod/seed-5v8tp: BackOff |
| 23:05:07Z | k8s | Pod/seed-5v8tp: Started |
| 23:05:07Z | k8s | Pod/seed-5v8tp: Pulled |
| 23:05:07Z | k8s | Pod/seed-5v8tp: Created |
| 23:05:08Z | k8s | Pod/seed-5v8tp: Killing |
| 23:05:08Z | k8s | Job/seed: SuccessfulDelete |
| 23:05:09Z | k8s | Job/seed: BackoffLimitExceeded |
| 23:05:33Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:05:33Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:05:33Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
| 23:05:35Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:05:36Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:05:36Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:05:41Z | k8s | Pod/retriever-65bd758646-gd8g9: Pulled |
| 23:05:41Z | k8s | Pod/retriever-65bd758646-gd8g9: Created |
| 23:05:41Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:05:41Z | k8s | Pod/retriever-65bd758646-gd8g9: Scheduled |
| 23:05:42Z | k8s | Pod/retriever-65bd758646-gd8g9: Started |
| 23:05:43Z | k8s | Pod/retriever-65bd758646-gd8g9: Started |
| 23:05:43Z | k8s | Pod/retriever-65bd758646-gd8g9: Pulled |
| 23:05:43Z | k8s | Pod/retriever-65bd758646-gd8g9: Created |
| 23:05:44Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:05:47Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:05:51Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:05:55Z | k8s | Pod/retriever-65bd758646-gd8g9: Started |
| 23:05:55Z | k8s | Pod/retriever-65bd758646-gd8g9: Pulled |
| 23:05:55Z | k8s | Pod/retriever-65bd758646-gd8g9: Created |
| 23:05:56Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:05:57Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:06:01Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:06:22Z | k8s | Pod/retriever-65bd758646-gd8g9: Started |
| 23:06:22Z | k8s | Pod/retriever-65bd758646-gd8g9: Pulled |
| 23:06:22Z | k8s | Pod/retriever-65bd758646-gd8g9: Created |
| 23:06:23Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:06:27Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:06:31Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:06:47Z | deploy:ci | CI run #48 success on postmortem/inc_19f8c0caf84fb3: obs: postmortem: retriever-crashloop-database-url-override |
| 23:07:15Z | k8s | Pod/retriever-65bd758646-gd8g9: Started |
| 23:07:15Z | k8s | Pod/retriever-65bd758646-gd8g9: Pulled |
| 23:07:15Z | k8s | Pod/retriever-65bd758646-gd8g9: Created |
| 23:07:17Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:07:21Z | k8s | Pod/retriever-65bd758646-gd8g9: BackOff |
| 23:07:59Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:07:59Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:08:20Z | alert | alert resolved: KubePodCrashLooping |
| 23:15:02Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:15:02Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:15:02Z | k8s | Pod/retriever-65bd758646-tb2bm: Scheduled |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Started |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Pulled |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Created |
| 23:15:04Z | k8s | Pod/retriever-65bd758646-tb2bm: Pulled |
| 23:15:04Z | k8s | Pod/retriever-65bd758646-tb2bm: Created |
| 23:15:04Z | remediation | rollout_undo retriever executed (run run_19f8c1331ee1108) |
| 23:15:05Z | k8s | Pod/retriever-65bd758646-tb2bm: Started |
| 23:15:05Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:15:06Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:15:06Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:15:06Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:15:06Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:15:06Z | k8s | Pod/retriever-65bd758646-pr5vp: Scheduled |
| 23:15:08Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:15:08Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:15:08Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:15:09Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:10Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:12Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:16Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:20Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:15:20Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:15:20Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:15:22Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:23Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:26Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:43Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:15:43Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:15:43Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:15:44Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:46Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:15:57Z | deploy:ci | CI run #49 success on postmortem/inc_19f8c0ea2171002: obs: postmortem: retriever-crashloop-bad-database-url |
| 23:16:29Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:16:29Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:16:29Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:16:31Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:16:36Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:17:43Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:17:54Z | k8s | Pod/retriever-65bd758646-pr5vp: Started |
| 23:17:54Z | k8s | Pod/retriever-65bd758646-pr5vp: Pulled |
| 23:17:54Z | k8s | Pod/retriever-65bd758646-pr5vp: Created |
| 23:17:56Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:17:57Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:17:58Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:18:08Z | deploy:ci | CI run #50 success on postmortem/inc_19f8c14202d112a: obs: postmortem: retriever-crashloop-hardcoded-database-url |
| 23:19:01Z | k8s | Pod/retriever-65bd758646-pr5vp: BackOff |
| 23:19:15Z | remediation | rollout_undo retriever executed (run run_19f8c1331ee1108) |
| 23:19:16Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:19:16Z | k8s | Deployment/retriever: ScalingReplicaSet |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761496034%22%2C+%22to%22%3A+%221784761796030%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761496034%22%2C+%22to%22%3A+%221784761796030%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
`KubePodCrashLooping` (sev1) fired for `subject/retriever-65bd758646-vg6tf`. The retriever deployment's ReplicaSet was stuck in CrashLoopBackOff, container exiting with code 1 on every start.

## Impact
Retriever was unavailable (0/1 ready) for the duration of the crashloop, degrading any gateway request path that depends on retrieval.

## Root cause
`kubectl describe pod` on the crashing pod showed a literal, invalid environment value directly on the container spec: `DATABASE_URL: garbage` — not sourced from the `subject-db-credentials` Secret like the rest of the DB config. This was introduced on the retriever Deployment (same image `605be30` across the change, so it was a config-only edit, not a code/image regression) shortly after the 22:44 image deploy, matching the runbook's "bad env/config introduced at startup" hypothesis. The container's DB client failed to parse/connect against `garbage` and exited immediately, producing the crashloop.

Notably, during remediation the bad `DATABASE_URL: garbage` value reappeared on the live Deployment multiple times (deployment revision climbed from 62 to 68, oscillating between the good and bad pod template several times) even though the Argo CD Application for retriever has `selfHeal: false` and had not run a new sync since 22:45 — so this was not GitOps self-healing. The oscillation was an environment-level fact outside the scope of the available diagnostic tools to fully attribute; the important, evidenced fact is that the live Deployment spec kept reverting to the bad env value independent of Argo.

## What fixed it
Ran the runbook's prescribed mitigation, `rollout_undo` on `retriever`, rolling the Deployment back to the last-known-good revision (env sourced only from the secret, no literal `DATABASE_URL` override). This was required twice — the first rollback (revision 63→62) held only briefly before the bad env reappeared (revision climbed to 67); a second rollback (67→66, converging to the good template at revision 68) held. Verified via live `kubectl describe deployment` (no more `DATABASE_URL` literal, `NewReplicaSet` = the healthy pod-template hash, 1/1 ready, old bad ReplicaSet scaled to 0/0) and repeated `alert_status` checks reporting the alert inactive.

## Lessons
- Treat "the rollback held" as unverified until a second, later check — this Deployment's spec flapped between good and bad several times over ~20 minutes, and a single post-rollback check would have been misleadingly reassuring.
- The bad value was a literal env override that bypassed the Secret-backed `DATABASE_URL` — worth adding a validating admission check or CI lint that rejects literal `DATABASE_URL`/credential-shaped env entries on Deployments that are supposed to source them from a Secret.
- Confirm remediation against the live cluster object (`kubectl describe deployment`), not just the Loki-backed event/log stream, which showed ingestion lag relative to the real-time API state during this incident.
