# infra

Docker Compose skeleton and service configuration for the AI Observability Lab.

## Compose files

| File                        | Purpose                                                                                                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compose.yml`               | Root file. Defines the two shared networks and (Phase 1) the subject system: `postgres`, `redis`, the four TS services (`gateway`/`embedder`/`retriever`/`model-proxy`), a one-shot `seed` job, and `load-generator` behind the `load` profile. Always required. |
| `compose.observability.yml` | Observability plane: Grafana Alloy, Loki, Tempo, Mimir, Pyroscope, Grafana. Populated in Phase 2.                                                                                                                                                                |
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

## Networks

| Network | Name          | Purpose                                                                 |
| ------- | ------------- | ----------------------------------------------------------------------- |
| `app`   | `obs-lab-app` | Subject system services and Marquez communicate on this network.        |
| `obs`   | `obs-lab-obs` | Observability backends (LGTM stack, Alloy) communicate on this network. |

Alloy bridges both networks so it can scrape the subject system (`app`) and push
signals to the observability backends (`obs`).

## Subdirectories

Each subdirectory holds configuration for a single tool. See the README inside each
directory for the phase that populates it.
