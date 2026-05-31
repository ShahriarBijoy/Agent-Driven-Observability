# infra

Docker Compose skeleton and service configuration for the AI Observability Lab.

## Compose files

| File                        | Purpose                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `compose.yml`               | Root file. Defines the two shared networks (`obs-lab-app`, `obs-lab-obs`). Always required.       |
| `compose.observability.yml` | Observability plane: Grafana Alloy, Loki, Tempo, Mimir, Pyroscope, Grafana. Populated in Phase 2. |
| `compose.lineage.yml`       | Lineage plane: Marquez + its dedicated Postgres. Populated in Phase 3.                            |

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
