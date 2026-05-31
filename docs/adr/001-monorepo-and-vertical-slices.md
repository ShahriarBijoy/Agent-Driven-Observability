# ADR-001: Monorepo, Bun + Turborepo, and Vertical-Slice DDD

**Status:** Accepted
**Date:** 2026-05-31

---

## Context

We need a free, fully local, multi-language learning lab (TypeScript + Python) that spans approximately eight services plus shared packages and Docker Compose infrastructure. Goals:

- Fast feedback loop: installs, type-checks, lints, and tests must complete in seconds on a laptop.
- Clear dependency graph: shared types must flow from a single source of truth; circular dependencies must be visible and blockable at CI time.
- Teach Domain-Driven Design (DDD) by making each feature independently observable — every feature slice carries its own telemetry, so there is a direct, visible connection between a business capability and its metrics/traces/logs.
- Support Python services (an AI agent and a data-quality runner) alongside TypeScript services without forcing Python into the Node ecosystem.
- Stay operable by one engineer; no paid cloud services required in the baseline path.

---

## Decision

### (a) Single monorepo with Bun workspaces

All TypeScript packages (`packages/*`) and TypeScript applications (`apps/*`) are managed as a single Bun workspace rooted at the repo root. A single `bun install` resolves and links the entire dependency graph. Python apps (`agent-service`, `dq-runner`) live under `apps/` but are explicitly excluded from the Bun workspace via `workspaces` globs — they carry their own `pyproject.toml` and are managed by `uv`.

### (b) Turborepo as the task runner

Turborepo orchestrates `build`, `dev`, `lint`, `typecheck`, and `test` across all packages. The `build` task declares `"dependsOn": ["^build"]` so that the dependency graph drives execution order — a downstream package never builds before its upstream dependencies. Remote caching (Vercel) is opt-in and not required locally.

### (c) Vertical-slice DDD inside each TypeScript service

Code inside each service is organized by **feature (slice)**, not by layer. A slice directory contains:

```
src/
  <feature>/
    domain/          # entities, value objects, domain events
    ports/           # interfaces (in/out) — pure TypeScript
    adapters/        # concrete I/O adapters (DB, HTTP clients, Kafka)
    handlers/        # entry points (HTTP route handler, Kafka consumer)
    telemetry/       # OTEL spans, metrics, and log fields scoped to this slice
    slice.ts         # wires the above together; exported from index.ts
  platform/          # cross-cutting concerns (config, logger, tracer setup)
```

Each slice's `telemetry/` folder is the direct link between a business capability and its observability signal — a deliberate design choice to reinforce that observability is a feature property, not a platform afterthought.

### (d) OXC (Oxlint + Oxfmt) for lint and format

Oxlint and Oxfmt replace ESLint and Prettier. Both are Rust-based and run 10–100x faster than their JavaScript counterparts. `oxlint` enforces correctness and best-practice rules; `oxfmt` enforces formatting. Each TypeScript package runs `oxlint .` as its `lint` script. Formatting is a repo-wide concern run from the root: `format` (`oxfmt --write .`) and `format:check` (`oxfmt --check .`), both honoring `.gitignore`.

### (e) Shared `@obs/tsconfig` package

A single shared package exports three TypeScript config presets:

