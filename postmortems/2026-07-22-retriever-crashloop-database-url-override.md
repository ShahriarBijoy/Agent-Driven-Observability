# Postmortem: retriever pods are CrashLoopBackOff — new replicaset failing at startup

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:57:49Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:38:47Z | deploy:annotation | deploy embedder via gitops 6867477 (argo sync) |
| 22:39:23Z | deploy:ci | CI run #38 success on postmortem/inc_19f8bf69762af4: obs: postmortem: gateway-p95-stale-db-secret-recurrence |
| 22:39:59Z | deploy:ci | CI run #39 success on postmortem/inc_19f8bf69ceeafb: obs: postmortem: gateway-availability-stale-db-secret |
| 22:40:43Z | deploy:ci | CI run #40 success on postmortem/inc_19f8bf6a817b04: obs: postmortem: gateway-latency-stale-db-secret-recurrence |
| 22:41:51Z | deploy:ci | CI run #41 success on main: obs: Merge pull request 'Postmortem: gateway 5xx rate above 2%' (#13) from postmortem/inc_19f8bf3d2e2a3a into main

Revi |
| 22:42:28Z | deploy:ci | CI run #42 success on main: obs: Merge pull request 'Postmortem: gateway p95 latency above 2s' (#14) from postmortem/inc_19f8bf69762af4 into main

R |
| 22:43:04Z | deploy:ci | CI run #43 success on main: obs: Merge pull request 'Postmortem: gateway availability error budget burning fast (2% of the 28d budget in 1h; 5m & 1h |
| 22:43:33Z | deploy:ci | CI run #44 success on main: obs: Merge pull request 'Postmortem: gateway latency error budget burning fast (2% of the 28d budget in 1h; 5m & 1h wind |
| 22:44:42Z | deploy:annotation | deploy load-generator :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:42Z | deploy:annotation | deploy embedder :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:42Z | deploy:annotation | deploy model-proxy :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:42Z | deploy:annotation | deploy gateway :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:42Z | deploy:annotation | deploy retriever :da69fb7 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/41">ci #41</a>) |
| 22:44:44Z | deploy:annotation | deploy model-proxy :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy embedder :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy load-generator :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy gateway :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy retriever :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:47Z | deploy:argo | retriever synced to fcb43c0bcdc7 |
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
| 22:44:56Z | deploy:argo | retriever synced to 9ccc80cd2825 |
| 22:45:00Z | deploy:annotation | deploy load-generator via gitops 3ca8a89 (argo sync) |
| 22:45:05Z | deploy:argo | retriever synced to 3ca8a89f3b29 |
| 22:45:15Z | deploy:annotation | deploy retriever via gitops 3ca8a89 (argo sync) |
| 22:45:17Z | deploy:annotation | deploy embedder via gitops 3ca8a89 (argo sync) |
| 22:48:57Z | deploy:ci | CI run #45 success on postmortem/inc_19f8c024d9ce1d: obs: postmortem: gateway-model-proxy-canary-stuck-stale-db-secret |
| 22:52:39Z | deploy:annotation | deploy gateway via gitops 3ca8a89 (argo sync) |
| 22:52:41Z | deploy:annotation | deploy model-proxy via gitops 3ca8a89 (argo sync) |
| 22:57:14Z | deploy:ci | CI run #46 success on postmortem/inc_19f8c02947be29: obs: postmortem: gateway-latency-stale-db-secret |
| 22:57:48Z | log-spike | log-spike onset: 2026-07-22 22:57:48.382 UTC [223907] FATAL:  password authentication failed for user "lab" |
| 23:01:37Z | k8s | Pod/seed-fghrt: Killing |
| 23:01:38Z | k8s | Job/seed: BackoffLimitExceeded |
| 23:01:40Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:01:40Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:01:56Z | remediation | rollout_undo retriever executed (run run_19f8c0caf9afb5) |
| 23:01:57Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:01:57Z | k8s | Pod/retriever-65bd758646-phrss: Scheduled |
| 23:01:58Z | k8s | Pod/retriever-65bd758646-phrss: Started |
| 23:01:58Z | k8s | Pod/retriever-65bd758646-phrss: Pulled |
| 23:01:58Z | k8s | Pod/retriever-65bd758646-phrss: Created |
| 23:02:00Z | k8s | Pod/retriever-65bd758646-phrss: Started |
| 23:02:00Z | k8s | Pod/retriever-65bd758646-phrss: Pulled |
| 23:02:00Z | k8s | Pod/retriever-65bd758646-phrss: Created |
| 23:02:02Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:03Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:07Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:12Z | k8s | Pod/retriever-65bd758646-phrss: Started |
| 23:02:12Z | k8s | Pod/retriever-65bd758646-phrss: Pulled |
| 23:02:12Z | k8s | Pod/retriever-65bd758646-phrss: Created |
| 23:02:14Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:15Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:17Z | k8s | Pod/retriever-65bd758646-phrss: BackOff |
| 23:02:31Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:02:31Z | k8s | Deployment/retriever: ScalingReplicaSet |
| 23:02:37Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulCreate |
| 23:02:37Z | k8s | Pod/retriever-65bd758646-vg6tf: Scheduled |
| 23:02:38Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:02:38Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:02:38Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
| 23:02:40Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:02:40Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:02:40Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
| 23:02:41Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:02:44Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:02:47Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:02:53Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:02:53Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:02:53Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
| 23:02:54Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:02:55Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:02:57Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:03:19Z | k8s | Pod/retriever-65bd758646-vg6tf: Started |
| 23:03:19Z | k8s | Pod/retriever-65bd758646-vg6tf: Pulled |
| 23:03:19Z | k8s | Pod/retriever-65bd758646-vg6tf: Created |
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
| 23:05:36Z | k8s | Pod/retriever-65bd758646-vg6tf: BackOff |
| 23:05:36Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:05:40Z | remediation | rollout_undo retriever executed (run run_19f8c0caf9afb5) |
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
| 2026-07-23 00:00:00Z | alert | alert firing: KubePodCrashLooping |

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761069447%22%2C+%22to%22%3A+%221784761600180%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761069447%22%2C+%22to%22%3A+%221784761600180%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
`KubePodCrashLooping` (sev1) fired for the `retriever` deployment in `subject`. New `retriever` pods enter CrashLoopBackOff immediately on start, exit code 1, with zero application log output before death.

