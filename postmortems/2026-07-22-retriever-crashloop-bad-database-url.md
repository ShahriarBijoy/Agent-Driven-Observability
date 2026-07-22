# Postmortem: subject/retriever-65bd758646-ccc6s has been not-ready for 2 minutes (readiness probe or startup trouble)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:59:57Z
- **Resolved:** 2026-07-22 23:04:57Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:44:44Z | deploy:annotation | deploy model-proxy :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy embedder :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy load-generator :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
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
| 22:59:20Z | alert | alert firing: KubePodNotReady |
| 22:59:20Z | alert | alert resolved: KubePodNotReady |
| 22:59:55Z | log-spike | log-spike onset: [retriever] unhandled error: 36 \|   async queryWithCache(queryString, params, query) { |
| 23:02:36Z | remediation | rollout_undo retriever executed (run run_19f8c0ea2231004) |
| 23:03:19Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:03:19Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:03:20Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:03:22Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:03:27Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:03:58Z | deploy:ci | CI run #47 success on postmortem/inc_19f8c0db411fe0: obs: postmortem: retriever-crashloop-bad-database-url-env |
| 23:04:07Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:04:07Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:04:07Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
| 23:04:11Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:04:13Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:04:17Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:04:23Z | k8s | Job/seed: SuccessfulCreate |
| 23:04:23Z | k8s | Pod/seed-5v8tp: Scheduled |
| 23:04:24Z | k8s | Pod/seed-5v8tp: Started |
| 23:04:24Z | k8s | Pod/seed-5v8tp: Pulled |
| 23:04:24Z | k8s | Pod/seed-5v8tp: Created |
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
| 23:05:35Z | remediation | rollout_undo retriever executed (run run_19f8c0ea2231004) |
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
| 23:15:02Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:15:02Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:15:02Z | k8s | Pod/retriever-65bd758646-tb2bm: Scheduled |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Started |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Pulled |
| 23:15:03Z | k8s | Pod/retriever-65bd758646-tb2bm: Created |
| 23:15:04Z | k8s | Pod/retriever-65bd758646-tb2bm: Pulled |
| 23:15:04Z | k8s | Pod/retriever-65bd758646-tb2bm: Created |
| 23:15:05Z | k8s | Pod/retriever-65bd758646-tb2bm: Started |
| 23:15:05Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:15:05Z | remediation | rollout_undo retriever executed (run run_19f8c0ea2231004) |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761197078%22%2C+%22to%22%3A+%221784761497048%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761197078%22%2C+%22to%22%3A+%221784761497048%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubePodNotReady (sev1) fired for `subject/retriever-65bd758646-ccc6s`: the pod was stuck in CrashLoopBackOff and never reached readiness.

## Impact
The `retriever` Deployment ran with reduced/degraded capacity — one healthy replica (`retriever-648998cdc5-*`) kept serving traffic while a second, continuously-recreated replica under ReplicaSet `retriever-65bd758646` crashed on every startup attempt.

## Root cause
`kubectl describe pod` on the alerting pod showed a hardcoded container env var `DATABASE_URL: garbage` — a literal string, not sourced from `subject-db-credentials` (that secret's other keys were mounted normally via `envFrom` and are unrelated/healthy; `secret_age` precheck confirmed the secret itself was not recently rotated). This matches the log-spike lead: `[retriever] unhandled error: ... async queryWithCache(...)` — the retriever process fails immediately on startup because it cannot open a DB connection with an invalid connection string, fails its readiness/liveness probe, and CrashLoopBackOffs.

`kubectl describe deployment retriever` confirmed this bad `DATABASE_URL` was baked directly into the Deployment's live pod template (`NewReplicaSet: retriever-65bd758646`, `deployment.kubernetes.io/revision` climbing rapidly), alongside a second, good ReplicaSet (`retriever-648998cdc5`, no bad env var, fully healthy). Argo CD (`argo_app` for `retriever`) reported `Synced` against gitops revision `3ca8a89f3b29` with no new sync **operation** recorded across the whole incident, which rules out a fresh GitOps push/self-heal sync as the mechanism — something was repeatedly re-patching the live Deployment's pod template directly (toggling it back to the broken `DATABASE_URL=garbage` template roughly every ~3 minutes), independent of the tracked git revision. That reassertion mechanism sits outside the tools available to this on-call session (no gitops-repo write access, no Argo Application-level sync control) and should be treated as an environment fact to fix out of band, not chased further here.

## What fixed it
Per the k8s-crashloop runbook, this was diagnosed as a bad-revision crashloop. Used `rollout_undo` on `deployment/retriever` (dry-run reviewed and operator-approved each time) to roll the Deployment back from the broken template to the previous good revision. This had to be applied three times in this session because the broken template kept reappearing on its own on a ~3 minute cadence; each rollback immediately restored the healthy `retriever-648998cdc5` pod. `alert_status` for `KubePodNotReady` reports resolved and has held across repeated re-polls, though a freshly-recreated pod under the same bad ReplicaSet (`retriever-65bd758646-pr5vp`) is still visibly crash-looping at the time of this postmortem — it had not yet aged past the alert's 2-minute not-ready threshold on the last check.

## Lessons
- `DATABASE_URL` should never be settable as a plain literal env var override in the retriever Deployment template — it should only ever come from the `subject-db-credentials` Secret, so a bad literal can't silently shadow it. Add a policy/admission check to reject non-secret-sourced `DATABASE_URL`.
- Whatever is directly patching this Deployment's pod template outside of the recorded Argo sync operations needs to be found and fixed at the source (or made to go through gitops so it's diff-able) — `kubectl rollout undo` is only a temporary mitigation against it, not a durable fix, since the on-call toolset here has no gitops-repo or Argo sync-level access.
- Consider a dedicated `KubePodNotReady`/crashloop runbook variant that explicitly calls out "check for a second, differently-templated ReplicaSet running concurrently" — that comparison (`648998cdc5` vs `65bd758646`) was what actually revealed the bad env var quickly.
