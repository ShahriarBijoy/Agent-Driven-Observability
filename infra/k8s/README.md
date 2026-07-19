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

## K8s observability (Phase 8)

`monitoring/values.yaml` + `obs k8s monitoring` install the grafana/k8s-monitoring
chart (pinned v4.3.0, namespace `monitoring`): kube-state-metrics + cadvisor +
kubelet + an allowlisted apiserver scrape remote-write into laptop Mimir,
cluster events and pod logs push into laptop Loki — same tailnet egress path as
the subject system, with a hostAliases pin so the monitoring collectors keep
shipping when a scenario breaks CoreDNS. node-exporter stays off: three k3d
"nodes" share one kernel, so host metrics would be the same numbers, thrice.

What consumes it:

- **Dashboards** — kubernetes-mixin (built by `infra/grafana/mixins/build.sh`
  with job selectors aligned to `integrations/kubernetes/*` — misaligned
  selectors are the classic silently-empty-dashboards footgun), a hand-rolled
  events dashboard, and the cardinality guard (`Mimir / Cardinality`): cluster
  telemetry gets a 40–80k active-series budget inside Mimir's 100k cap. The
  un-allowlisted apiserver shipped 36.8k series on day one; the keep-list in
  values.yaml holds it near 4k.
- **Alerts** — 8 curated cause-alerts (folder _Lab Alerts - K8s_) with 60–120s
  `for` timings; they route to the agent webhook like everything else.
- **The agents** — kubernetes-mcp-server (read-only, agent-ro identity,
  Secrets denied twice) plus the shaped `k8s_events` / `kubectl_read` tools in
  agent-service; investigating agents never need Bash for cluster reads.
- **Failure scenarios** — `obs fail oomkill | imagepull | crashloop |
readiness-break`: pod-template patches with one shared revert
  (`rollout undo`). Measured chain on this lab: fault → firing alert →
  incident-reporter run in ~2m20s.
