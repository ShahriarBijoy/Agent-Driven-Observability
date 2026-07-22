# runbooks/

Markdown runbooks for the AI Observability Lab. Each documents the
investigation and remediation steps for a specific alert or incident class:
`# Title`, `**Trigger:**`, then `## Diagnose` / `## Mitigate` / `## Verify`
(mutating `Mitigate` steps are labeled "requires approval").

They're read two ways:

- **`runbook_read`** — any agent can read one by name (or pass `"list"` /
  an empty path to enumerate what exists) and follow it as prose.
- **`runbook_lookup`** (PLAN-2 P11) — the on-call agent's automatic match:
  given the firing alert's name, it finds the runbook whose frontmatter
  claims that alert and returns its body plus metadata. A match **narrows
  the on-call agent's tool allow-list** to just the runbook's declared
  `tools` (union'd with the session's always-on spine — approvals,
  artifacts, the runbook tools themselves, `deploy_history`/`alert_status`)
  — HolmesGPT's ~8x tool-call-reduction pattern: fewer, right tools beats
  the whole toolbox on every page.

## Frontmatter contract

A runbook MAY open with a `---`-delimited frontmatter block (no PyYAML
dependency — a small hand-rolled parser covers exactly this subset):

```markdown
---
alert_types: [k8s-pod-crashloop, KubePodCrashLooping, k8s-container-waiting]
tools: [kubectl_read, k8s_events, deploy_history, loki_query, rollout_undo, restart_workload]
hypotheses:
  - A new revision introduced a bad env/config and dies at startup
  - An image or dependency is missing
---
```

- `alert_types` — every real alertname this runbook answers for. Grafana's
  webhook payload sets `alertname` from the rule's `title` (not its `uid`),
  and different call sites in this codebase have used both forms, so list
  BOTH the short uid-style name (e.g. `gw-5xx`) and the full rule title
  (e.g. `Gateway 5xx rate > 2%`) for every alert this runbook matches — plus
  gitops-reporter event names (`on-rollout-aborted`, `on-analysis-run-failed`)
  where relevant. `runbook_lookup(alertname)` matches EXACTLY against this
  list; no match returns the available runbook names instead of guessing.
  An empty (or omitted) `alert_types` means the runbook is never
  auto-matched — fine for an on-demand runbook like
  `snapshot-agent-audit.md`.
- `tools` — the plain tool names (e.g. `kubectl_read`, not
  `mcp__obslab__kubectl_read`) the matched runbook's investigation actually
  needs. This is a NARROWING list only: `apply_override` in
  `agents/base.py` guarantees an override can only shrink the agent's
  baseline allow-list, never add a tool the agent kind wasn't already
  granted.
- `hypotheses` — 2-3 short candidate root causes, surfaced to the model
  alongside the runbook body so it starts from informed guesses instead of
  a blank page.
- Two list forms only: inline `key: [a, b, c]`, or a block list —
  ```
  key:
    - item one
    - item two
  ```
  Both accept single- or double-quoted items; anything else in the
  frontmatter block is ignored rather than raising, since this is a
  deliberately tiny subset of YAML, not a full parser.

A runbook with no frontmatter block parses to `{}` — `runbook_read` still
works on it exactly as before; it's simply invisible to `runbook_lookup`'s
automatic matching until frontmatter is added.

## Current runbooks

| Runbook | Alerts | Notes |
| --- | --- | --- |
| `gateway-high-error-rate.md` | `gw-5xx`, `slo-avail-fast` | Gateway 5xx / availability burn — generic triage |
| `dq-freshness-stall.md` | `dq-high-violation`, `dq-prompt-drift` | Data pipeline stopped producing fresh output |
| `snapshot-agent-audit.md` | *(none — on-demand)* | Point-in-time audit-log snapshot, operator-triggered |
| `k8s-crashloop.md` | `k8s-pod-crashloop`, `k8s-container-waiting` | CrashLoopBackOff / stuck image-pull |
| `k8s-node-failure.md` | `k8s-node-not-ready` | A cluster node's kubelet is unreachable |
| `canary-abort.md` | `rollout-stuck`, `on-rollout-aborted`, `on-analysis-run-failed` | Argo Rollouts canary aborted or wedged |
| `ci-pipeline-red.md` | `cicd-pipeline-red` | A pipeline run on `main` failed |
| `stale-secret.md` | `slo-avail-fast`, `gw-5xx` (with a `secret_age` pre-check lead) | Rotated DB credential the workload never restarted to pick up |

Every tool result — whether or not a runbook narrowed the toolset — passes
through `enforce_budget` (`tools/backends.py`) at the single dispatch choke
point in `tools/sdk.py`: a hard, per-tool character budget
(`TOOL_BUDGETS`, default 6000) that deep-truncates oversized results instead
of letting one chatty tool call blow the model's context.
