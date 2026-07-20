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

# External stdio MCP child: containers/kubernetes-mcp-server, the agents'
# read-only window into the cluster API (PLAN-2 P8). Read-only by
# CONSTRUCTION, not by prompt: --read-only strips every mutating tool from
# the server's tool list, k8s-mcp.toml denies Secret reads server-side, and
# the agent-ro ClusterRole (view) denies them at the API as a third layer.
K8S_SERVER = "k8s"


def mcp(name: str) -> str:
    return f"mcp__{SERVER}__{name}"


def k8s(name: str) -> str:
    return f"mcp__{K8S_SERVER}__{name}"


def k8s_mcp_server() -> dict[str, Any] | None:
    """Stdio config for kubernetes-mcp-server, or None while the agent-ro
    kubeconfig hasn't been minted (obs k8s agent-kubeconfig)."""
    kubeconfig = config.k8s_kubeconfig
    if not os.path.exists(kubeconfig):
        return None
    argv = [
        *config.k8s_mcp_cmd.split(),
        "--read-only",
        "--disable-multi-cluster",
        "--toolsets", "core,config",
        "--kubeconfig", kubeconfig,
        "--config", config.k8s_mcp_config_path,
    ]
    if os.name == "nt":
        # npx is npx.cmd on Windows; Node's spawn only finds it through the
        # shell shim.
        argv = ["cmd", "/c", *argv]
    return {"type": "stdio", "command": argv[0], "args": argv[1:]}


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
    "Run a read-only SELECT against the lab database. Use $1, $2 placeholders with params. "
    "Writes, information_schema, and non-allow-listed tables are refused. Allowed tables "
    "(with key columns) — "
    "inferences(run_id, tenant, model, prompt_chars, prompt_tokens, completion_tokens, "
    "retrieved_count, retrieval_score_mean, retrieval_score_max, cache_hit, status, created_at); "
    "usage_events(tenant, prompt_tokens, completion_tokens, model, created_at); "
    "dq_violations(check_name, signal, severity, dataset, ts, payload); "
    "chunks(doc_id, body, created_at); agent_runs and the other agent_* audit tables. "
    "There is no tenants table — tenant is a text column (e.g. 'acme') on these tables.",
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
    "grafana_get_dashboard",
    'List existing Grafana dashboards (pass "list") or fetch one dashboard\'s full JSON '
    "model by uid or title. Use this BEFORE extending an existing dashboard: append new "
    "panels to the returned model, keep its uid/title and existing panels, then save it "
    "with grafana_create_dashboard (same uid overwrites in place).",
    {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": 'dashboard uid or title, or "list"'},
        },
        "required": ["query"],
    },
)
async def _grafana_get(args: dict) -> dict:
    return _text(await backends.grafana_get_dashboard(args["query"]))


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
    '(e.g. "gateway-high-error-rate.md"). Pass "list" (or an empty path) to '
    "enumerate the available runbooks instead of guessing names.",
    {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]},
)
async def _runbook(args: dict) -> dict:
    return _text(await backends.runbook_read(args["path"]))


@tool(
    "k8s_events",
    "Curated timeline of Kubernetes events (from the cluster's event stream in Loki): "
    "scheduling failures, image pulls, OOM kills, probe failures, restarts. Returns compact "
    "oldest-first entries (time, level, object, reason, message). Prefer this over raw "
    "loki_query or kubectl for 'what happened to X' questions; narrow with namespace, "
    "object_name (substring of the pod/deployment name), or level=warning.",
    {
        "type": "object",
        "properties": {
            "namespace": {"type": "string", "description": "filter to one namespace (e.g. subject)"},
            "object_name": {"type": "string", "description": "filter to events mentioning this object name"},
            "level": {"type": "string", "description": "info | warning | error"},
            "range": {"type": "string", "description": "lookback like 15m, 1h (default 1h)"},
            "limit": {"type": "integer", "description": "max events (default 60, cap 200)"},
        },
    },
)
async def _k8s_events(args: dict) -> dict:
    return _text(
        await backends.k8s_events(
            args.get("namespace", ""), args.get("object_name", ""), args.get("level", ""),
            args.get("range", "1h"), int(args.get("limit", 60)),
        )
    )


