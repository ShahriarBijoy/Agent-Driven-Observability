"""Claude Agent SDK wiring for the tool layer.

Wraps the backend impls as @tool functions, builds the in-process MCP server
(per run, so the ctx-bound approval/artifact tools close over the right run),
and centralises the per-agent allow-list + system prompt. Only those two differ
between agents — the toolkit is shared.
"""

from __future__ import annotations

import json
import os
from typing import Any

from claude_agent_sdk import create_sdk_mcp_server, tool

from ..config import config
from ..context import RunContext
from . import backends
from .validation import safe_artifact_name

SERVER = "obslab"


def mcp(name: str) -> str:
    return f"mcp__{SERVER}__{name}"


def _text(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, default=str)}],
        "is_error": "error" in payload,
    }


# ---- stateless tools (defined once) -----------------------------------------


@tool(
    "loki_query",
    "Query Loki logs with a LogQL expression over a lookback window. "
    'Example logql: {service="gateway"} |= "error". Returns log lines newest-first.',
    {
        "type": "object",
        "properties": {
            "logql": {"type": "string", "description": "LogQL query"},
            "range": {"type": "string", "description": "lookback like 15m, 1h, 24h (default 1h)"},
            "limit": {"type": "integer", "description": "max lines (default 100)"},
        },
        "required": ["logql"],
    },
)
async def _loki(args: dict) -> dict:
    return _text(
        await backends.loki_query(args["logql"], args.get("range", "1h"), int(args.get("limit", 100)))
    )


@tool(
    "tempo_query",
    "Search traces with TraceQL, or fetch one full trace by passing a 32-hex trace id. "
    'Example traceql: {service.name="gateway" && duration>1s}.',
    {
        "type": "object",
        "properties": {
            "traceql": {"type": "string", "description": "TraceQL query or a 32-hex trace id"},
            "range": {"type": "string", "description": "lookback like 15m, 1h (default 1h)"},
            "limit": {"type": "integer", "description": "max traces (default 20)"},
        },
        "required": ["traceql"],
    },
)
async def _tempo(args: dict) -> dict:
    return _text(
        await backends.tempo_query(args["traceql"], args.get("range", "1h"), int(args.get("limit", 20)))
    )


@tool(
    "mimir_query",
    "Run a PromQL query against Mimir. Omit range for an instant value; provide a range "
    "(e.g. 1h) for a range vector. Example promql: histogram_quantile(0.95, "
    "sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le)).",
    {
        "type": "object",
        "properties": {
            "promql": {"type": "string", "description": "PromQL query"},
            "range": {"type": "string", "description": "range like 1h for a range query; omit for instant"},
            "step": {"type": "string", "description": "step like 60s (range queries only)"},
        },
        "required": ["promql"],
    },
)
async def _mimir(args: dict) -> dict:
    return _text(
        await backends.mimir_query(args["promql"], args.get("range", ""), args.get("step", "60s"))
    )


@tool(
    "marquez_lineage",
    "Return the OpenLineage graph around a dataset from Marquez. Pass a dataset name "
    '(e.g. "inferences") or "namespace:name". Use to trace data dependencies upstream/downstream.',
    {
        "type": "object",
        "properties": {
            "dataset": {"type": "string", "description": "dataset name or namespace:name"},
            "depth": {"type": "integer", "description": "graph depth (default 2)"},
        },
        "required": ["dataset"],
    },
)
async def _marquez(args: dict) -> dict:
    return _text(await backends.marquez_lineage(args["dataset"], int(args.get("depth", 2))))


@tool(
    "pg_select",
    "Run a read-only SELECT against the lab database. Allowed tables: inferences, "
    "dq_violations, usage_events, chunks, agent_*. Use $1, $2 placeholders with params. "
    "Writes and non-allow-listed tables are refused.",
    {
        "type": "object",
        "properties": {
            "sql": {"type": "string", "description": "a single SELECT statement"},
            "params": {"type": "array", "description": "positional params for $1, $2, ...",
                       "items": {}},
        },
        "required": ["sql"],
    },
)
async def _pg(args: dict) -> dict:
    return _text(await backends.pg_select(args["sql"], args.get("params") or []))


