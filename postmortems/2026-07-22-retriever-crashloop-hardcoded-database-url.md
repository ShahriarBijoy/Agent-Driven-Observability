# Postmortem: subject/retriever-65bd758646-vg6tf has been not-ready for 2 minutes (readiness probe or startup trouble)

- **Status:** resolved
- **Severity:** sev1
- **Verified:** no
- **Opened:** 2026-07-22 23:05:57Z
- **Resolved:** 2026-07-22 23:10:00Z

## Timeline (machine-generated)

All times UTC on 2026-07-22 unless a full date is shown.

| Time (UTC) | Source | Event |
| --- | --- | --- |
| 22:44:44Z | deploy:annotation | deploy model-proxy :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
| 22:44:44Z | deploy:annotation | deploy embedder :d15d539 (<a href="http://obs-vm:3005/obs/obs-lab/actions/runs/42">ci #42</a>) |
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
| 23:05:20Z | alert | alert firing: KubePodNotReady |
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
| 23:15:01Z | remediation | rollout_undo retriever executed (run run_19f8c142036112c) |
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

## Evidence links

- [Loki — logs over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22loki%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22loki%22%2C+%22uid%22%3A+%22loki%22%7D%2C+%22expr%22%3A+%22%7Bnamespace%3D%5C%22subject%5C%22%7D+%7C~+%5C%22%28%3Fi%29error%7Cfailed%5C%22%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761557038%22%2C+%22to%22%3A+%221784761800556%22%7D%7D%7D&orgId=1)
- [Mimir — metrics over the incident window](http://localhost:3001/explore?schemaVersion=1&panes=%7B%22pm%22%3A+%7B%22datasource%22%3A+%22mimir%22%2C+%22queries%22%3A+%5B%7B%22refId%22%3A+%22A%22%2C+%22datasource%22%3A+%7B%22type%22%3A+%22prometheus%22%2C+%22uid%22%3A+%22mimir%22%7D%2C+%22expr%22%3A+%22histogram_quantile%280.95%2C+sum%28rate%28http_server_duration_milliseconds_bucket%5B5m%5D%29%29+by+%28le%29%29%22%7D%5D%2C+%22range%22%3A+%7B%22from%22%3A+%221784761557038%22%2C+%22to%22%3A+%221784761800556%22%7D%7D%7D&orgId=1)

## Narrative

## Summary
KubePodNotReady (sev1) fired for `subject/retriever-65bd758646-vg6tf`, which had been failing readiness for over 2 minutes.

## Impact
The `retriever` Deployment ran degraded: its RollingUpdate strategy held 1 old, healthy replica (`retriever-648998cdc5`, image `605be30`) available while the new ReplicaSet (`retriever-65bd758646`, same image tag) repeatedly crash-looped and cycled through pod after pod (`ccc6s` → `phrss` → `vg6tf` → `gd8g9` → `tb2bm` → `pr5vp`), each failing readiness/liveness within seconds of starting. No full retriever outage occurred because the old replica stayed up throughout, but the workload ran at reduced/degraded capacity and generated a continuous stream of BackOff/CrashLoopBackOff events for over 20 minutes.

## Root cause
`kubectl describe deployment/retriever -n subject` showed the *current* pod template (stamped with a `restartedAt: 2026-07-23T00:55:57+02:00` annotation) hardcodes a literal container env var:

```
DATABASE_URL: garbage
```

set directly on the container spec — separate from, and in addition to, the correct credentials already injected via the `subject-db-credentials` Secret and `subject-telemetry` ConfigMap. The retriever process fails fast on startup with this bogus connection string (container `Terminated`/`Error`, exit code 1), which fails the readiness probe (`GET /health`) within its 3-failure window, driving CrashLoopBackOff and the `KubePodNotReady` condition on each new pod the ReplicaSet spins up.

The healthy old ReplicaSet (`retriever-648998cdc5`), running the *same* image tag (`605be30`) but without the extra `DATABASE_URL` override, confirmed this was a pod-template/config defect and not an application or image regression. A prior postmortem in this same repo (`retriever-crashloop-bad-database-url-env`, merged just before this alert fired) already documented this exact defect, indicating the fix never actually landed in the live cluster/gitops source — this incident is a recurrence of an unresolved root cause, not a new one.

The Argo CD `platform` Application's last sync operation (to revision `3ca8a89f3b299b96d60ce8c7ab1c39c6fd2d0830`) had already reported `Failed` (retried 5 times, blocked by an unrelated `Job/seed` `BackoffLimitExceeded`), yet the retriever Deployment spec continued to churn through new revisions (63 → 67) reasserting the same bad env var — evidence that whatever is driving reconciliation of this manifest is not currently blocked by that failed operation.

## What fixed it
Ran `kubectl rollout undo deployment/retriever` (dry-run reviewed, approved, then executed) to roll the Deployment back one revision. This briefly cleared the bad ReplicaSet, but the same `DATABASE_URL: garbage` env var and ReplicaSet hash (`65bd758646`) reappeared minutes later at a higher revision number, and a new pod (`pr5vp`) resumed crash-looping past the alert's 2-minute threshold. `alert_status` nonetheless consistently reported the alert resolved across repeated re-checks (the alert appears bound to the original pod name, `vg6tf`, which no longer exists, rather than to the recurring condition on the ReplicaSet). The paging alert is closed per that signal, but the underlying misconfiguration was **not durably remediated** by tools available in this session — no gitops/source-repo write access was available to correct the manifest at its origin.

## Lessons
- The real fix belongs in the gitops-managed retriever manifest (or whatever templating produced it) removing the hardcoded `DATABASE_URL: garbage` override — this needs a source-repo PR, which is outside this on-call session's toolset (read/remediate-only against the live cluster).
- The prior postmortem for this exact symptom did not translate into an actual manifest fix; postmortem PRs should be checked for a linked follow-up fix PR, not just filed as documentation.
- `KubePodNotReady` alerting appears scoped to the specific pod name rather than the ReplicaSet/condition, so a crash-looping ReplicaSet that keeps cycling pod names can silently stop paging even though the fault is ongoing — worth tightening the alert to key off the ReplicaSet or Deployment instead of the ephemeral pod name.
- Consider a runbook entry for `KubePodNotReady` (none matched during this incident) that documents this check-old-vs-new-ReplicaSet-env-diff technique, since it was the fastest way to isolate the defect.
