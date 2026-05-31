# @obs/model-proxy

The mock LLM — the keystone of the lab. Exposes `POST /v1/complete`
(`CompleteRequest` → `CompleteResponse`) returning a **deterministic** completion
derived from a hash of the prompt (and context). When `context` is non-empty the
completion begins with `Based on: "<first 80 chars of context[0]>" …` so the
gateway can prove a retrieved chunk was used. `model` is always `mock-llm-v1`.

It also ships a rich, env-tunable **fault model** (`src/slices/complete/faults.ts`):
probabilistic 500s/429s, occasional stalls, gamma-distributed latency
(Marsaglia–Tsang sampler), and error clustering ("bad minute"). Set
`FAULTS_ENABLED=false` for a deterministic, never-erroring proxy. See
`.env.example` for every knob, and `docs/adr/002-subject-system.md` §6.1 for the spec.

No telemetry — plain `console` logging only (that arrives in Phase 2).
