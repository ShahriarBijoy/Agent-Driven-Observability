# @obs/web — the control plane

TanStack Start app (React 19, Tailwind v4, `@obs/ui` tokens) serving the lab's
operator UI on **http://localhost:3003**.

```sh
bun run dev    # from apps/web, or `bun run dev` at the root (turbo)
```

## Routes

| Route              | What it is                                                          |
| ------------------ | ------------------------------------------------------------------- |
| `/`                | Golden signals (Mimir), recent incidents + agent runs               |
| `/telemetry`       | Embedded Grafana dashboards (kiosk, anonymous auth)                 |
| `/lineage`         | Embedded Marquez UI                                                 |
| `/agents`          | Chat with the (Phase-4 echo) agent — SSE streaming, tool-call panel |
| `/agents/runs/:id` | Run detail: message log, tool timeline, artifacts, approval gate    |
| `/incidents`       | Incident inbox + rendered postmortems                               |
| `/runbooks`        | Lists `runbooks/*.md`, "run with executor" starts a gated run       |
| `/settings`        | Dev token/tenant, tenant registry, agent permission matrix          |

## Architecture notes

- **BFF pattern** — pages call server functions (`src/server/functions.ts`);
  the typed seam to the future agent-service is `src/server/agent-client.ts`,
  validated against `@obs/contracts` on the way out.
- **Echo agent** — `src/server/runs-store.ts` is an in-memory placeholder that
  exercises the real wire protocol (SSE `AgentStreamEvent` frames, approval
  gates) until Phase 5 replaces it with agent-service.
- **Browser RUM** — `src/lib/rum.ts` initializes the OTel web SDK; fetch spans
  export to Alloy (:4318) and join the gateway's trace tree.
- **Design** — all colors/typography come from `@obs/ui/styles/tokens.css`.
  No ad-hoc colors; the theme is part of the spec.
