---
alert_types: [k8s-node-not-ready, KubeNodeNotReady]
tools: [kubectl_read, k8s_events, mimir_query]
hypotheses:
  - The node's kubelet is unreachable (network partition, host resource exhaustion)
  - The node is mid-drain or mid-reboot as part of expected maintenance
  - Disk/memory pressure on the node is tripping node-level eviction thresholds
---

# Kubernetes node not ready

**Trigger:** `KubeNodeNotReady` — a cluster node's `Ready` condition is
`false` or `unknown` (kubelet unreachable) for more than a minute.

## Diagnose

1. `kubectl_read describe` the node (`resource=nodes`, `name=<node>`) — read
   the `conditions` block (MemoryPressure, DiskPressure, PIDPressure,
   NetworkUnavailable) and the last heartbeat time.
2. `k8s_events` with no namespace filter, `object_name=<node>` — scheduler
   and kubelet events (`NodeNotReady`, `NodeHasDiskPressure`,
   `FailedScheduling` for pods that can no longer land there) narrate the
   timeline.
3. `mimir_query` node-level series (`node_memory_*`, `node_filesystem_*`, or
   `kube_node_status_condition`) over the last 30m — confirm whether the
   condition flip correlates with resource exhaustion or is a bare
   connectivity gap (metrics simply stop, no gradual pressure buildup).
4. `kubectl_read get pods -A -o wide` filtered to the node (via `selector`
   where possible) — a mass of pods stuck `Terminating`/`Unknown` on one
   node confirms cluster-wide impact, not a single workload issue.

## Mitigate

This runbook is diagnosis-first: a single-node k3d lab has no second control
plane to fail over to, and the correct action is almost always operator-side
(check the VM/host, not a kubectl mutation the agent can safely automate).

1. If the node is genuinely gone (host down, disk full): stop here and
   escalate — reviving a node's own host is outside the agent's tool
   surface. Name the affected workloads (from step 4) in the postmortem so
   the operator knows blast radius immediately.
2. If pods are stuck scheduling onto the bad node while others are healthy:
   `restart_workload` on the affected deployments — **requires approval** —
   so the scheduler places fresh replicas on a healthy node instead of
   waiting on the dead one.

## Verify

- `alert_status` reports `KubeNodeNotReady` resolved (node's `Ready`
  condition back to `true`).
- `kubectl_read get nodes` shows the node `Ready` with a current heartbeat.
- No pods remain stuck `Unknown`/`Terminating` on that node.
