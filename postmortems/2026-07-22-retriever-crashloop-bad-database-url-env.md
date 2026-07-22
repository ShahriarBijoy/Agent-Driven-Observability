# Postmortem: subject/retriever-65bd758646-ccc6s container retriever is in CrashLoopBackOff

- **Status:** open
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 22:58:56Z
- **Resolved:** (still open)

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
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
| 22:48:57Z | deploy:ci | CI run #45 success on postmortem/inc_19f8c024d9ce1d: obs: postmortem: gateway-model-proxy-canary-stuck-stale-db-secret |
| 22:52:39Z | deploy:annotation | deploy gateway via gitops 3ca8a89 (argo sync) |
| 22:52:41Z | deploy:annotation | deploy model-proxy via gitops 3ca8a89 (argo sync) |
| 22:57:14Z | deploy:ci | CI run #46 success on postmortem/inc_19f8c02947be29: obs: postmortem: gateway-latency-stale-db-secret |
| 22:57:46Z | k8s | Pod/seed-n2n6j: Started |
| 22:57:46Z | k8s | Pod/seed-n2n6j: Pulled |
| 22:57:46Z | k8s | Pod/seed-n2n6j: Created |
| 22:57:47Z | k8s | Pod/seed-n2n6j: Killing |
| 22:57:47Z | k8s | Job/seed: SuccessfulDelete |
| 22:57:50Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:58:04Z | k8s | Pod/retriever-65bd758646-ccc6s: Started |
| 22:58:04Z | k8s | Pod/retriever-65bd758646-ccc6s: Pulled |
| 22:58:04Z | k8s | Pod/retriever-65bd758646-ccc6s: Created |
| 22:58:07Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:58:13Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:58:20Z | alert | alert firing: KubePodCrashLooping |
| 22:58:36Z | k8s | Job/seed: SuccessfulCreate |
| 22:58:36Z | k8s | Pod/seed-ttk78: Scheduled |
| 22:58:38Z | k8s | Pod/seed-ttk78: Started |
| 22:58:38Z | k8s | Pod/seed-ttk78: Pulled |
| 22:58:38Z | k8s | Pod/seed-ttk78: Created |
| 22:58:41Z | k8s | Pod/seed-ttk78: Started |
| 22:58:41Z | k8s | Pod/seed-ttk78: Pulled |
| 22:58:41Z | k8s | Pod/seed-ttk78: Created |
| 22:58:44Z | k8s | Pod/seed-ttk78: BackOff |
| 22:58:54Z | log-spike | log-spike onset: 41 \|         throw new DrizzleQueryError(queryString, params, e); |
| 22:58:56Z | k8s | Pod/seed-ttk78: Started |
| 22:58:56Z | k8s | Pod/seed-ttk78: Pulled |
| 22:58:56Z | k8s | Pod/seed-ttk78: Created |
| 22:58:58Z | k8s | Pod/seed-ttk78: BackOff |
| 22:59:20Z | k8s | Pod/seed-ttk78: Started |
| 22:59:20Z | k8s | Pod/seed-ttk78: Pulled |
| 22:59:20Z | k8s | Pod/seed-ttk78: Created |
| 22:59:21Z | k8s | Pod/seed-ttk78: Killing |
| 22:59:21Z | k8s | Job/seed: SuccessfulDelete |
| 22:59:22Z | k8s | Job/seed: BackoffLimitExceeded |
| 22:59:26Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:59:28Z | k8s | Pod/retriever-65bd758646-ccc6s: Started |
| 22:59:28Z | k8s | Pod/retriever-65bd758646-ccc6s: Pulled |
| 22:59:28Z | k8s | Pod/retriever-65bd758646-ccc6s: Created |
| 22:59:30Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 22:59:33Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 23:00:47Z | k8s | Job/seed: SuccessfulCreate |
| 23:00:48Z | k8s | Pod/retriever-65bd758646-ccc6s: BackOff |
| 23:00:48Z | k8s | Pod/seed-fghrt: Started |
| 23:00:48Z | k8s | Pod/seed-fghrt: Pulled |
| 23:00:48Z | k8s | Pod/seed-fghrt: Created |
| 23:00:48Z | k8s | Pod/seed-fghrt: Scheduled |
| 23:00:50Z | k8s | Pod/seed-fghrt: Started |
| 23:00:50Z | k8s | Pod/seed-fghrt: Pulled |
| 23:00:50Z | k8s | Pod/seed-fghrt: Created |
| 23:00:52Z | k8s | Pod/seed-fghrt: BackOff |
| 23:01:06Z | k8s | Pod/seed-fghrt: Started |
| 23:01:06Z | k8s | Pod/seed-fghrt: Pulled |
| 23:01:06Z | k8s | Pod/seed-fghrt: Created |
| 23:01:08Z | k8s | Pod/seed-fghrt: BackOff |
| 23:01:35Z | k8s | Pod/seed-fghrt: Started |
| 23:01:35Z | k8s | Pod/seed-fghrt: Pulled |
| 23:01:35Z | k8s | Pod/seed-fghrt: Created |
| 23:01:36Z | k8s | Job/seed: SuccessfulDelete |
| 23:01:37Z | k8s | Pod/seed-fghrt: Killing |
| 23:01:38Z | k8s | Job/seed: BackoffLimitExceeded |
| 23:01:40Z | k8s | ReplicaSet/retriever-65bd758646: SuccessfulDelete |
| 23:01:40Z | k8s | Deployment/retriever: ScalingReplicaSet |
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
| 23:02:30Z | remediation | rollout_undo retriever executed (run run_19f8c0db422fe2) |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761136146%22%2C+%22to%22%3A+%221784761430739%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761136146%22%2C+%22to%22%3A+%221784761430739%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubePodCrashLooping fired for `subject/retriever-65bd758646-ccc6s` (container `retriever` in CrashLoopBackOff).

