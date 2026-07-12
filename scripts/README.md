# scripts/

Utility scripts for the AI Observability Lab.

## Available

| Script             | Purpose                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-up.sh`        | Brings up the full lab (subject + observability + lineage planes) using Docker Compose. Run from the repo root: `./scripts/dev-up.sh`. Accepts extra `docker compose up` arguments.               |
| `smoke.sh`         | End-to-end smoke test of the Phase 1 subject system: builds + starts the stack, waits for gateway health, runs the seed job, then POSTs a chat request and asserts a non-empty `retrieved` array. |
| `demo-incident.sh` | The Phase 6 "synthetic incident" demo (`bun run demo:incident`). See below.                                                                                                                       |

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

See `docs/PLAN.html` for phase details and sequencing.
