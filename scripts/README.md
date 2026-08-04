# scripts/

Utility scripts for the AI Observability Lab.

## Available

| Script             | Purpose                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-up.sh`        | Brings up the full lab (subject + observability + lineage planes) using Docker Compose. Run from the repo root: `./scripts/dev-up.sh`. Accepts extra `docker compose up` arguments.                                                                |
| `smoke.sh`         | End-to-end smoke test of the Phase 1 subject system: builds + starts the stack, waits for gateway health, runs the seed job, then POSTs a chat request and asserts a non-empty `retrieved` array.                                                  |
| `demo-incident.sh` | The Phase 6 "synthetic incident" demo (`bun run demo:incident`). See below.                                                                                                                                                                        |
| `obs.ps1`          | The `obs` one-liner CLI: lab up/down, load tests (`obs load spike\|ramp\|soak\|drift\|abuse`), failure injection (`obs fail <scenario>`), `obs chaos <verb>`, the cluster/CI/GitOps layers, and the exam. Full reference: `docs/commands.html`.    |
| `scenarios/`       | The **scenario pack** (Phase 12): one directory per fault, each `inject.ps1` / `verify.ps1` / `revert.ps1` + `scenario.json`. The single definition of chaos in the lab — `obs fail`, `obs chaos` and `obs exam` are all callers of it. See below. |
| `exam.ps1`         | The **chaos exam** runner (`obs exam <group>`): injects a known fault, lets the on-call agent investigate blind, grades the report, writes an `exam_results` row. Read the results at `/scorecard`.                                                |
| `drill.ps1`        | The **surprise drill** (`obs drill install`): a Windows scheduled task that fires one random exam question at a random time inside a window. Same runner, no human choosing the question or the hour.                                              |
| `exam-keys/`       | The exam's hidden ground truth. Off-limits to every agent by construction — see `exam-keys/README.md` and `apps/agent-service/tests/test_exam_barrier.py`.                                                                                         |

## The synthetic incident demo

`demo-incident.sh` drives one on-purpose incident end to end: it injects a chaos
error burst (`chaos/demo.yaml`), waits for the gateway 5xx alert to fire and the
agent-service to file a **postmortem in the incident inbox**, then asks the RCA
assistant a scripted follow-up and streams its answer.

**Prerequisites** (the demo checks these and brings the stack up if needed):

- Docker running.
- The **agent-service on :8093** — start it yourself (e.g. `obs agents`); it needs
  your local Claude Code session for auth, so the script cannot start it.

```bash
bun run demo:incident          # or: ./scripts/demo-incident.sh
```

It runs for roughly 6-8 minutes (the alert needs a sustained burst to fire). Chaos
scheduling itself lives in the load-generator (`bun run chaos:run`), which reads a
YAML timeline and drives the subject services' `/admin/chaos` control planes.

## The scenario pack and the exam

Every fault in the lab lives in `scenarios/<id>/` as three idempotent scripts —
`inject.ps1` (never starts load, never schedules a revert), `verify.ps1` (exit 0
only when the fault is live **and** its expected signal exists) and `revert.ps1`
(on command only, safe on an already-healthy lab). Revert is a command, never a
timer: a timed auto-revert races a remediating agent, which is what made the
2026-07-23 crashloop test non-deterministic.

```powershell
obs chaos list                  # every scenario, its group and inject mode
obs chaos selftest 04-oomkill   # inject -> verify -> revert -> verify -> revert
obs fail 04-oomkill 40          # the same fault as a drill: load, inject, dwell, revert
obs exam resources              # the graded version: alert -> investigate -> judge
obs drill install               # ...and the version nobody scheduled
```

`obs exam` never fakes the alert path: Grafana fires, the webhook arrives HMAC'd,
an incident opens and the on-call agent spawns itself — the runner only watches,
then hands the report to a `judge` agent that grades it against a key the agent
under test cannot reach. Four statuses (`graded`, `no_alert`, `not_run`, `error`)
keep a broken harness from reading as a bad agent.

See `docs/PLAN.html` (Act I) and `docs/PLAN-2.html` (Act II) for phase details and
sequencing, and `docs/adr/006-the-chaos-exam.md` for the exam's design.