## Impact
The retriever workload ran with a mix of one healthy pod (old replicaset `retriever-648998cdc5`) and one perpetually crashing pod (new replicaset `retriever-65bd758646`), reducing retriever capacity/redundancy and generating a 200x baseline spike of `error`/`failed` log lines (Drizzle ORM query errors) during the crash window.

## Root cause
The live `retriever` Deployment's pod template carries a hardcoded environment override `DATABASE_URL: garbage`, layered on top of the normal `subject-db-credentials` Secret-derived config. This is a config-only regression, not a bad image/code deploy: the crashing replicaset (`retriever-65bd758646`) and the last known-good replicaset (`retriever-648998cdc5`) both run the identical image tag `605be30` — only the pod template env differs. The bad template was only realized in running pods once a rolling restart (`kubectl.kubernetes.io/restartedAt` annotation) was stamped on the deployment, at which point the app crashed on startup trying to open a DB connection with an invalid `DATABASE_URL`, throwing `DrizzleQueryError`.

Deploy correlation: no retriever image/CI deploy occurred immediately before onset — the most recent retriever CI deploy (`605be30`, ci run #44) had already been running successfully on the prior replicaset. The proximate trigger was a manifest/rollout-level change (gitops-synced Deployment revision) that introduced the bad `DATABASE_URL` value and a subsequent restart that rolled it out.

## What fixed it
Confirmed via `kubectl describe`/`get replicasets` that only the env var differed between the healthy and crashing revisions (same image). Dry-ran and, after operator approval, executed `rollout_undo` on the `retriever` Deployment (revision 57 → 56, same image `605be30`), which briefly restored a healthy pod template. However, the deployment was observed re-advancing to revision 61 shortly after — a new pod under the same bad replicaset (`retriever-65bd758646-vg6tf`) began crash-looping again with the identical `DATABASE_URL: garbage` value, consistent with an external GitOps reconciler (Argo) continuously re-syncing the live cluster back to a git-committed manifest that still contains the bad value. Despite that residual pod, `alert_status` reported the alert resolved on three consecutive re-checks (the originally paged pod/instance is gone and the healthy replicaset is serving).

## Lessons
- A `kubectl`-level `rollout_undo` only fixes the live object; if the bad config originates from a GitOps-tracked manifest, the source-of-truth commit must also be reverted/fixed or the reconciler will re-apply the regression on its next sync — this incident's remediation toolset did not include git/PR access to make that fix durable.
- Recommend a fast-follow: locate and revert the gitops commit that introduced `DATABASE_URL: garbage` into the retriever Deployment manifest (likely bundled with the same change wave as the surrounding gateway/model-proxy stale-db-secret incidents around this same window), and confirm `retriever-65bd758646` stops respawning entirely.
- Consider adding a startup/liveness check or CI manifest-lint that rejects literal (non-secretRef) values for `DATABASE_URL` to catch this class of error before rollout.
