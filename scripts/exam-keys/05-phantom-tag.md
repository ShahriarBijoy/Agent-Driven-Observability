# 05-phantom-tag — An image tag CI never built

|                            |                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Component**              | `gateway` — the delivery reference, not the application                                                                                          |
| **Cause category**         | Delivery: the workload points at an image tag that does not exist in the registry. Everything downstream of the bad reference behaved correctly. |
| **Expected time to alert** | ~300 s (`KubeContainerWaiting`, 3 m pending; `ErrImagePull` appears within seconds)                                                              |
| **Blast radius**           | None on the request path. The new pod never starts; the stable ReplicaSet keeps serving all traffic and the rollout wedges.                      |

## What was actually done

The gateway's image was repointed at the tag `phantom` — **same repository,
same registry** (`obs-registry:5010/gateway:phantom`), a tag CI never built.
Only the tag was replaced, deliberately: keeping the repository intact makes the
failure unambiguously "this tag does not exist" rather than "this registry is
unreachable", which is a different incident with a different answer.

The kubelet cannot pull it, the pod sits in `ErrImagePull` and then
`ImagePullBackOff`, and the container never starts — so there are **no
application logs at all** for the failing pod. The mutation is out-of-band, so
the gateway Application is also `OutOfSync`.

## component_correct

True if the report names **gateway**, and identifies the fault as being in its
**image reference** rather than in the gateway's code or configuration.

## cause_category_correct

True if the report says the workload was pointed at an **image/tag that was
never built and does not exist in the registry**, and that the delivery
machinery itself is healthy — the manifest is exactly what was asked for, the
sync succeeded, the image simply is not there.

Strong credit for the discriminator: **the registry is reachable** — other pods
pulled from it in the same window — so this is a missing artifact, not a broken
registry.

False if attributed to: a registry outage, a network/DNS fault, a crash, a
resource limit, an application bug, or a bad application config.

## evidence_cited

True if the report cites **at least three**:

- The pod stuck in `ErrImagePull` / `ImagePullBackOff` (either — the kubelet
  passes through the first before backing off into the second).
- The pull events naming the exact reference and the failure text (`k8s_events`
  — `Failed to pull image ... not found` / `manifest unknown`).
- The image tag itself, quoted — the report should say _which_ tag is being
  pulled, since the whole finding is that reference.
- **A cross-check against CI**: `gitea_ci_runs` shows no run that built that
  tag; the last green build produced a sha-based tag. This is the step the
  scenario exists to test — the answer is in the delivery record, not in the
  application's telemetry.
- The rollout is wedged while the stable pods serve (`rollout_status`), which is
  why the SLO is quiet.
- The gateway Application is `OutOfSync` — the live image differs from Git, so
  this reference never came through the pipeline.
- The absence of application logs for the new pod, correctly interpreted: the
  container never started, so there is nothing to read.

## remediation_appropriate

True for any of:

- `rollout_undo gateway` behind approval — back to the last image that exists.
- Restoring the committed image reference, or re-syncing the gateway
  Application from Git (naming it and escalating is acceptable — the on-call
  agent holds no sync tool).
- Either of the above **plus** verifying the pull succeeds afterwards.

False for:

- `restart_workload` — the replacement pod pulls the same missing tag.
- "Ask CI to build the `phantom` tag" — nothing legitimately references it; the
  fix is to stop pointing at it.
- `scale_deployment`, `patch_memory_limit`, `rollout_promote`.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault".

## Do not credit

- "The registry is down / unreachable" — the reason the repository was left
  intact. Other images pull normally.
- "The gateway is crashing" — it never started.
- "A bad deploy from CI" — no CI run and no deploy annotation exists for this
  change.
- "Total outage" — the stable pods are serving every request.
