---
alert_types: [k8s-pod-crashloop, KubePodCrashLooping, k8s-container-waiting, KubeContainerWaiting]
tools: [kubectl_read, k8s_events, deploy_history, loki_query, rollout_undo, restart_workload]
hypotheses:
  - A new revision introduced a bad env/config and dies at startup
  - An image or dependency is missing (ImagePullBackOff/ErrImagePull upstream of the crash)
  - The container is crashing on its own logic (a bug), unrelated to any recent change
---

# Kubernetes pod crashloop

**Trigger:** `KubePodCrashLooping` (a container is in CrashLoopBackOff) or
`KubeContainerWaiting` (stuck in ImagePullBackOff / ErrImagePull /
InvalidImageName / CreateContainerConfigError / CreateContainerError).

## Diagnose

1. `kubectl_read describe pod` on the affected pod (`namespace` + `name` from
   the alert labels) — read the container's last termination reason, exit
   code, and restart count.
2. `k8s_events` scoped to the same `namespace`/`object_name` — the timeline
   around the first restart usually names the proximate cause (`Failed`,
   `BackOff`, `Unhealthy`) before the crashloop label appears.
3. `loki_query` the pod's own log stream (`{namespace="...", pod="..."}`)
   for the last lines before each restart — a stack trace or a fatal
   config-read error confirms the failure mode.
4. `deploy_history` for the workload — a new revision deployed shortly
   before the first crash is guilty until proven otherwise; name the
   revision and its deploy time.

## Mitigate

1. If a bad revision is confirmed: `rollout_undo` back to the last known-good
   revision — **requires approval**. Dry-run first and put the diff (from
   revision X to Y) in the `request_approval` summary.
2. If the workload is otherwise healthy but wedged (e.g. a stuck init
   container with no code change involved): `restart_workload` — **requires
   approval**.
3. Do not guess at a fix without a revision diff or log evidence — a
   crashloop with no recent deploy and no informative log line is a lead to
   escalate, not a rollback target.

## Verify

- `alert_status` reports the alert resolved (no more waiting-reason or
  restart increments in the query window).
- `k8s_events` shows no further `BackOff`/`Failed` events for the pod after
  the remediation.
- Restart count for the container stops increasing.
