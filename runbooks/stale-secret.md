---
alert_types: [slo-avail-fast, SLO gateway availability — fast burn, gw-5xx, Gateway 5xx rate > 2%]
tools: [loki_query, kubectl_read, deploy_history, update_db_secret, restart_workload]
hypotheses:
  - The database credential rotated (secret-age lead) but the workload never restarted to pick up the new value, so it is authenticating with a stale copy
  - A bad deploy introduced the error rate, unrelated to any secret rotation
  - The database itself rejected connections independent of the application's credentials
---

# Stale database secret (gateway 5xx / availability burn)

**Trigger:** `slo-avail-fast` (gateway availability error budget burning
fast) or `gw-5xx` (gateway 5xx rate above 2%) where the pre-check battery's
`secret_age` lead fired alongside a log-spike lead — the signature of a
rotated database credential the running pods never picked up.

## Diagnose

1. Read the pre-check leads already in this conversation: the `secret_age`
   check's lead names when the secret was last modified. Compare that
   timestamp against when "password authentication failed" errors START
   appearing — `loki_query` for
   `{namespace="subject"} |= "password authentication failed"` over the
   incident window. If the secret's modification time LEADS the first
   auth-failure log line (rotated, then failures start shortly after), that
   is the stale-secret signature; if auth failures predate the rotation, the
   secret is not the cause.
2. `deploy_history` for the affected workload(s) over the same window —
   CONFIRM there is NO deploy in the window. A stale secret is a
   rotation-vs-restart mismatch, not a bad deploy; if a deploy DID land in
   the window, treat this as a regular bad-deploy investigation instead
   (correlate with `gitea_compare`, not this runbook's remediation).
3. `kubectl_read describe` the affected pods — confirm the running pods'
   start time predates the secret rotation (they are still holding the OLD
   credential in their environment/mounted volume; Kubernetes does not
   restart a pod automatically when a referenced Secret changes).

## Mitigate

1. `update_db_secret` with `dry_run=true` first — put the exact before/after
   diff (never the raw secret value itself) in the `request_approval`
   summary, and wait for the decision.
2. Once approved, `update_db_secret` for real (execute), then
   `restart_workload` for every affected service so the new pods pick up the
   refreshed credential on start — **both steps require approval**; a stale
   secret is not fixed until the workload actually restarts against it.
3. Do not restart the workload BEFORE the secret update lands — that only
   reproduces the same failure against a fresh pod holding the same stale
   value.

## Verify

- Re-query `alert_status` repeatedly until it reports the alert resolved —
  do not assume success from the restart alone.
- `loki_query` for `"password authentication failed"` over a fresh window
  shows no new occurrences after the restart.
- Gateway 5xx rate / availability error ratio back at baseline (below the
  `gw-5xx`/`slo-avail-fast` thresholds) for at least one evaluation window.
