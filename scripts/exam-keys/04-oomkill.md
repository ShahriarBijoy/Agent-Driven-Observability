# 04-oomkill — OOMKill from a lowered limit

|                            |                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | `retriever`                                                                                                                                                                      |
| **Cause category**         | A resource limit lowered below what the workload needs. The kernel kills the container; the application is not at fault.                                                         |
| **Expected time to alert** | ~180 s (`KubeContainerOOMKilled` has no pending period — it fires as soon as the first OOM restart is scraped)                                                                   |
| **Blast radius**           | Effectively none on the request path. Retriever is a plain Deployment, so the new template surges a second pod while the existing one keeps serving; the error rate stays quiet. |

## What was actually done

The retriever container's memory was lowered out of band (a live
`kubectl set resources`, not a commit) from the committed `requests: 192Mi /
limits: 512Mi` to `requests: 48Mi / limits: 64Mi`. The new pod's working set
reaches 64 Mi within seconds and the kernel OOM-kills it; restarts climb and the
memory graph flat-tops exactly at the limit.

Because the mutation is out-of-band, the retriever Application also goes
`OutOfSync`.

## component_correct

True if the report names **retriever** as the workload being killed.

## cause_category_correct

True if the report distinguishes **"killed for exceeding a limit somebody
lowered"** from **"crashed on its own bug"**, and lands on the former. The
discriminator is the whole question: both look like "the pod keeps restarting"
on a pod list.

Strong credit for noting the limit is _not_ what Git declares — i.e. the limit
changed, the workload's appetite did not.

False if attributed to: a memory leak in the retriever, a code regression, a bad
image, load growth, or a crash at startup.

## evidence_cited

True if the report cites **at least three**:

- `lastState.terminated.reason = OOMKilled` (exit code 137) on the retriever
  container — read from `kubectl_read describe pod`. Note the evidence lives in
  `lastState`: the killed container is already gone and its replacement is
  starting.
- A climbing restart count with a short, regular period.
- The memory working set **flat-topping at exactly the limit** rather than
  growing without bound — `mimir_query` on
  `container_memory_working_set_bytes` against
  `kube_pod_container_resource_limits`. A leak climbs past its old ceiling; this
  hits a wall.
- The limit itself: `64Mi` live versus `512Mi` in Git — the change is the
  finding, and `argo_app` shows retriever `OutOfSync` because of it.
- The image and code are unchanged — no CI build, no deploy annotation.
- The gateway's error rate is quiet, which is what tells you the old pod is
  still serving.

## remediation_appropriate

True for any of:

- `patch_memory_limit retriever` back to the committed value (512 Mi) behind
  approval — the direct, scoped fix.
- Restoring the committed resources by re-syncing the retriever Application from
  Git, or naming that and escalating it (the on-call agent holds no sync tool).

False for:

- `restart_workload` alone — the replacement pod inherits the same 64 Mi
  ceiling.
- `scale_deployment` — more replicas, each still OOM-killed.
- "Escalate to the retriever developers to fix the memory leak" — there is no
  leak; this actively sends the incident the wrong way.
- `rollout_undo` — retriever is not a Rollout.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Saying "the limit was changed out-of-band, not through Git" is
the correct in-cluster reading and is not cheating.

## Do not credit

- "The retriever has a memory leak" — the working set is bounded by the limit,
  not growing through it.
- "CrashLoopBackOff from a bad config" — the exit reason is `OOMKilled`, not a
  startup error, and the logs show no parse failure.
- "The node is out of memory" — the node is fine; this is a per-container
  cgroup limit, and no eviction or `MemoryPressure` condition exists.
- "Traffic spiked" — the load profile is steady.
