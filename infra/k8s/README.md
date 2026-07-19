# The cluster layer (Act II, Phase 7)

The subject system — gateway, embedder, retriever, model-proxy, load-generator,
plus its Postgres and Redis — runs in a **k3d cluster on the obs-vm** (Hetzner,
reached over Tailscale; PLAN-2 §C Profile A). The observability plane never
moved: every byte of telemetry flows back to the laptop's compose LGTM stack
over the tailnet, so Grafana keeps all history and survives anything the
cluster does to itself.

| Piece          | What it is                                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k3d.yaml`     | Cluster as code: 1 tainted server + 2 killable agents, pinned API :6550, registry :5010, LB :8080→Traefik. Plain `${VAR}` refs — always source `infra/ports.env` first (obs k8s up does).                                                                                        |
| `base/`        | Kustomize base: Deployments with probes + requests sized so the full set cannot fit one agent (real FailedScheduling under drain), DB creds via the `subject-db-credentials` Secret, per-pod `service.instance.id`, Traefik IngressRoute keeping `:8080` + `/chaos/*` contracts. |
| `overlays/lab` | Profile A values: registry image refs, telemetry/lineage egress to the laptop's tailnet FQDN, the Secret and telemetry ConfigMap literals.                                                                                                                                       |
| `cluster/`     | Bootstrap applied on every `obs k8s up`: CoreDNS ts.net→MagicDNS forward, `agent-ro` read-only ServiceAccount.                                                                                                                                                                   |

Daily flow: `obs k8s up` → `obs k8s build` → `obs k8s deploy` → `obs smoke`.
GitOps replaces the build/deploy half in Phase 10. The VM side lives in
`infra/vm/` (cloud-init + NAT unit + provisioning guide).
