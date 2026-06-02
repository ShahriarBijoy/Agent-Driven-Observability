# infra

Docker Compose skeleton and service configuration for the AI Observability Lab.

## Compose files

| File                        | Purpose                                                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yml`               | Root file. Defines the two shared networks and (Phase 1) the subject system: `postgres`, `redis`, the four TS services (`gateway`/`embedder`/`retriever`/`model-proxy`), a one-shot `seed` job, and `load-generator` behind the `load` profile. Always required. |
| `compose.observability.yml` | Observability plane (Phase 2): Grafana Alloy (OTLP ingress), Loki, Tempo, Mimir, and Grafana. Compose alongside `compose.yml`. (Pyroscope/profiling arrives in a later phase.)                                                                                   |
| `compose.lineage.yml`       | Lineage plane: Marquez + its dedicated Postgres. Populated in Phase 3.                                                                                                                                                                                           |

## Subject system (Phase 1)

The four TypeScript services share a single image built from `Dockerfile`
(`oven/bun:1.3.8`, the whole workspace copied, `bun install --frozen-lockfile`).
Each service is selected at runtime by its `working_dir` (`/app/apps/<svc>`) and
`bun run start`. Bring the subject plane up on its own with:

```
docker compose -f infra/compose.yml up -d --build
```

Add `--profile load` to also start the load generator. `scripts/smoke.sh` runs
the full build → seed → chat flow and asserts an end-to-end RAG response.

## Observability plane (Phase 2)

Compose the observability plane on top of the subject system:

```
docker compose -f infra/compose.yml -f infra/compose.observability.yml up -d --build
```

Services export OTLP/HTTP to **Grafana Alloy** (`alloy:4318`), which batches and fans out to
**Loki** (logs), **Tempo** (traces), and **Mimir** (metrics). Tempo's metrics-generator
derives RED span-metrics + a service graph (with exemplars) and remote-writes them to Mimir.
**Grafana** (http://localhost:3001, anonymous admin) auto-provisions the datasources, the
Gateway RED + RAG Pipeline dashboards, and two alert rules. Metrics take the OTLP-direct path
to Mimir so exemplars survive — see `docs/adr/003-application-observability.md` for the
rationale and the Bun-specific manual-instrumentation deviation. Per-tool config lives in the
subdirectories below.

## Networks

| Network | Name          | Purpose                                                             |
| ------- | ------------- | ------------------------------------------------------------------- |
| `app`   | `obs-lab-app` | Subject system services and Marquez communicate on this network.    |
| `obs`   | `obs-lab-obs` | Alloy, Loki, Tempo, Mimir, and Grafana communicate on this network. |

The four TS services are attached to **both** networks: they serve subject traffic on `app`
and push OpenTelemetry over OTLP to `alloy:4318` on `obs`. Alloy (on `obs`) batches and fans
out to Loki, Tempo, and Mimir; Grafana reads those backends on `obs`.

## Subdirectories

Each subdirectory holds configuration for a single tool. See the README inside each
directory for the phase that populates it.
