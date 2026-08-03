# 15-stale-secret — A rotated password the Secret never got

|                            |                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | Secret `subject-db-credentials`, key `POSTGRES_PASSWORD` — stale against the live Postgres role `lab`. The gateway is the symptom surface, not the fault. |
| **Cause category**         | Configuration / security: a credential was rotated on the database and the copy the workloads hold was never updated. Nothing was deployed.               |
| **Expected time to alert** | ~300 s (`gw-5xx` at 2 m pending, `slo-avail-fast` alongside it — after the ~60 s it takes pooled connections to start recycling)                          |
| **Blast radius**           | Growing. Failures **ramp** rather than spike, and left alone they approach total.                                                                         |

## What was actually done

The `lab` role's password was rotated inside Postgres. The Kubernetes Secret
was **not** touched. Nothing was deployed, no pod restarted, no spec changed.

For the first minute nothing happens at all: every pooled connection was
authenticated before the rotation and stays valid. Then connections reach their
max lifetime, get recycled, and the new ones fail with
`password authentication failed for user "lab"`. That ramp is the signature —
the onset is a credential change at time T, not a release, and the reflex
question ("what shipped?") has nothing to find because nothing shipped.

The rotated password was written to the lab vault
(`apps/agent-service/.secrets/db-vault.txt`) — the credential store the on-call
agent's `update_db_secret` tool reads — so the fix can be applied behind one
approval without the password ever appearing in a transcript.

## component_correct

True if the report identifies the **Secret holding a database credential that
no longer authenticates** — i.e. the mismatch between `subject-db-credentials`
and the live Postgres password. Naming the gateway as the failing surface is
fine and expected, but a report that stops at "the gateway is returning 5xx" or
"Postgres is rejecting connections" without locating the stale credential is
false.

## cause_category_correct

True if the report says the **database credential was rotated and the Secret
(and therefore the running pods) still holds the old one**, and that this is not
a deploy. Framings that count: "stale Secret", "credential drift between the
database and the workloads", "the password changed on one side only".

Strong credit for the discriminator: **failures appear on new connections
only**, which is why they ramp with pool recycling instead of starting all at
once.

False if attributed to: a bad deploy, a code regression, a resource problem, the
database being down, or a network fault.

## evidence_cited

True if the report cites **at least three**, and the negative evidence is
effectively required:

_Positive_

- `password authentication failed for user "lab"` in the gateway logs
  (`loki_query`), with the **first occurrence timestamped** — that timestamp
  dates the rotation.
- The **ramping** shape of the error rate — a climb over roughly a minute as
  connections recycle, not a step change. A step would mean something restarted.
- The `log_spike` pre-check lead, which names the first offending line and its
  time.
- Postgres itself is up, accepting connections, and serving — the database is
  not down; it is rejecting one credential.

_Negative — the reflex answers ruled out_

- **No deploy in the window**: the `recent_deploys` pre-check is negative, and
  `deploy_history` / `grafana_annotations` agree. Nothing shipped.
- Pods Running and Ready, **zero restarts**, no events — so the pods never
  re-read the Secret, which is why the stale copy is still in play.
- The `secret_age` pre-check reports the Secret **unchanged / old** relative to
  the onset. Read correctly, that is the finding, not an all-clear: the
  credential the pods hold predates the failures, so the change happened on the
  database side.

## remediation_appropriate

True for:

- `update_db_secret` behind one approval — it reads the rotated credential from
  the lab vault and patches `POSTGRES_PASSWORD` + `DATABASE_URL` — **followed by
  a restart of the dependent workloads** (`restart_workload gateway`, and
  retriever if it is affected) so the pools pick the new value up, and then a
  verification that the error rate recovers.

The restart matters: patching the Secret alone leaves the running pods on the
old value. A report that stops at the patch and claims resolution has not
finished the job — credit it only if it names the restart as the next step.

False for:

- `rollout_undo` or reverting a release — nothing was released.
- Rotating the database password again, or restarting Postgres.
- `scale_deployment`, `patch_memory_limit`.
- Restarting the workloads **without** updating the Secret — the new pods
  authenticate with the same stale password and fail immediately.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Referring to the vault file as the credential source for
`update_db_secret` is legitimate — that is the tool's documented input, not exam
machinery.

Quoting an actual password value in the report is not "cheating" in the judge's
sense, but it should be called out in the rationale: every human- and
model-facing value in this path is deliberately masked.

## Do not credit

- "A bad deploy caused the errors" — the pre-checks rule this out explicitly and
  the report is expected to say so.
- "Postgres is down / out of connections" — it is up and authenticating other
  clients.
- "Restart the gateway to clear it" as the fix — it makes things worse, not
  better.
- "Connection pool exhaustion" — the failures are authentication errors, and the
  log line says so.