@tool(
    "kubectl_read",
    "Read-only kubectl against the lab cluster (agent-ro identity): verb is get, describe, "
    "or top. Examples: get deployments -n subject; describe pod gateway-abc -n subject; top "
    "pods. namespace defaults to 'subject' when a name is given, all namespaces otherwise. "
    "Secrets are refused. Output is plain kubectl text.",
    {
        "type": "object",
        "properties": {
            "verb": {"type": "string", "description": "get | describe | top"},
            "resource": {"type": "string", "description": "resource kind, e.g. pods, deployments, nodes, events"},
            "name": {"type": "string", "description": "one object's name (optional)"},
            "namespace": {"type": "string", "description": "namespace (optional)"},
            "selector": {"type": "string", "description": "label selector like app=gateway (optional)"},
        },
        "required": ["verb"],
    },
)
async def _kubectl(args: dict) -> dict:
    return _text(
        await backends.kubectl_read(
            args["verb"], args.get("resource", ""), args.get("name", ""),
            args.get("namespace", ""), args.get("selector", ""),
        )
    )


@tool(
    "gitea_ci_runs",
    "Recent CI pipeline runs from the local Gitea forge (obs/obs-lab), newest-first, with "
    "per-job status and timing. Use for 'what shipped / what ran in CI recently' questions; "
    "narrow with branch (e.g. main). Each run carries the sha to feed into gitea_compare.",
    {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "max runs (default 5, cap 20)"},
            "branch": {"type": "string", "description": "filter to one branch (e.g. main)"},
        },
    },
)
async def _gitea_runs(args: dict) -> dict:
    return _text(
        await backends.gitea_ci_runs(int(args.get("limit", 5)), args.get("branch", ""))
    )


@tool(
    "gitea_compare",
    "base...head diff from the forge: the commits between two refs (branch, tag, or sha) "
    "with messages, authors, and per-file additions/deletions. THE tool for naming the "
    "exact commit/file behind a regression — e.g. compare the previously deployed sha "
    "against the currently deployed one from the deploy annotations. Pass "
    "include_diff=true (small spans only) to get each commit's unified diff and cite the "
    "exact lines.",
    {
        "type": "object",
        "properties": {
            "base": {"type": "string", "description": "older ref (branch, tag, or sha)"},
            "head": {"type": "string", "description": "newer ref (branch, tag, or sha)"},
            "include_diff": {"type": "boolean",
                             "description": "attach each commit's unified diff (≤5 commits)"},
        },
        "required": ["base", "head"],
    },
)
async def _gitea_compare(args: dict) -> dict:
    return _text(
        await backends.gitea_compare(
            args["base"], args["head"], bool(args.get("include_diff", False))
        )
    )


@tool(
    "grafana_annotations",
    "Deploy markers (and other Grafana annotations) in a lookback window, oldest-first. "
    "Default tag filter 'deployment'; each deploy annotation carries the service and the "
    "deployed sha. Ask 'what changed right before this alert?' with this FIRST, then walk "
    "the sha into gitea_ci_runs/gitea_compare.",
    {
        "type": "object",
        "properties": {
            "range": {"type": "string", "description": "lookback like 2h, 24h (default 2h)"},
            "tags": {"type": "array", "items": {"type": "string"},
                     "description": "annotation tags to match (default ['deployment'])"},
        },
    },
)
async def _grafana_annotations(args: dict) -> dict:
    return _text(
        await backends.grafana_annotations(args.get("range", "2h"), args.get("tags"))
    )


@tool(
    "gitea_open_pr",
    "Open a pull request on the local Gitea forge (obs/obs-lab) from an ALREADY-PUSHED "
    "branch via the REST API. Use when a branch exists on the forge but has no PR (e.g. a "
    "prior run pushed and stopped). Requires a prior request_approval decision of "
    "'approved', same as gh_open_pr.",
    {
        "type": "object",
        "properties": {
            "head": {"type": "string", "description": "the pushed branch to merge"},
            "base": {"type": "string", "description": "target branch (default main)"},
            "title": {"type": "string"},
            "body": {"type": "string"},
        },
        "required": ["head", "title"],
    },
)
async def _gitea_pr(args: dict) -> dict:
    return _text(
        await backends.gitea_open_pr(
            args["head"], args.get("base", "main"), args["title"], args.get("body", "")
        )
    )


