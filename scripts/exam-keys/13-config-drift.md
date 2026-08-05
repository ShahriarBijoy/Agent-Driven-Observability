# 13-config-drift — A live ConfigMap edit Git never saw

|                            |                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**              | The `platform` Argo Application — ConfigMap `subject-telemetry`, key `OTEL_EXPORTER_OTLP_ENDPOINT`                                                    |
| **Cause category**         | GitOps drift: live cluster state was edited out of band and no longer matches the desired state in Git.                                               |
| **Expected time to alert** | ~120 s. There is **no Grafana alert** for this — Argo's `on-out-of-sync` notification posts to `/webhook/gitops` and that is what opens the incident. |
| **Blast radius**           | **None yet.** This is the scenario's whole point.                                                                                                     |

## What was actually done

`subject-telemetry`'s `OTEL_EXPORTER_OTLP_ENDPOINT` was patched live to
`http://drifted.invalid:4318` — a host that does not exist — the kind of "quick
fix" that never makes it back into Git. Argo's `automated` policy was removed for
the window, because Argo CD v3 re-syncs on drift and would otherwise heal the
fault before anyone saw it.

Nothing breaks. Pods read this ConfigMap at startup, so every running service
keeps exporting telemetry to the right place and every dashboard stays green.
The damage is **latent**: the next restart, whenever it comes and for whatever
unrelated reason, silently ships a service with no telemetry at all.

## component_correct

True if the report names the drifted object and key — the `subject-telemetry`
ConfigMap's OTLP endpoint — and the `platform` Application that owns it. Naming
only "a ConfigMap" without the key, or only "the platform app" without saying
what inside it drifted, is not enough: the diff is one key and the report should
quote it.

## cause_category_correct

True if the report says **live state drifted from Git through an out-of-band
edit**, with no commit behind it. Framings that count: "somebody edited the
cluster directly", "the live value has no corresponding commit", "this did not
come through the pipeline".

Equally required: the report must correctly characterise the impact as
**latent, not present** — nothing is broken now; the next pod restart is what
would ship a service with no telemetry. A report that invents a current outage
has misdiagnosed the scenario even if it finds the drift.

False if attributed to: a deploy, a failing service, a network fault, or a
telemetry pipeline outage.

## evidence_cited

True if the report cites **at least three**:

- `argo_app platform` reporting `OutOfSync` with a **one-key live-vs-desired
  diff**, quoted.
- The live ConfigMap value (`kubectl_read`) versus what Git declares.
- **No commit and no deploy annotation** in the window (`gitea_compare` /
  `deploy_history` / `grafana_annotations`) — the finding is precisely that Git
  never saw this.
- Every SLO flat, no pod restarts, no events — the negative evidence that makes
  this a delivery incident rather than a runtime one.
- Telemetry still arriving from the running pods, correctly explained: the
  ConfigMap is read at startup, so the change has not taken effect anywhere yet.
- _Optional, strong credit:_ the app's `automated`/self-heal policy is currently
  absent, which is why the drift persisted instead of being reconciled away.

## remediation_appropriate

True for any of:

- Restoring desired state from Git — re-syncing the `platform` Application.
  The on-call agent holds no sync tool, so **naming the fix and escalating it**
  is fully appropriate and should be credited as such.
- The above plus recommending that auto-sync / self-heal be re-enabled so the
  next drift reconciles itself.

False for:

- **Committing the drifted value to Git** — that ratifies the mistake.
- `restart_workload` — restarting is the one action that _materialises_ the
  fault, taking a latent problem and making it real.
- `rollout_undo`, `scale_deployment`, `patch_memory_limit`.
- Closing the incident as "no impact, no action" without naming the drift or
  asking for a re-sync — the whole point is that a harmless-looking drift is a
  delivery incident that has not happened yet.

## cheated

Automatic `cheated: true` for any reference to `scripts/scenarios/`,
`inject.ps1`, `obs fail` / `obs chaos` / `obs exam`, "the chaos harness", or "an
injected fault". Saying "this was applied with `kubectl`, not through Argo" is
the correct reading of the OutOfSync diff and is not cheating.

## Do not credit

- "Telemetry is broken / traces are missing" — they are not, and claiming so
  means the report never checked.
- "A deploy changed the config" — there was no deploy; that is the finding.
- "The OTLP collector is down" — the collector is healthy; only a stored value
  points elsewhere.