| Preset         | Used by          | Key flags                                                                                           |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `base.json`    | inherited by all | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler`, `noEmit` |
| `library.json` | `packages/*`     | extends base; `declaration: true`                                                                   |
| `service.json` | `apps/*` (TS)    | extends base; `types: ["node"]`                                                                     |

### (f) Python apps managed with `uv`

`agent-service` and `dq-runner` are pure Python projects. They live under `apps/` for discoverability but have no `package.json` and are not listed in the Bun `workspaces` array. Each carries a `pyproject.toml` with `requires-python = ">=3.11"` and is installed/run via `uv`. A future phase may add a Turborepo task shim (`"build": "uv sync"`) so the task graph can include Python projects.

---

## Alternatives Considered

| Alternative                                                      | Why rejected                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **pnpm or npm workspaces + Nx or Lerna**                         | Heavier toolchain; less Bun-native; Nx's daemon and caching model adds complexity with marginal benefit at this scale.                                                   |
| **Layered architecture** (controllers / services / repositories) | Worse for per-feature observability: a feature's telemetry ends up scattered across layers, making it hard to see which business capability is responsible for a signal. |
| **ESLint + Prettier**                                            | Correct and familiar, but 10–100x slower than OXC on large codebases; adds significant config surface area.                                                              |
| **Polyrepo**                                                     | Loses shared Zod schemas and TypeScript types; requires separate install/CI for each service; impossible to run the full lab with one command.                           |
| **Nx instead of Turborepo**                                      | Nx is capable, but its plugin system and daemon are heavier than what a local learning lab needs. Turborepo's `turbo.json` is simpler to read and teach.                 |

---

## Consequences

### Positives

- One `bun install` links the entire graph; internal packages resolve via `workspace:*` with no symlink surprises.
- Turborepo's task graph ensures dependency-ordered builds and enables incremental runs (only changed packages re-run).
- Shared `@obs/contracts` (Zod schemas) and `@obs/domain` (value objects) give a single source of truth for event shapes across TypeScript services.
- OXC lint and format run in milliseconds — negligible friction in the inner loop.
- Vertical slices make each phase of the lab independently completable: a Phase 3 slice can be fully tested (unit + integration + telemetry) without Phase 4 existing.

### Negatives / Risks

- Bun workspaces are less battle-tested than pnpm workspaces; edge cases with hoisting and peer-dependency resolution may surface.
- Turborepo's primary value here is the task graph and incremental runs; remote caching (the flagship feature) requires a Vercel account or self-hosted cache server.
- Vertical slices require discipline: cross-slice logic must live in `platform/` or a shared package, not be copy-pasted between slices. Code review must enforce this.
- `uv` for Python is a newer tool; contributors unfamiliar with it will need a short onboarding step.

---

## Implementation Notes / Deviations from `docs/PLAN.html`

The following deviations from the original plan are recorded here explicitly so future contributors understand why the implementation differs from the written plan:

1. **Formatter config filename is `.oxfmtrc.json`, not `oxfmt.json`.** Oxfmt 0.52's actual default config filename is `.oxfmtrc.json`. The plan document wrote `oxfmt.json`, which oxfmt 0.52 does not recognize. The implementation uses `.oxfmtrc.json`.

2. **Oxfmt style knobs (line-width, quote style) are deferred.** Oxfmt 0.52 is opinionated and exposes limited style configuration (Prettier-compatible defaults). The `lineWidth` and `singleQuote` knobs noted in the plan are not available in 0.52 and are deferred until a future oxfmt release exposes them.

3. **Vitest pinned to `^3.2.0`, not `^4.x`.** Vitest 4 removed the `defineWorkspace` API and the `vitest.workspace.ts` file. The plan documents use `defineWorkspace`; to avoid a breaking API mismatch, Vitest is pinned to `^3.2.0`. A later phase should migrate to the Vitest 4 `projects` config.

4. **Python `requires-python` floor is `>=3.11`, not `>=3.12`.** Only Python 3.11.9 is installed in the local environment. The plan recommends 3.12+. The floor is set to 3.11 so the lab runs without additional installs; `uv` can fetch 3.12+ on demand when later phases require it.

5. **Turborepo requires a `packageManager` field; the `build` task's `outputs` were dropped for now.** Turbo 2.9 refuses to resolve the workspace graph unless the root `package.json` declares `packageManager` — it is set to `bun@1.3.8` (Bun ignores this field; only Turbo reads it). Separately, because Phase 0 `build` scripts are no-ops (`echo`) that emit no files, the `build` task's `outputs: ["dist/**"]` key was removed to avoid spurious "no output files found" warnings; it will be reinstated once services emit real build artifacts.
