# @obs/load-generator

Synthetic load generator (ADR-002 §6.5). Drives weighted, chaotic traffic at the
gateway to exercise the observability pipeline, then prints a summary and exits 0.

## Run

```sh
bun run start
```

Configurable via env (see `.env.example`): `GATEWAY_URL`, `TARGET_QPS`,
`DURATION_SECONDS`, `REQUEST_TIMEOUT_MS`, `CONCURRENCY`, `SCENARIO_WEIGHTS`.

`SCENARIO_WEIGHTS` (e.g. `"long:80,happy:20"`) replaces the default mix with a
skewed one — listed scenarios get the given weights, unlisted ones are dropped.
`obs load drift` / `obs load abuse` use this to drive data-drift and 429-storm
tests (see `scripts/obs.ps1` and `docs/commands.html`).

## Fail-test schedules (`bun run chaos`, or `obs fail <name>`)

One YAML per failure mode in `chaos/`: `latency`, `errors`, `timeout`, `outage`,
`brownout`, `flaky`, `throttle`, plus the original `full` cycle and the
compressed `demo` burst. Each header documents what should page and what the
RCA agent is expected to pinpoint.

## Scenarios (weighted ~55/20/10/10/5)

| scenario  | tenant / token              | intent                                  |
| --------- | --------------------------- | --------------------------------------- |
| `happy`   | acme / `dev-local-token`    | valid prompts → 2xx                     |
| `repeat`  | bravo / `dev-token-bravo`   | small fixed prompt set → cache-friendly |
| `long`    | acme / `dev-local-token`    | very long (but valid) prompt            |
| `abusive` | abuser / `dev-token-abuser` | tiny bucket → bursts trip 429           |
| `broken`  | acme / `dev-local-token`    | malformed JSON / missing prompt → 422   |

## Outcome buckets

`ok` (2xx) · `rateLimited` (429) · `clientError` (other 4xx) ·
`serverError` (5xx except 504) · `timeout` (504 or client abort/network).

The bucketing function (`src/classify.ts`) is pure and unit-tested independently
of the request loop (`src/runner.ts`).
