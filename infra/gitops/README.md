# infra/gitops — the desired-state seed (PLAN-2 Phase 10)

This directory is the **seed template** for the `obs/obs-gitops` Gitea repo —
the repo Argo CD actually watches. The Phase 7 Kustomize tree
(`infra/k8s/base` + `overlays/lab`) moved here, restructured into per-service
sync roots:

```
platform/                 one Application: namespace, postgres, redis,
                          seed (PostSync hook), ingress, generators
services/<name>/          one Application per service; kustomization.yaml
                          pins the image tag - CI "deploys" by committing a
                          newTag bump here
```

## Where the truth lives

| Copy                        | Role                                                     |
| --------------------------- | -------------------------------------------------------- |
| Gitea `obs/obs-gitops`      | **Runtime truth.** Argo CD syncs the cluster from it.    |
| `infra/gitops` (this tree)  | Seed + review copy. `obs gitops init` pushes it once;    |
|                             | `obs gitops push` force-syncs it over the runtime repo   |
|                             | (operator override — use for structural changes, never   |
|                             | for routine deploys; it will overwrite CI's tag bumps    |
|                             | with whatever is pinned here).                           |

The Application CRs themselves are **not** in this tree — they are cluster
bootstrap, applied by `obs k8s argo` from `infra/k8s/argocd/apps/`.

## Sync policy (why drift stays visible)

Applications sync automatically with **self-heal off**: a `kubectl edit` or
`kubectl patch` against a live object flips the app to OutOfSync and *stays
visible* — that is the Phase 10 drift-demo contract. The exam runner enables
self-heal per-app only while a live-inject scenario is running.

Prune is on: deleting a manifest from obs-gitops deletes the object.
