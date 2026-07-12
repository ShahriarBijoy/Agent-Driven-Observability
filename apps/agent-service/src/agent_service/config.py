"""Runtime configuration for agent-service.

Defaults target host dev against the local compose stack (mapped ports). When
the service runs *inside* compose, every URL is overridden by environment in
infra/compose.agents.yml (service-DNS names, internal ports).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value if value else default


# Repo root, four levels up from this file (src/agent_service/config.py ->
# apps/agent-service -> apps -> root). The service starts in apps/agent-service,
# so runbook/artifact paths must anchor here, not the process cwd.
LAB_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))


@dataclass(frozen=True)
class Config:
    port: int
    database_url: str
    otel_endpoint: str | None
    service_name: str

    # Telemetry-plane read APIs (the agent tools query these).
    grafana_url: str
    loki_url: str
    tempo_url: str
    mimir_url: str
    marquez_url: str

    # Claude model id; None lets the Agent SDK / CLI pick its default.
    model: str | None

    # Repo root the runbook executor uses as its working directory.
    lab_root: str

    # Filesystem roots the mutating agents are scoped to.
    runbooks_dir: str
    subject_repo_dir: str | None
    artifacts_dir: str

    # Fixed dev credentials (mirrors the BFF: ADR-002, the `acme` tenant).
    dev_tenant: str


def load_config() -> Config:
    otel = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip() or None
    model = os.environ.get("AGENT_MODEL", "").strip() or None
    subject_repo = os.environ.get("SUBJECT_REPO_DIR", "").strip() or None
    return Config(
        port=int(_env("AGENT_SERVICE_PORT", "8093")),
        database_url=_env(
            "DATABASE_URL", "postgres://lab:lab@localhost:5432/observability_lab"
        ),
        otel_endpoint=otel,
        service_name=_env("OTEL_SERVICE_NAME", "agent-service"),
        grafana_url=_env("GRAFANA_URL", "http://localhost:3001"),
        loki_url=_env("LOKI_URL", "http://localhost:3100"),
        tempo_url=_env("TEMPO_URL", "http://localhost:3200"),
        mimir_url=_env("MIMIR_URL", "http://localhost:9009"),
        marquez_url=_env("MARQUEZ_URL", "http://localhost:5000"),
        model=model,
        lab_root=LAB_ROOT,
        runbooks_dir=_env("RUNBOOKS_DIR", os.path.join(LAB_ROOT, "runbooks")),
        subject_repo_dir=subject_repo,
        artifacts_dir=_env("ARTIFACTS_DIR", os.path.join(LAB_ROOT, ".artifacts")),
        dev_tenant=_env("DEV_TENANT", "acme"),
    )


config = load_config()
