import type { Incident } from "@obs/contracts";

/**
 * A canned incident so the inbox and postmortem rendering are demonstrable
 * before the reporter agent (Phase 5) writes real rows. Clearly labeled in
 * the UI; removed from the list as soon as Postgres has real incidents.
 */
export const SAMPLE_INCIDENT: Incident = {
  id: "sample-001",
  title: "Elevated 5xx on /v1/chat after model-proxy deploy",
  severity: "sev2",
  status: "resolved",
  tenant: "acme",
  openedAt: "2026-06-08T14:12:00.000Z",
  resolvedAt: "2026-06-08T14:41:00.000Z",
  summary:
    "Gateway 5xx share rose to 7.4% for 18 minutes. Root cause: model-proxy timeout set below upstream p99 after the chaos flag was left on. (Sample postmortem — the reporter agent produces these in Phase 5.)",
  postmortemMd: `# Postmortem: elevated 5xx on /v1/chat

**Severity:** sev2 · **Duration:** 29 min · **Tenants affected:** acme, bravo

## Impact

7.4% of chat completions returned \`502\` between 14:12 and 14:30 UTC.
p95 latency rose from 840ms to 2.9s on the same window.

## Root cause

The \`CHAOS_SLOW_UPSTREAM\` flag was left enabled on model-proxy after a
resilience drill, pushing upstream p99 above the proxy's 2s timeout. Every
timed-out call surfaced as a gateway 502.

## Detection

The burn-rate alert on the gateway availability SLO fired at 14:14 —
2 minutes after impact start. Exemplar traces pointed at model-proxy spans
ending in \`DEADLINE_EXCEEDED\`.

## Resolution

1. Disabled the chaos flag (14:28).
2. Error share back under 1% by 14:31; alert resolved at 14:41.

## Follow-ups

- [ ] Chaos flags auto-expire after 60 minutes.
- [ ] Pre-deploy check: proxy timeout > upstream p99 × 1.5.
`,
  links: {},
};
