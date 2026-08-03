# 06-probe-regression — A wrong readiness path

|                            |                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | `gateway` — the readiness probe in the new pod template                                                                                 |
| **Cause category**         | Delivery / configuration: a probe change, not application code. The container is healthy and would serve traffic if it were allowed to. |
| **Expected time to alert** | ~360 s (`KubePodNotReady`, 4 m pending; `rollout-stuck` follows at 12 m if it runs long)                                                |
| **Blast radius**           | None. The previous ReplicaSet carries every request; nothing 5xxes and the error budget barely moves.                                   |

## What was actually done

The gateway's `readinessProbe.httpGet.path` was changed out of band from
`/health` to `/definitely-not-ready`. The container starts normally and answers
`/health` perfectly well — but the probe 404s forever, the pod never becomes
Ready, it never joins the Service's endpoints, and the rollout sits Progressing
indefinitely while the old ReplicaSet serves.

Only the path was patched — port and thresholds are untouched — so the diff an
investigator sees is one line. The mutation is out-of-band, so the gateway
Application is also `OutOfSync`.

This is the quietest scenario in the pack, and that is the point: an agent that
reaches for the SLO dashboards finds nothing wrong.

## component_correct

True if the report names **gateway** and locates the fault in its **readiness
probe** (not in the gateway's application code, and not in a dependency).

## cause_category_correct

True if the report says a **new revision's probe configuration is wrong, so
pods never become Ready** — a delivery/config fault with the application itself
healthy. Framings that count: "the readiness path does not exist", "the pods are
Running but never Ready, so the rollout can never complete", "the probe is
misconfigured, not the app".

Strong credit for the structural reading: this is a **stuck mixed-ReplicaSet
rollout**, and the old ReplicaSet is what explains the absence of user impact.

False if attributed to: a crash, an OOM, an image problem, a failing dependency,
saturation, or "the gateway is unhealthy".

## evidence_cited

True if the report cites **at least three**:

- Pods **Running but `0/1` Ready with zero restarts** — the discriminator
  against a crash loop, where restarts climb. Started-and-not-Ready is the
  specific state a wrong probe path produces.
- `Readiness probe failed: HTTP probe failed with statuscode: 404` events
  naming the path (`k8s_events` / `kubectl_read describe pod`).
- The probe path itself, quoted — live versus the committed `/health`.
- The rollout Progressing far past its budget and never completing
  (`rollout_status`), with the stable ReplicaSet still at full readiness.
- Endpoints unchanged: the never-Ready pod is not in the Service.
- Error rate and latency essentially flat — the report should say the SLO
  evidence is _absent_, and that its absence is informative.
- The gateway Application is `OutOfSync` (optional — Argo's refresh can lag).

## remediation_appropriate

True for any of:

- `rollout_undo gateway` behind approval — back to the last template whose pods
  went Ready.
- Restoring the probe path to `/health`, or re-syncing the gateway Application
  from Git (naming it and escalating is acceptable — no sync tool is held).

False for:

- `restart_workload` — the replacement pod carries the same probe.
- `scale_deployment` — more pods, none of them Ready.
- `rollout_promote` — promoting a revision that cannot become Ready.
- "Escalate to the developers: the gateway's health endpoint is broken" — it is
  not; `/health` answers.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault".

## Do not credit

- "The gateway is failing health checks / is unhealthy" — without identifying
  that the _path_ is wrong, this is the reflex answer and it points at the app.
- "CrashLoopBackOff" — restart count is zero.
- "Users are affected" — they are not; a report claiming impact has misread the
  mixed-ReplicaSet state.
- "The rollout is just slow" — it is stalled, not slow, and it will never
  complete.
