# infra/postgres

Postgres init scripts (pgvector, subject-system tables) — Phases 1, 5.

`init/` is mounted read-only into the `pgvector/pgvector:pg16` container at
`/docker-entrypoint-initdb.d`, so every `*.sql` file there runs once on first boot.

- `init/01-init.sql` (Phase 1): enables the `vector` extension and creates the
  `chunks` (corpus + embeddings) and `usage_events` (per-chat metering) tables,
  plus the `usage_events` tenant/time index. The IVFFlat vector index is **not**
  created here — the retriever seed script builds it after the corpus loads so it
  trains on real vectors.

Phase 5 will add evaluation and experiment tables.
