# scripts/

Utility scripts for the AI Observability Lab.

## Available

| Script      | Purpose                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-up.sh` | Brings up the full lab (subject + observability + lineage planes) using Docker Compose. Run from the repo root: `./scripts/dev-up.sh`. Accepts extra `docker compose up` arguments. |

## Coming in later phases

The following scripts are planned and will be added as the corresponding phases land:

- **seed.sh** — populate Postgres and Kafka with sample traces and events for local development.
- **smoke.sh** — run a fast smoke-test suite against the running stack to confirm healthy endpoints.
- **chaos.sh** — inject controlled faults (latency, error rate) to exercise alerting and runbook flows.
- **demo-incident.sh** — replay a canned incident scenario end-to-end for demos and onboarding walkthroughs.

See `docs/PLAN.html` for phase details and sequencing.