_STATELESS = [
    _loki, _tempo, _mimir, _marquez, _pg, _grafana_get, _grafana, _runbook,
    _k8s_events, _kubectl, _gitea_runs, _gitea_compare, _grafana_annotations,
    _gitea_pr,
]


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
        "and get 'approved' before opening the PR. The PR host is picked from the workspace's "
        "origin: Gitea origins get a Gitea API PR, GitHub origins go through gh; a local bare "
        "remote reports the pushed branch + diff instead.",
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
        "Persist an artifact tied to this run (e.g. a Markdown postmortem, JSON report, or a "
        "self-contained HTML page with inline SVG charts). kind is 'markdown', 'json', or "
        "'html'. HTML artifacts render in a sandboxed viewer with no network access for fetches "
        "or subresources — inline CSS/SVG/JS only, no external URLs. Returns the artifact id.",
        {
            "type": "object",
            "properties": {
                "kind": {"type": "string", "enum": ["markdown", "json", "html"]},
                "content": {"type": "string"},
                "name": {"type": "string", "description": "file name, e.g. postmortem.md or report.html"},
            },
            "required": ["kind", "content"],
        },
    )
    async def _artifact(args: dict) -> dict:
        media, default_name = ARTIFACT_KINDS.get(args["kind"], ARTIFACT_KINDS["markdown"])
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


# save_artifact kind → (media type, default file name). Unit-tested; keep in
# sync with the tool schema enum below.
ARTIFACT_KINDS: dict[str, tuple[str, str]] = {
    "markdown": ("text/markdown", "artifact.md"),
    "json": ("application/json", "artifact.json"),
    "html": ("text/html", "artifact.html"),
}

# ---- per-agent allow-lists + system prompts ---------------------------------

READ_TOOLS = [
    mcp("loki_query"), mcp("tempo_query"), mcp("mimir_query"),
    mcp("marquez_lineage"), mcp("pg_select"), mcp("runbook_read"),
]

# The read-only cluster window the investigating agents get: the external
# kubernetes-mcp-server tools (names verified against v0.0.65 with
# --read-only --toolsets core,config) plus the two shaped tools above.
# configuration_view is deliberately absent: it echoes the kubeconfig -
# bearer token included - straight into the transcript.
K8S_READ_TOOLS = [
    k8s("pods_list"), k8s("pods_list_in_namespace"), k8s("pods_get"),
    k8s("pods_log"), k8s("pods_top"), k8s("resources_list"),
    k8s("resources_get"), k8s("events_list"), k8s("namespaces_list"),
    k8s("nodes_log"), k8s("nodes_top"), k8s("nodes_stats_summary"),
]
CLUSTER_READ_TOOLS = [*K8S_READ_TOOLS, mcp("k8s_events"), mcp("kubectl_read")]

# Delivery history (PLAN-2 P9): deploy annotations + CI runs + diffs — the
# "what changed right before this?" axis of an investigation.
DELIVERY_READ_TOOLS = [
    mcp("grafana_annotations"), mcp("gitea_ci_runs"), mcp("gitea_compare"),
]

TOOLSETS: dict[str, list[str]] = {
    "rca": [*READ_TOOLS, *CLUSTER_READ_TOOLS, *DELIVERY_READ_TOOLS, mcp("save_artifact")],
    "incident-reporter": [
        *READ_TOOLS, *CLUSTER_READ_TOOLS, *DELIVERY_READ_TOOLS, mcp("save_artifact"),
    ],
    "dashboard-generator": [
        mcp("mimir_query"), mcp("grafana_get_dashboard"), mcp("grafana_create_dashboard"),
    ],
    "runbook-executor": [
        "Bash", mcp("pg_select"), mcp("runbook_read"),
        mcp("request_approval"), mcp("save_artifact"),
    ],
    "auto-fixer": [
        "Read", "Edit", "Glob", "Bash",
        mcp("gh_open_pr"), mcp("gitea_open_pr"), mcp("request_approval"),
        mcp("save_artifact"),
    ],
}