@tool(
    "grafana_create_dashboard",
    "Create (or overwrite) a Grafana dashboard from a dashboard JSON model. Pass the inner "
    "dashboard model as a JSON string. Reversible, so no approval is required.",
    {
        "type": "object",
        "properties": {
            "dashboard": {"type": "string", "description": "dashboard JSON (the inner model)"},
        },
        "required": ["dashboard"],
    },
)
async def _grafana(args: dict) -> dict:
    return _text(await backends.grafana_create_dashboard(args["dashboard"]))


@tool(
    "runbook_read",
    "Read a Markdown runbook from the runbooks/ directory by relative path "
    '(e.g. "gateway-high-error-rate.md").',
    {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
)
async def _runbook(args: dict) -> dict:
    return _text(await backends.runbook_read(args["path"]))


_STATELESS = [_loki, _tempo, _mimir, _marquez, _pg, _grafana, _runbook]


# ---- per-run server (binds ctx into approval + artifact) ---------------------


def build_mcp_server(ctx: RunContext):
    @tool(
        "request_approval",
        "Pause and ask the human operator to approve a sensitive action before proceeding. "
        "Returns the decision. If denied, do NOT proceed — stop and explain.",
        {
            "type": "object",
            "properties": {
                "prompt": {"type": "string", "description": "one operator-readable sentence"},
            },
            "required": ["prompt"],
        },
    )
    async def _approval(args: dict) -> dict:
        decision = await ctx.request_approval(args["prompt"])
        instruction = (
            "Approved by the operator. Proceed."
            if decision == "approved"
            else "Denied by the operator. Do not proceed; stop and explain why."
        )
        return _text({"decision": decision, "instruction": instruction})

    @tool(
        "gh_open_pr",
        "Open a pull request from the contained workspace clone. Edit files directly with Edit "
        "first, then call this (patch optional). Requires a prior approval — call request_approval "
        "and get 'approved' before opening the PR. Against a local remote it reports the pushed "
        "branch + diff instead of a GitHub URL.",
        {
            "type": "object",
            "properties": {
                "branch": {"type": "string", "description": "focused branch name, e.g. fix/rate-limit-default"},
                "title": {"type": "string"},
                "body": {"type": "string"},
                "patch": {"type": "string", "description": "optional unified diff; omit if you edited files directly"},
            },
            "required": ["branch", "title"],
        },
    )
    async def _gh(args: dict) -> dict:
        repo = ctx.workspace or config.subject_repo_dir
        return _text(
            await backends.gh_open_pr(
                repo, args["branch"], args["title"], args.get("body", ""), args.get("patch", "")
            )
        )

    @tool(
        "save_artifact",
        "Persist an artifact tied to this run (e.g. a Markdown postmortem or JSON report). "
        "kind is 'markdown' or 'json'. Returns the artifact id.",
        {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["markdown", "json"]},
                "content": {"type": "string"},
                "name": {"type": "string", "description": "file name, e.g. postmortem.md"},
            },
            "required": ["kind", "content"],
        },
    )
    async def _artifact(args: dict) -> dict:
        kind = args["kind"]
        media = "text/markdown" if kind == "markdown" else "application/json"
        default_name = "artifact.md" if kind == "markdown" else "artifact.json"
        # `name` comes from the model — sanitise to a single safe basename so a
        # crafted/injected name can't write a file copy outside ARTIFACTS_DIR.
        safe_name = safe_artifact_name(args.get("name"), default_name)
        if safe_name is None:
            return _text({"error": "invalid artifact name", "name": args.get("name")})
        artifact = await ctx.add_artifact(safe_name, media, args["content"])
        # Also drop a file copy under ARTIFACTS_DIR for out-of-band inspection.
        try:
            out_dir = os.path.realpath(os.path.join(config.artifacts_dir, ctx.run_id))
            os.makedirs(out_dir, exist_ok=True)
            target = os.path.realpath(os.path.join(out_dir, safe_name))
            if target == out_dir or not target.startswith(out_dir + os.sep):
                raise ValueError("path escapes artifacts dir")
            with open(target, "w", encoding="utf-8") as fh:
                fh.write(args["content"])
        except Exception:  # noqa: BLE001 — the DB copy is authoritative
            pass
        return _text({"artifact_id": artifact.id, "name": safe_name})

    return create_sdk_mcp_server(name=SERVER, tools=[*_STATELESS, _gh, _approval, _artifact])


