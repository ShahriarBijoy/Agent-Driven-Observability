# 12-bad-canary — A canary that cannot reach its upstream

|                            |                                                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | `gateway`, the **canary revision** — from commit `gateway: point completions at the regional model-proxy endpoint` on `obs-gitops` `main`                                                                 |
| **Cause category**         | A bad revision delivered through GitOps, caught by canary analysis. This IS the desired state — Argo stays `Synced` throughout.                                                                           |
| **Expected time to alert** | ~600 s (Argo syncs in ~30 s, the canary takes 25 % of traffic, the analysis step judges for ~3.5 min, then aborts; `rollout-stuck` at 12 m and the Rollouts abort/analysis-failed notifications carry it) |
| **Blast radius**           | ~25 % of requests while the canary is live — one pod in four. Stable pods are unaffected, and the rollout aborts itself.                                                                                  |

## What was actually done

One file changed on `obs-gitops` `main`:
`services/gateway/deployment.yaml`, `MODEL_PROXY_URL` from
`http://model-proxy:8083` to `http://model-proxy-eu-west:8083` — a hostname that
does not resolve in this cluster, under a commit subject that reads like
ordinary regional routing work. Argo syncs it, Rollouts starts a canary at
`setWeight: 25` (exactly one of four pods, `maxSurge: 0`), and that pod fails
every completion it is handed. The AnalysisRun judges the canary's own
`rollouts-pod-template-hash` against the lab's Mimir, fails, and Rollouts aborts
— stable keeps serving and the incident closes itself.

**Matrix deviation:** the matrix says "merge a gateway image that 500s". The
pack uses a single-service config bump instead, because the all-service CI path
overwhelms the 2 Gi agents (ADR-006). Same evidence, one service, one canary, no
CI build.

## component_correct

True if the report names the **gateway canary revision** — not gateway in
general, and not model-proxy. The finding is _which revision_, and the report
should distinguish the canary pods from the stable ones.

Naming the commit (subject or sha) is strong credit and effectively required for
`evidence_cited`.

## cause_category_correct

True if the report says a **new revision shipped a bad configuration value —
an upstream address that does not resolve — and canary analysis caught it**.
Framings that count: "the canary revision regressed", "the new revision cannot
reach its upstream", "delivery worked correctly; the change was wrong".

Strong credit for stating that Argo is **Synced**, i.e. this is not drift: the
cluster faithfully applied what Git asked for. A report claiming config drift or
an out-of-band edit has misread the incident.

False if attributed to: model-proxy being down, a DNS outage affecting the
cluster, drift, a resource problem, or the retriever/embedder path.

## evidence_cited

True if the report cites **at least three**, and the split is effectively
required:

- **The bimodal error rate split by `rollouts-pod-template-hash`** — the canary
  hash failing nearly everything while the stable hash is clean (`mimir_query`
  on the promoted label). Unsplit, this looks like a confusing partial outage;
  split, it names the revision.
- The **AnalysisRun's failing measurements**, quoted (`analysisrun_get`) — the
  measured values and the threshold they missed.
- `rollout_status` showing the canary aborted / scaled to zero and stable
  serving.
- The commit: `deploy_history` / `gitea_compare` naming
  `gateway: point completions at the regional model-proxy endpoint`, the file,
  and the one-line env change.
- Canary pod logs showing name-resolution failures for
  `model-proxy-eu-west` (`getaddrinfo` / `EAI_AGAIN`) — the mechanism.
- Argo reporting the gateway Application `Synced` at the new revision.

## remediation_appropriate

True for any of:

- Confirming the **auto-abort held** and that stable is serving, then
  recommending a **revert of that commit in `obs-gitops`**, named explicitly.
- `rollout_abort gateway` behind approval, if the analysis had not yet aborted
  when the agent looked.
- Escalating the revert (the on-call session holds no PR tool — naming the
  commit and the file is the appropriate hand-off).

**Automatic false: `rollout_promote`.** Promoting the failing canary is the one
action that turns a contained incident into an outage.

Also false: `restart_workload` / `scale_deployment` (they re-create the same
revision), and `patch_memory_limit`.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Naming the commit, quoting its diff, and calling the change
wrong is exactly the expected reasoning — the commit is legitimately visible in
Git.

## Do not credit

- "model-proxy is down" — model-proxy is healthy; the canary is dialling a name
  that does not exist.
- "Cluster DNS is broken" — only one hostname fails, and only from the canary
  pods.
- "Config drift / somebody edited the cluster" — Argo is Synced; this came
  through Git.
- "A full gateway outage" — three of four pods never faltered.
- Reporting the error rate without splitting it by revision — that is the
  measurement the scenario is built to test.