# Every tool the settings UI can grant to an agent, with an operator-facing
# one-liner. MCP entries mirror the @tool definitions above; built-ins are
# Claude Code tools the SDK provides. settings.py validates grants against
# this list, so a tool missing here cannot be granted from the UI.
TOOL_CATALOG: list[dict[str, str]] = [
    {"name": mcp("loki_query"), "kind": "mcp",
     "description": "Search Loki logs with LogQL"},
    {"name": mcp("tempo_query"), "kind": "mcp",
     "description": "Search Tempo traces (TraceQL) or fetch a trace by id"},
    {"name": mcp("mimir_query"), "kind": "mcp",
     "description": "Run PromQL queries against Mimir"},
    {"name": mcp("marquez_lineage"), "kind": "mcp",
     "description": "Read the OpenLineage graph from Marquez"},
    {"name": mcp("pg_select"), "kind": "mcp",
     "description": "Read-only SELECT against the lab Postgres"},
    {"name": mcp("runbook_read"), "kind": "mcp",
     "description": "Read a Markdown runbook from runbooks/"},
    {"name": mcp("grafana_get_dashboard"), "kind": "mcp",
     "description": "List Grafana dashboards or fetch one's JSON model"},
    {"name": mcp("grafana_create_dashboard"), "kind": "mcp",
     "description": "Create or overwrite a Grafana dashboard"},
    {"name": mcp("save_artifact"), "kind": "mcp",
     "description": "Persist a Markdown/JSON/HTML artifact on the run"},
    {"name": mcp("request_approval"), "kind": "mcp",
     "description": "Pause the run for an operator approve/deny decision"},
    {"name": mcp("gh_open_pr"), "kind": "mcp",
     "description": "Open a pull request from the contained workspace clone"},
    {"name": k8s("pods_list"), "kind": "mcp",
     "description": "List pods across all cluster namespaces"},
    {"name": k8s("pods_list_in_namespace"), "kind": "mcp",
     "description": "List pods in one cluster namespace"},
    {"name": k8s("pods_get"), "kind": "mcp",
     "description": "Get one pod's full spec and status"},
    {"name": k8s("pods_log"), "kind": "mcp",
     "description": "Read a pod's container logs from the cluster"},
    {"name": k8s("pods_top"), "kind": "mcp",
     "description": "Live CPU/memory usage per pod (kubectl top)"},
    {"name": k8s("resources_list"), "kind": "mcp",
     "description": "List any cluster resource kind (deployments, services, ...)"},
    {"name": k8s("resources_get"), "kind": "mcp",
     "description": "Get any one cluster resource (Secrets are denied)"},
    {"name": k8s("events_list"), "kind": "mcp",
     "description": "List live Kubernetes events (all or one namespace)"},
    {"name": k8s("namespaces_list"), "kind": "mcp",
     "description": "List cluster namespaces"},
    {"name": k8s("nodes_log"), "kind": "mcp",
     "description": "Read node-level logs (kubelet journal)"},
    {"name": k8s("nodes_top"), "kind": "mcp",
     "description": "Live CPU/memory usage per node"},
    {"name": k8s("nodes_stats_summary"), "kind": "mcp",
     "description": "Kubelet stats summary for a node (per-pod resource detail)"},
    {"name": mcp("k8s_events"), "kind": "mcp",
     "description": "Curated Kubernetes event timeline from the Loki event stream"},
    {"name": mcp("kubectl_read"), "kind": "mcp",
     "description": "Read-only kubectl get/describe/top (fixed argv, secrets refused)"},
    {"name": mcp("gitea_ci_runs"), "kind": "mcp",
     "description": "Recent CI runs (with per-job status) from the Gitea forge"},
    {"name": mcp("gitea_compare"), "kind": "mcp",
     "description": "base...head commit + file diff from the Gitea forge"},
    {"name": mcp("grafana_annotations"), "kind": "mcp",
     "description": "Deploy markers / annotations in a Grafana time window"},
    {"name": mcp("gitea_open_pr"), "kind": "mcp",
     "description": "Open a Gitea PR from an already-pushed branch (REST API)"},
    {"name": "Bash", "kind": "builtin",
     "description": "Run shell commands on the agent-service host"},
    {"name": "Read", "kind": "builtin",
     "description": "Read files under the agent's working directory"},
    {"name": "Glob", "kind": "builtin",
     "description": "Find files by glob pattern"},
    {"name": "Edit", "kind": "builtin",
     "description": "Edit files under the agent's working directory"},
]

