# Postmortems

Machine-generated incident postmortems, one file per incident, written by the
on-call agent (`apps/agent-service`) at the end of an investigation and opened
as a pull request into this repo.

## Convention

- **Location:** `postmortems/YYYY-MM-DD-<slug>.md` (the date is the incident's
  open time in UTC; the slug is derived from the alert). The writer lives in
  `apps/agent-service/src/agent_service/postmortem.py`.
- **Structure:** a machine-built timeline table (every timestamp comes from a
  real source — alerts, deploys, k8s events, log-spike onset — the model never
  invents a time), Grafana explore deeplinks over the incident window, then a
  narrative the agent writes (Summary / Impact / Root cause / What fixed it /
  Lessons).
- **Not format-gated:** `postmortems/*.md` is excluded from `oxfmt` in
  `.oxfmtrc.json`. These are generated artifacts, not hand-maintained source —
  the format gate should not block an incident record from landing.
- **Reviewed like any change:** the agent opens a PR (branch
  `postmortem/<incident-id>`) rather than committing to `main` directly, so a
  human sees the writeup before it merges.

This folder sits alongside `runbooks/` — runbooks are how we respond, postmortems
are what happened.
