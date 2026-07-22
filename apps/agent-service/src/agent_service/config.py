"""Runtime configuration for agent-service.

Defaults target host dev against the local compose stack (mapped ports). When
the service runs *inside* compose, every URL is overridden by environment in
infra/compose.agents.yml (service-DNS names, internal ports).
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value if value else default


def _anchored(path: str) -> str:
    """Resolve a possibly-relative filesystem path against the repo root.

    .env values like `runbooks` or `.artifacts` mean repo-relative, never
    cwd-relative — the service starts in apps/agent-service, and mixing
    cwd-relative paths across subprocess cwds breaks (WinError 267 in the
    auto-fixer's workspace prep, runbook_read looking in the wrong tree).
    """
    return path if os.path.isabs(path) else os.path.join(LAB_ROOT, path)


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
    # Grafana file-provisioned dashboards; agent edits to those uids are
    # mirrored here so the file provider doesn't revert them (~30s scan).
    grafana_dashboards_dir: str

    # Fixed dev credentials (mirrors the BFF: ADR-002, the `acme` tenant).
    dev_tenant: str

    # Shared secret for state-changing endpoints (X-Obs-Token header). The
    # service binds 0.0.0.0, so the approval gate must not be LAN-bypassable
    # (PLAN-2 P7). None = endpoints stay closed and report how to fix it.
    obs_token: str | None

    # The local forge (PLAN-2 P9): Gitea on the VM. Tokened API access for the
    # delivery-history tools + real PRs from the auto-fixer; repo is the
    # owner/name of the subject source. Empty token = tools report how to fix.
    gitea_url: str
    gitea_token: str
    gitea_repo: str

    # The agents' read-only cluster window (PLAN-2 P8): agent-ro kubeconfig
    # minted by `obs k8s agent-kubeconfig`, the kubernetes-mcp-server launch
    # command (version-pinned npx), and its TOML (denies Secret reads). The
    # MCP server is only spawned when the kubeconfig file exists.
    k8s_kubeconfig: str
    k8s_mcp_cmd: str
    k8s_mcp_config_path: str

    # Unified alert ingress (PLAN-2 P11): the HMAC secret Grafana's webhook
    # contact point signs /webhook/alerts payloads with (hmacConfig.secret in
    # contact-points.yaml). Empty = signature verification is SKIPPED (a
    # startup warning is logged) — fine for host dev behind the tailnet, never
    # for an endpoint reachable beyond localhost.
    alert_webhook_secret: str
    # Reserved for the oncall debounce/verification watcher: the minimum gap
    # between re-firings of the same alert_key before it's treated as a fresh
    # escalation, and the recheck cadence after a proposed fix ships.
    oncall_debounce_seconds: int
    oncall_verify_minutes: int


def load_config() -> Config:
    otel = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").strip() or None
    model = os.environ.get("AGENT_MODEL", "").strip() or None
    subject_repo = os.environ.get("SUBJECT_REPO_DIR", "").strip() or None
    alert_webhook_secret = os.environ.get("ALERT_WEBHOOK_SECRET", "").strip()
    if not alert_webhook_secret:
        logging.getLogger(__name__).warning(
            "ALERT_WEBHOOK_SECRET is not set; /webhook/alerts will accept unsigned "
            "payloads. Set it (and Grafana's contact-point hmacConfig.secret) before "
            "exposing this endpoint beyond localhost."
        )
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
        runbooks_dir=_anchored(_env("RUNBOOKS_DIR", "runbooks")),
        subject_repo_dir=_anchored(subject_repo) if subject_repo is not None else None,
        artifacts_dir=_anchored(_env("ARTIFACTS_DIR", ".artifacts")),
        grafana_dashboards_dir=_anchored(
            _env("GRAFANA_DASHBOARDS_DIR", "infra/grafana/provisioning/dashboards")
        ),
        dev_tenant=_env("DEV_TENANT", "acme"),
        obs_token=os.environ.get("OBS_TOKEN", "").strip() or None,
        gitea_url=_env("GITEA_URL", "http://obs-vm:3005").rstrip("/"),
        gitea_token=os.environ.get("GITEA_TOKEN", "").strip(),
        gitea_repo=_env("GITEA_REPO", "obs/obs-lab"),
        # KUBECONFIG is what `obs agents` already exports when the minted file
        # exists; K8S_KUBECONFIG wins if both are set.
        k8s_kubeconfig=_anchored(
            _env("K8S_KUBECONFIG", _env("KUBECONFIG", "apps/agent-service/.kube/agent-ro.yaml"))
        ),
        k8s_mcp_cmd=_env("K8S_MCP_CMD", "npx -y kubernetes-mcp-server@0.0.65"),
        k8s_mcp_config_path=_anchored(
            _env("K8S_MCP_CONFIG", "apps/agent-service/k8s-mcp.toml")
        ),
        alert_webhook_secret=alert_webhook_secret,
        oncall_debounce_seconds=int(_env("ONCALL_DEBOUNCE_SECONDS", "90")),
        oncall_verify_minutes=int(_env("ONCALL_VERIFY_MINUTES", "10")),
    )


config = load_config()
