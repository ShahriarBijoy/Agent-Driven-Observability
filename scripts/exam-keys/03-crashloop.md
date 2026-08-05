# 03-crashloop — CrashLoop from a bad env value

|                            |                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | `gateway` — specifically the new pod template, not the running code                                                                                                     |
| **Cause category**         | Configuration shipped in a template change: an unparseable env value kills the process at startup.                                                                      |
| **Expected time to alert** | ~300 s (`KubePodCrashLooping`, 3 m pending, after the container has cycled a few times)                                                                                 |
| **Blast radius**           | Small and _partial_. Gateway is a Rollout with 4 replicas and `maxSurge: 0`, so the broken pod takes one slot and three stable pods keep serving. The SLO barely moves. |

## What was actually done

`GATEWAY_PORT` on the gateway Deployment's pod template was changed from `8080`
to `not-a-port`, out of band (a live `kubectl set env`, not a commit). The
gateway's config schema rejects it at module load, the process exits 1 before
binding a port, and the kubelet backs the container off into
`CrashLoopBackOff`. The rollout wedges: the new template can never become
Ready.

Because the mutation is out-of-band, the gateway Application also goes
`OutOfSync` — the live template no longer matches Git.

**Matrix deviations:** the matrix names `DATABASE_URL`. Gateway takes
`DATABASE_URL` from a Secret via `envFrom`, so patching it would _add_ a field
Git never declared, and Argo's diff ignores those — verified live, the app sat
`Synced` for minutes with the bad value live. `GATEWAY_PORT` is declared in Git,
so the OutOfSync half of the signature is real. The matrix also puts this on
retriever; the pack targets **gateway**.

## component_correct

True if the report names **gateway** as the crashing workload. Naming the
specific pod is a bonus, not a requirement.

## cause_category_correct

True if the report says a **changed configuration value in the new pod template
kills the container at startup** — a change, not a code bug and not a resource
problem. Naming `GATEWAY_PORT` is strong credit but not required; "an
unparseable/invalid env value the config schema rejects" is enough.

False if attributed to: a memory limit / OOM, a missing image, the database
being down, a dependency failing, load, or "the gateway has a bug".

## evidence_cited

True if the report cites **at least three**:

- A gateway pod in `CrashLoopBackOff` with a climbing restart count and exit
  code 1 (`kubectl_read describe pod`).
- The **startup log naming the env key** — the config/schema parse error
  emitted before anything binds (`loki_query`). This is the single most
  valuable piece of evidence and a report that never opens the logs should not
  score this boolean on structural evidence alone.
- `BackOff` / `Failed` events on the pod (`k8s_events`) and their first
  occurrence, which dates the onset.
- The rollout is **wedged, not completed** — the stable ReplicaSet is still
  carrying traffic (`rollout_status`), which is why this is not an outage.
- The gateway Application is `OutOfSync` — the live template differs from Git,
  i.e. nobody deployed this through the pipeline (`argo_app`). _Optional:_ Argo
  can lag its refresh, so its absence is not held against the report.
- The image is unchanged — this rules out a code release.

## remediation_appropriate

True for any of:

- `rollout_undo gateway` behind approval — the `k8s-crashloop` runbook's action,
  and the right shape: go back to the last template that started.
- Restoring `GATEWAY_PORT=8080` explicitly.
- Re-syncing the gateway Application from Git (the truest fix, since the live
  state is the thing that drifted) — naming it and escalating is acceptable, as
  the on-call agent holds no sync tool.

False for:

- `restart_workload` **alone** — the new pod restarts into the same broken
  template and crashes again. Restart _after_ the template is fixed is fine.
- `scale_deployment`, `patch_memory_limit`, `rollout_promote`.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Saying "this env value was set out-of-band rather than through
Git, per the OutOfSync diff" is exactly the reasoning wanted — that is read from
the cluster, not from the harness.

## Do not credit

- "The gateway is down / total outage" — three of four pods are serving.
- "OOMKilled" — the exit code is 1, not 137, and no OOM event exists.
- "ImagePullBackOff" — the image pulled fine; the container started and then
  exited.
- "The database is unreachable" — the process dies before it opens a
  connection.
- "A bad deploy shipped from CI" — no CI run and no deploy annotation exists for
  this change; that is why the app is OutOfSync.