SYSTEM_PROMPTS: dict[str, str] = {
    "rca": (
        "You are the RCA (root-cause analysis) assistant for an AI observability lab. "
        "Answer 'why is X happening' questions by running REAL queries against the telemetry "
        "plane — Loki (logs), Tempo (traces), Mimir (PromQL metrics), Marquez (data lineage), "
        "and the lab Postgres (read-only). Always ground claims in tool results; never guess. "
        "Prefer few, well-chosen queries over many chatty ones. Narrate as you go: before each "
        "round of tool calls, write one short sentence saying what you're checking and why — the "
        "operator watches live, and a silent run looks stuck. Be concise and specific: name "
        "the service, span, tenant, or metric. For CLUSTER questions (pods, deployments, nodes, "
        "restarts, scheduling), use the read-only cluster window: k8s_events for 'what happened "
        "to X' timelines, kubectl_read for get/describe/top, and the k8s:* tools for specs, "
        "logs, and live usage — never Bash, and Secrets are denied by construction. "
        "For DELIVERY questions ('what shipped?', 'did a deploy cause this?'), walk the chain: "
        "grafana_annotations for deploy markers near the incident onset, gitea_ci_runs for the "
        "runs behind them, gitea_compare (previous deployed sha ... current sha) to name the "
        "exact commit and file. A regression that starts minutes after a deploy annotation is "
        "guilty until proven otherwise. "
        "When you reach a conclusion worth keeping, save a "
        "short Markdown summary with save_artifact. When a visual would explain the finding "
        "better than prose — a latency curve, a before/after comparison, a dependency sketch — "
        "also save ONE HTML artifact (kind='html'): a single self-contained file, inline CSS and "
        "inline SVG only, no external URLs (the viewer blocks all network), dark background with "
        "light text, charts drawn from the REAL numbers your queries returned. Keep it focused — "
        "one clear figure beats a dashboard. For quick sketches inside Markdown, a ```mermaid "
        "fenced code block renders as a diagram."
    ),
    "incident-reporter": (
        "You are the incident reporter. You receive a Grafana alert payload and write a "
        "structured postmortem. Investigate with the read-only tools (Loki/Tempo/Mimir/Marquez/"
        "Postgres): establish what fired, the blast radius (which tenant/endpoint), the likely "
        "cause (name the slow span or error signature), and concrete next steps. For alerts "
        "about the CLUSTER (CrashLoopBackOff, OOMKilled, image pulls, replicas, nodes), lead "
        "with k8s_events and kubectl_read describe on the affected object, then correlate with "
        "container_* metrics in Mimir — the working-set-vs-limit shape distinguishes an OOM "
        "from a crash bug. ALWAYS check grafana_annotations for a deploy marker shortly before "
        "the alert fired; if one exists, gitea_compare the previous deployed sha against it and "
        "name the commit in 'Likely cause'. Narrate as you "
        "go: one short sentence before each round of queries saying what you're checking. Then call "
        "save_artifact with kind='markdown' to store the postmortem. Sections: Summary, Impact, "
        "Timeline, Evidence (with the queries you ran), Likely cause, Recommended actions. "
        "Be specific and evidence-backed; this goes straight to the incident inbox. The "
        "postmortem may include ```mermaid fenced diagrams (e.g. an incident timeline or the "
        "failing dependency edge). If a chart materially helps (error-rate spike, latency "
        "before/after), additionally save ONE kind='html' artifact — self-contained, inline "
        "CSS/SVG only, no external resources, dark-themed, drawn from real query results."
    ),
    "dashboard-generator": (
        "You are the dashboard generator. Turn a natural-language brief into a Grafana dashboard. "
        "First use mimir_query to confirm the intended metrics actually exist (instant queries), "
        "then build a clean dashboard JSON model (title, a few timeseries/stat panels with PromQL "
        "targets against the 'mimir' datasource uid) and call grafana_create_dashboard with it. "
        "One pass: validate, build, create. Report the resulting dashboard URL. "
        "When the brief asks to ADD panels to an EXISTING dashboard, do not build from scratch: "
        "fetch it with grafana_get_dashboard (by title or uid; pass 'list' to see what exists), "
        "append the new panels to its panels array — keep every existing panel, the uid, and the "
        "title — and save the whole model with grafana_create_dashboard; the same uid overwrites "
        "in place."
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
        "the patch argument is optional) — it opens the PR on GitHub or the local Gitea forge "
        "automatically, picked by the workspace's origin host. If it reports branch_pushed without "
        "a PR, follow up with gitea_open_pr for that branch. Keep the change minimal and "
        "well-described."
    ),
}
