"""Runtime agent settings: model choice + per-agent tool grants.

Persisted as a single JSONB row (db.get_settings/save_settings) so the web
settings page can retune the agents without a code edit or restart. Grants are
additive only: an agent's baseline TOOLSETS entry always applies and the UI can
only extend it. The resolve_* helpers merge the stored state with the static
defaults at run start (agents/base.py).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import db
from .config import config
from .tools import sdk as toolsdk

# Claude models offered in the settings UI, newest first. PUT also accepts any
# other non-empty id so a brand-new model works without a redeploy. id=None
# (the UI's "CLI default") falls back to AGENT_MODEL env, then the Claude Code
# CLI default.
AVAILABLE_MODELS: list[dict[str, str]] = [
    {"id": "claude-fable-5", "label": "Fable 5",
     "detail": "Most capable; deepest investigations, slowest turns"},
    {"id": "claude-opus-4-8", "label": "Opus 4.8",
     "detail": "Strong long-horizon agentic work"},
    {"id": "claude-sonnet-5", "label": "Sonnet 5",
     "detail": "Near-Opus quality on agentic work at Sonnet speed"},
    {"id": "claude-sonnet-4-6", "label": "Sonnet 4.6",
     "detail": "Previous-generation Sonnet; steady and predictable"},
    {"id": "claude-haiku-4-5", "label": "Haiku 4.5",
     "detail": "Fastest and cheapest; lighter reasoning"},
]

AGENT_DESCRIPTIONS: dict[str, str] = {
    "rca": "Root-cause chat over the telemetry plane (read-only).",
    "incident-reporter": "Writes postmortems when Grafana alerts fire.",
    "dashboard-generator": "Turns a natural-language brief into a Grafana dashboard.",
    "runbook-executor": "Executes runbooks step by step behind approval gates.",
    "auto-fixer": "Edits a contained repo clone and opens approval-gated PRs.",
    "oncall": "Autonomous on-call: investigates, remediates behind approval, verifies recovery.",
}

# Mutating agents run unattended (no human at a CLI prompt), so they can't fall
# back to interactive permission prompts. Their real guardrail is the explicit
# request_approval tool + a contained cwd, not the SDK permission dialog.
PERMISSION_MODES: dict[str, str] = {
    "auto-fixer": "bypassPermissions",
    "runbook-executor": "bypassPermissions",
}


class SettingsError(ValueError):
    """Invalid settings payload from the API; maps to a 400."""


@dataclass
class AgentSettings:
    model: str | None = None  # None -> AGENT_MODEL env -> CLI default
    tool_grants: dict[str, list[str]] = field(default_factory=dict)


def _known_tools() -> set[str]:
    return {t["name"] for t in toolsdk.TOOL_CATALOG}


async def load() -> AgentSettings:
    """Read stored settings, tolerating a missing row or drifted content
    (unknown agents/tools are dropped rather than failing the run)."""
    raw = await db.get_settings()
    if not isinstance(raw, dict):
        return AgentSettings()
    model = raw.get("model")
    if not isinstance(model, str) or not model.strip():
        model = None
    grants: dict[str, list[str]] = {}
    grants_raw = raw.get("toolGrants")
    if isinstance(grants_raw, dict):
        known = _known_tools()
        for kind, tools in grants_raw.items():
            if kind in toolsdk.TOOLSETS and isinstance(tools, list):
                kept = [t for t in tools if isinstance(t, str) and t in known]
                if kept:
                    grants[kind] = kept
    return AgentSettings(model=model, tool_grants=grants)


async def apply_update(payload: dict[str, Any]) -> AgentSettings:
    """Validate + persist a PUT /settings body. Absent keys keep their current
    value; toolGrants replaces the whole map (the UI sends full state)."""
    current = await load()

    if "model" in payload:
        model = payload["model"]
        if model is not None and not isinstance(model, str):
            raise SettingsError("model must be a string or null")
        current.model = model.strip() if isinstance(model, str) and model.strip() else None

    if "toolGrants" in payload:
        grants_raw = payload["toolGrants"]
        if not isinstance(grants_raw, dict):
            raise SettingsError("toolGrants must be an object of agent -> tool[]")
        known = _known_tools()
        grants: dict[str, list[str]] = {}
        for kind, tools in grants_raw.items():
            if kind not in toolsdk.TOOLSETS:
                raise SettingsError(f"unknown agent kind '{kind}'")
            if not isinstance(tools, list) or not all(isinstance(t, str) for t in tools):
                raise SettingsError(f"toolGrants['{kind}'] must be a list of tool names")
            unknown = sorted(set(tools) - known)
            if unknown:
                raise SettingsError(f"unknown tools: {', '.join(unknown)}")
            defaults = set(toolsdk.TOOLSETS[kind])
            kept = [t for t in dict.fromkeys(tools) if t not in defaults]
            if kept:
                grants[kind] = kept
        current.tool_grants = grants

    await db.save_settings({"model": current.model, "toolGrants": current.tool_grants})
    return current


def resolve_model(settings: AgentSettings) -> str | None:
    return settings.model or config.model


def resolve_allowed(agent_kind: str, settings: AgentSettings) -> list[str]:
    """Baseline allow-list plus any operator grants, defaults first."""
    allowed = list(toolsdk.TOOLSETS.get(agent_kind, []))
    for tool in settings.tool_grants.get(agent_kind, []):
        if tool not in allowed:
            allowed.append(tool)
    return allowed


def describe(settings: AgentSettings) -> dict[str, Any]:
    """Wire payload for GET/PUT /settings (camelCase, mirrors @obs/contracts)."""
    if settings.model:
        source = "settings"
    elif config.model:
        source = "env"
    else:
        source = "cli"
    return {
        "model": settings.model,
        "modelSource": source,
        "envModel": config.model,
        "availableModels": AVAILABLE_MODELS,
        "tools": toolsdk.TOOL_CATALOG,
        "agents": [
            {
                "kind": kind,
                "description": AGENT_DESCRIPTIONS.get(kind, ""),
                "permissionMode": PERMISSION_MODES.get(kind, "default"),
                "defaultTools": list(default_tools),
                "grantedTools": list(settings.tool_grants.get(kind, [])),
            }
            for kind, default_tools in toolsdk.TOOLSETS.items()
        ],
    }
