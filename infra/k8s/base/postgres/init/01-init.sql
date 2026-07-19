-- Subject-system schema (Phase 1).
-- Runs once on first boot of the pgvector/pgvector:pg16 container via
-- /docker-entrypoint-initdb.d. Extension + tables only.
-- NOTE: the IVFFlat index is intentionally NOT created here. The retriever
-- seed script builds it AFTER data load so it trains on real vectors.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  body TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_tenant_idx ON usage_events (tenant, created_at);