## Impact
Only the older, pre-existing ReplicaSet (`retriever-648998cdc5`, image `605be30`, clean env) has a Ready pod and is serving traffic; every pod from the newer ReplicaSet (`retriever-65bd758646`, same image `605be30`) crashes within seconds of starting, so the deployment sits permanently at 1 available / 1 unavailable. Around the same window the `gateway` canary rollout (revision 37) also failed its `canary-error-rate` analysis and was aborted, consistent with degraded retriever availability affecting downstream request paths.

## Root cause
`kubectl describe deployment/retriever` shows the live pod template carries an explicit env var `DATABASE_URL: garbage` layered on top of the normal `subject-db-credentials` secret-sourced config. `garbage` is not a valid Postgres connection string, so the Bun/postgres.js client throws during client construction before the app's logger initializes — explaining the complete absence of log lines from the crashing pod (confirmed via `loki_query` against the exact pod name: zero results across every window tried, while the sibling healthy pod on the same image logs normally, including unrelated Postgres auth errors from a separate, non-blocking issue).

This override is **not** attributable to a tracked deploy: `deploy_history` shows retriever's last legitimate gitops sync landed commit `3ca8a89` / image `605be30` with a clean template — proven by the sibling ReplicaSet `retriever-648998cdc5` running that exact same image without the bad env. Both crashing and rolled-back ReplicaSets also carry a fixed `kubectl.kubernetes.io/restartedAt: 2026-07-23T00:55:57+02:00` annotation that reappeared byte-for-byte, unchanged, after each remediation — meaning the identical faulty PodTemplateHash (`65bd758646`) keeps being re-asserted on the live Deployment object from outside the normal CI/gitops delivery path, rather than this being a one-off bad commit.

## What fixed it
Followed the `k8s-crashloop.md` runbook: confirmed no legitimate deploy explained the failure, inspected pod env/image and logs, then ran `rollout_undo` on `retriever` (approved) to drop the bad env and return to the prior known-good revision. This was attempted **twice** after the first rollback was reverted within roughly a minute, with the fault reappearing unchanged on a fresh pod under the same ReplicaSet hash. Both rollbacks executed successfully against the Kubernetes API, but neither held — `alert_status` flapped inactive→active on essentially the same cadence each time, and the crashing ReplicaSet kept resurfacing with identical content.

**As of closing this incident, `KubePodCrashLooping` is still ACTIVE. Remediation did not achieve durable recovery.**

## Lessons
- `rollout_undo` is the right first response per the crashloop runbook, and it repeatedly succeeded mechanically — but it cannot outrun something that keeps re-applying the exact same bad PodTemplateHash to the live Deployment object faster than the rollback can settle. The next responder needs to find and stop whatever is patching `subject/retriever`'s Deployment spec out-of-band (it does not correlate with any CI run or gitops commit in `deploy_history`) rather than continuing to fight it with repeated manual rollbacks.
- Consider a policy/admission check that rejects non-gitops mutations to Argo-tracked Deployments in `subject`, so drift like this surfaces as OutOfSync instead of silently reappearing.
- Capacity risk while this remains open: only one healthy retriever replica is serving; a failure of that single pod would cause a full outage rather than a partial one.