# ---- per-agent allow-lists + system prompts ---------------------------------

READ_TOOLS = [
    mcp("loki_query"), mcp("tempo_query"), mcp("mimir_query"),
    mcp("marquez_lineage"), mcp("pg_select"),
]

TOOLSETS: dict[str, list[str]] = {
    "rca": [*READ_TOOLS, mcp("save_artifact")],
    "incident-reporter": [*READ_TOOLS, mcp("save_artifact")],
    "dashboard-generator": [mcp("mimir_query"), mcp("grafana_create_dashboard")],
    "runbook-executor": [
        "Bash", mcp("pg_select"), mcp("runbook_read"),
        mcp("request_approval"), mcp("save_artifact"),
    ],
    "auto-fixer": [
        "Read", "Edit", "Glob", "Bash",
        mcp("gh_open_pr"), mcp("request_approval"), mcp("save_artifact"),
    ],
}

SYSTEM_PROMPTS: dict[str, str] = {
    "rca": (
        "You are the RCA (root-cause analysis) assistant for an AI observability lab. "
        "Answer 'why is X happening' questions by running REAL queries against the telemetry "
        "plane — Loki (logs), Tempo (traces), Mimir (PromQL metrics), Marquez (data lineage), "
        "and the lab Postgres (read-only). Always ground claims in tool results; never guess. "
        "Prefer few, well-chosen queries over many chatty ones. Be concise and specific: name "
        "the service, span, tenant, or metric. When you reach a conclusion worth keeping, save a "
        "short Markdown summary with save_artifact."
    ),
    "incident-reporter": (
        "You are the incident reporter. You receive a Grafana alert payload and write a "
        "structured postmortem. Investigate with the read-only tools (Loki/Tempo/Mimir/Marquez/"
        "Postgres): establish what fired, the blast radius (which tenant/endpoint), the likely "
        "cause (name the slow span or error signature), and concrete next steps. Then call "
        "save_artifact with kind='markdown' to store the postmortem. Sections: Summary, Impact, "
        "Timeline, Evidence (with the queries you ran), Likely cause, Recommended actions. "
        "Be specific and evidence-backed; this goes straight to the incident inbox."
    ),
    "dashboard-generator": (
        "You are the dashboard generator. Turn a natural-language brief into a Grafana dashboard. "
        "First use mimir_query to confirm the intended metrics actually exist (instant queries), "
        "then build a clean dashboard JSON model (title, a few timeseries/stat panels with PromQL "
        "targets against the 'mimir' datasource uid) and call grafana_create_dashboard with it. "
        "One pass: validate, build, create. Report the resulting dashboard URL."
    ),
    "runbook-executor": (
        "You are the runbook executor. Read the named runbook with runbook_read, then execute its "
        "headed steps ONE AT A TIME. Before any step that mutates state, call request_approval with "
        "a one-sentence description and WAIT for the decision; if denied, stop immediately. Use Bash "
        "for commands and pg_select for read-only checks. After finishing (or stopping), call "
        "save_artifact with a Markdown execution log of what ran and each approval decision."
    ),
    "auto-fixer": (
        "You are the auto-fixer. Given an error pattern, locate the bug in the contained repo clone "
        "(your cwd) using Glob/Read, make the smallest correct fix by editing files directly with "
        "Edit, and verify with Bash where possible. You MUST call request_approval with a clear "
        "one-sentence summary of the change and receive 'approved' BEFORE opening a pull request; "
        "if denied, stop and explain — do not open the PR. Once approved, call gh_open_pr with a "
        "focused branch name, a title, and a body explaining the fix (you edited files directly, so "
        "the patch argument is optional). Keep the change minimal and well-described."
    ),
}
