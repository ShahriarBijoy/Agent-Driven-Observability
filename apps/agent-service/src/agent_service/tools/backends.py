"""Backend implementations for the tool layer.

Each function queries one telemetry-plane backend (Loki/Tempo/Mimir/Marquez/
Postgres/Grafana/gh) and returns a plain JSON-serialisable dict. Contract:
NEVER raise — catch everything and return {"error": ...} so a flaky backend
degrades the agent's turn instead of crashing the run. "A great tool returns
less, but structured": these return compact, decision-ready shapes.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from datetime import datetime
from typing import Any

import httpx

from .. import db
from ..config import config
from .validation import parse_range, safe_runbook_path, validate_select_sql

_client: httpx.AsyncClient | None = None
LINEAGE_NAMESPACE = "ai-observability-lab"


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(20.0))
    return _client


async def close_http() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _json_safe(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


# ---- Loki -------------------------------------------------------------------


async def loki_query(logql: str, range: str = "1h", limit: int = 100) -> dict:
    if not logql or not logql.strip():
        return {"error": "logql is required"}
    start, end = parse_range(range)
    try:
        resp = await _http().get(
            f"{config.loki_url}/loki/api/v1/query_range",
            params={
                "query": logql,
                "start": str(int(start.timestamp() * 1e9)),
                "end": str(int(end.timestamp() * 1e9)),
                "limit": str(limit),
                "direction": "backward",
            },
        )
        resp.raise_for_status()
        data = resp.json().get("data", {}).get("result", [])
        lines: list[dict] = []
        for stream in data:
            labels = stream.get("stream", {})
            for ts, line in stream.get("values", []):
                lines.append({"ts": ts, "line": line, "labels": labels})
        lines.sort(key=lambda r: r["ts"], reverse=True)
        return {"query": logql, "range": range, "count": len(lines), "lines": lines[:limit]}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"loki query failed: {exc}", "query": logql}


# ---- Tempo ------------------------------------------------------------------


async def tempo_query(traceql: str, range: str = "1h", limit: int = 20) -> dict:
    if not traceql or not traceql.strip():
        return {"error": "traceql is required"}
    q = traceql.strip()
    # A bare 32-hex string is a trace id: fetch the full trace instead of search.
    if len(q) == 32 and all(c in "0123456789abcdefABCDEF" for c in q):
        try:
            resp = await _http().get(f"{config.tempo_url}/api/traces/{q}")
            resp.raise_for_status()
            return {"trace_id": q, "trace": resp.json()}
        except Exception as exc:  # noqa: BLE001
            return {"error": f"tempo trace fetch failed: {exc}", "trace_id": q}
    start, end = parse_range(range)
    try:
        resp = await _http().get(
            f"{config.tempo_url}/api/search",
            params={
                "q": q,
                "start": str(int(start.timestamp())),
                "end": str(int(end.timestamp())),
                "limit": str(limit),
            },
        )
        resp.raise_for_status()
        traces = resp.json().get("traces", [])
        return {"query": q, "range": range, "count": len(traces), "traces": traces}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"tempo search failed: {exc}", "query": q}


# ---- Mimir (Prometheus API) -------------------------------------------------


async def mimir_query(promql: str, range: str = "", step: str = "60s") -> dict:
    if not promql or not promql.strip():
        return {"error": "promql is required"}
    base = f"{config.mimir_url}/prometheus/api/v1"
    try:
        if not range.strip():
            resp = await _http().get(f"{base}/query", params={"query": promql})
        else:
            start, end = parse_range(range)
            resp = await _http().get(
                f"{base}/query_range",
                params={
                    "query": promql,
                    "start": str(int(start.timestamp())),
                    "end": str(int(end.timestamp())),
                    "step": step,
                },
            )
        resp.raise_for_status()
        payload = resp.json()
        if payload.get("status") != "success":
            return {"error": f"promql error: {payload.get('error', 'unknown')}", "query": promql}
        return {"query": promql, "range": range or "instant", "data": payload.get("data", {})}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"mimir query failed: {exc}", "query": promql}


# ---- Marquez (lineage) ------------------------------------------------------


async def marquez_lineage(dataset: str, depth: int = 2) -> dict:
    if not dataset or not dataset.strip():
        return {"error": "dataset is required"}
    name = dataset.strip()
    namespace = LINEAGE_NAMESPACE
    if ":" in name:  # accept "namespace:name"
        namespace, name = name.split(":", 1)
    node_id = f"dataset:{namespace}:{name}"
    try:
        resp = await _http().get(
            f"{config.marquez_url}/api/v1/lineage",
            params={"nodeId": node_id, "depth": str(depth)},
        )
        resp.raise_for_status()
        return {"dataset": name, "namespace": namespace, "lineage": resp.json()}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"marquez lineage failed: {exc}", "dataset": name}


# ---- Postgres (read-only) ---------------------------------------------------


async def pg_select(sql: str, params: list | None = None) -> dict:
    ok, reason = validate_select_sql(sql)
    if not ok:
        return {"error": f"rejected: {reason}", "sql": sql}
    try:
        rows = await db.run_select(sql, params or [])
        safe = [{k: _json_safe(v) if not _is_scalar(v) else v for k, v in r.items()} for r in rows]
        return {"sql": sql, "row_count": len(safe), "rows": safe}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"query failed: {exc}", "sql": sql}


def _is_scalar(v: Any) -> bool:
    return v is None or isinstance(v, (str, int, float, bool))


# ---- Grafana (create dashboard) ---------------------------------------------


async def grafana_create_dashboard(dashboard: Any) -> dict:
    """POST a dashboard JSON to Grafana. The lab's Grafana allows anonymous
    Admin, so no credentials are needed. `dashboard` may be a JSON string or an
    already-parsed object; the outer {dashboard, overwrite} envelope is added."""
    try:
        model = json.loads(dashboard) if isinstance(dashboard, str) else dashboard
    except json.JSONDecodeError as exc:
        return {"error": f"dashboard is not valid JSON: {exc}"}
    if not isinstance(model, dict):
        return {"error": "dashboard must be a JSON object"}
    # Allow callers to pass either the inner model or a full envelope.
    if "dashboard" in model and "panels" not in model:
        envelope = model
    else:
        model.pop("id", None)
        envelope = {"dashboard": model, "overwrite": True}
    try:
        resp = await _http().post(
            f"{config.grafana_url}/api/dashboards/db",
            json=envelope,
            headers={"content-type": "application/json"},
        )
        if resp.status_code >= 400:
            return {"error": f"grafana rejected dashboard: HTTP {resp.status_code} {resp.text[:300]}"}
        body = resp.json()
        url = body.get("url")
        return {
            "status": "created",
            "uid": body.get("uid"),
            "url": f"{config.grafana_url}{url}" if url else None,
            "version": body.get("version"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": f"grafana create failed: {exc}"}


# ---- Runbook read -----------------------------------------------------------


async def runbook_read(path: str) -> dict:
    target, reason = safe_runbook_path(path, config.runbooks_dir)
    if target is None:
        return {"error": f"rejected: {reason}", "path": path}
    try:
        with open(target, encoding="utf-8") as fh:
            return {"path": path, "content": fh.read()}
    except FileNotFoundError:
        return {"error": "runbook not found", "path": path}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"read failed: {exc}", "path": path}


# ---- gh (open PR) -----------------------------------------------------------


async def gh_open_pr(branch: str, title: str, body: str, patch: str) -> dict:
    """Open a PR in the subject repo clone (SUBJECT_REPO_DIR) via the gh CLI.
    The auto-fixer guards this behind an approval gate before calling it."""
    repo = config.subject_repo_dir
    if not repo:
        return {"error": "SUBJECT_REPO_DIR is not configured; no repo to open a PR in"}
    if not branch.strip() or not title.strip():
        return {"error": "branch and title are required"}

    def _run(args: list[str], stdin: str | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            args, cwd=repo, input=stdin, capture_output=True, text=True, timeout=120
        )

    try:
        base = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip() or "main"
        co = _run(["git", "checkout", "-B", branch])
        if co.returncode != 0:
            return {"error": f"git checkout failed: {co.stderr.strip()}"}
        apply = _run(["git", "apply", "--whitespace=nowarn", "-"], stdin=patch)
        if apply.returncode != 0:
            return {"error": f"git apply failed: {apply.stderr.strip()}"}
        _run(["git", "add", "-A"])
        commit = _run(["git", "commit", "-m", title])
        if commit.returncode != 0:
            return {"error": f"git commit failed: {commit.stderr.strip()}"}
        push = _run(["git", "push", "-u", "origin", branch, "--force"])
        if push.returncode != 0:
            return {"error": f"git push failed: {push.stderr.strip()}"}
        pr = _run(["gh", "pr", "create", "--base", base, "--head", branch,
                   "--title", title, "--body", body])
        if pr.returncode != 0:
            return {"error": f"gh pr create failed: {pr.stderr.strip()}"}
        return {"status": "opened", "branch": branch, "pr_url": pr.stdout.strip()}
    except subprocess.TimeoutExpired:
        return {"error": "git/gh command timed out"}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"gh_open_pr failed: {exc}"}
