"""Backend implementations for the tool layer.

Each function queries one telemetry-plane backend (Loki/Tempo/Mimir/Marquez/
Postgres/Grafana/gh) and returns a plain JSON-serialisable dict. Contract:
NEVER raise — catch everything and return {"error": ...} so a flaky backend
degrades the agent's turn instead of crashing the run. "A great tool returns
less, but structured": these return compact, decision-ready shapes.
"""

from __future__ import annotations

import json
import os
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
    # A bare hex string is a trace id: fetch the full trace instead of search.
    # OTel ids are 32 hex chars, but models often hand back ids with leading
    # zeros stripped, so accept 16-32 chars and left-pad (Tempo 400s on a bare
    # hex string given to /api/search).
    if 16 <= len(q) <= 32 and all(c in "0123456789abcdefABCDEF" for c in q):
        trace_id = q.lower().rjust(32, "0")
        try:
            resp = await _http().get(f"{config.tempo_url}/api/traces/{trace_id}")
            resp.raise_for_status()
            return {"trace_id": trace_id, "trace": resp.json()}
        except Exception as exc:  # noqa: BLE001
            return {"error": f"tempo trace fetch failed: {exc}", "trace_id": trace_id}
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
        if resp.status_code == 404:
            # Unknown dataset — hand back what actually exists so the model
            # can retry with a real name instead of guessing again.
            return {
                "error": f"dataset '{name}' not found in namespace '{namespace}'",
                "available_datasets": await _marquez_dataset_names(namespace),
            }
        resp.raise_for_status()
        return {"dataset": name, "namespace": namespace, "lineage": resp.json()}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"marquez lineage failed: {exc}", "dataset": name}


async def _marquez_dataset_names(namespace: str, limit: int = 50) -> list[str]:
    try:
        resp = await _http().get(
            f"{config.marquez_url}/api/v1/namespaces/{namespace}/datasets",
            params={"limit": str(limit)},
        )
        resp.raise_for_status()
        return [d.get("name", "") for d in resp.json().get("datasets", [])]
    except Exception:  # noqa: BLE001 — best-effort hint only
        return []


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


# ---- Grafana (read + create dashboards) --------------------------------------


async def grafana_get_dashboard(query: str) -> dict:
    """List dashboards ("list"/empty), or fetch one full dashboard JSON model
    by uid — falling back to a title search when the uid misses. Fetching is
    the first step of extending an existing dashboard: append panels to the
    returned model and re-save it via grafana_create_dashboard (same uid
    overwrites in place; the lab's provisioning sets allowUiUpdates)."""
    q = (query or "").strip()
    try:
        if q.lower() in ("", "list"):
            resp = await _http().get(
                f"{config.grafana_url}/api/search", params={"type": "dash-db"}
            )
            if resp.status_code >= 400:
                return {"error": f"grafana search failed: HTTP {resp.status_code}"}
            return {
                "dashboards": [
                    {"uid": d.get("uid"), "title": d.get("title")} for d in resp.json()
                ]
            }

        async def fetch(uid: str) -> dict | None:
            resp = await _http().get(f"{config.grafana_url}/api/dashboards/uid/{uid}")
            if resp.status_code != 200:
                return None
            model = resp.json().get("dashboard") or {}
            return {
                "uid": model.get("uid"),
                "title": model.get("title"),
                "version": model.get("version"),
                "dashboard": model,
            }

        direct = await fetch(q)
        if direct is not None:
            return direct
        resp = await _http().get(
            f"{config.grafana_url}/api/search", params={"query": q, "type": "dash-db"}
        )
        if resp.status_code >= 400:
            return {"error": f"grafana search failed: HTTP {resp.status_code}"}
        hits = resp.json()
        if len(hits) == 1:
            found = await fetch(hits[0].get("uid", ""))
            if found is not None:
                return found
        return {
            "matches": [{"uid": d.get("uid"), "title": d.get("title")} for d in hits],
            "hint": "no exact dashboard match; fetch again with one of these uids",
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": f"grafana read failed: {exc}"}


def sync_provisioned_dashboard(model: dict, prov_dir: str) -> str | None:
    """If `model`'s uid belongs to a file-provisioned dashboard, write the new
    model back into its provisioning JSON and return the file name.

    Grafana's file provider re-applies the file on every scan (observed: an
    API save to gateway-red was reverted within ~30s despite allowUiUpdates),
    so for provisioned dashboards the FILE is the only durable place — writing
    it makes the provider propagate the change instead of fighting it, and the
    edit shows up as a git diff the operator can commit or revert.
    """
    uid = model.get("uid")
    if not uid or not os.path.isdir(prov_dir):
        return None
    try:
        for name in sorted(os.listdir(prov_dir)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(prov_dir, name)
            try:
                with open(path, encoding="utf-8") as fh:
                    existing = json.load(fh)
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(existing, dict) or existing.get("uid") != uid:
                continue
            # The provider loads the raw model; id/version are DB-side noise.
            clean = {k: v for k, v in model.items() if k not in ("id", "version")}
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(clean, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            return name
    except OSError:
        return None
    return None


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
        result = {
            "status": "created",
            "uid": body.get("uid"),
            "url": f"{config.grafana_url}{url}" if url else None,
            "version": body.get("version"),
        }
        # Durable path for provisioned dashboards: mirror the change into the
        # provisioning file, else the file provider reverts it within ~30s.
        model_saved = envelope.get("dashboard")
        if isinstance(model_saved, dict):
            synced = sync_provisioned_dashboard(model_saved, config.grafana_dashboards_dir)
            if synced is not None:
                result["provisionedFile"] = synced
        return result
    except Exception as exc:  # noqa: BLE001
        return {"error": f"grafana create failed: {exc}"}


# ---- Runbook read -----------------------------------------------------------


async def runbook_read(path: str) -> dict:
    # Listing mode — let the model discover what exists instead of guessing
    # names (observed: 6 wasted runbook_read calls in one RCA run).
    if path.strip().lower() in ("", "list", ".", "/"):
        try:
            names = sorted(
                f for f in os.listdir(config.runbooks_dir) if f.lower().endswith(".md")
            )
            return {"runbooks": names}
        except OSError as exc:
            return {"error": f"cannot list runbooks: {exc}"}
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


async def gh_open_pr(repo: str | None, branch: str, title: str, body: str, patch: str = "") -> dict:
    """Open a PR from `repo` (a contained clone) via the gh CLI. The auto-fixer
    edits files directly and guards this behind approval; `patch` is optional —
    if empty, the current working-tree changes are committed. Against a local
    remote (the dry-run path), gh can't open a real PR, so we report the pushed
    branch + diffstat instead of failing."""
    if not repo:
        return {"error": "no workspace configured; nothing to open a PR in"}
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
        if patch.strip():
            apply = _run(["git", "apply", "--whitespace=nowarn", "-"], stdin=patch)
            if apply.returncode != 0:
                return {"error": f"git apply failed: {apply.stderr.strip()}"}
        _run(["git", "add", "-A"])
        commit = _run(["git", "commit", "-m", title])
        if commit.returncode != 0:
            blob = (commit.stdout + commit.stderr).lower()
            if "nothing to commit" in blob:
                return {"error": "no changes to commit — edit files before opening a PR"}
            return {"error": f"git commit failed: {commit.stderr.strip()}"}
        push = _run(["git", "push", "-u", "origin", branch, "--force"])
        if push.returncode != 0:
            return {"error": f"git push failed: {push.stderr.strip()}"}
        pr = _run(["gh", "pr", "create", "--base", base, "--head", branch,
                   "--title", title, "--body", body])
        if pr.returncode == 0:
            return {"status": "opened", "branch": branch, "pr_url": pr.stdout.strip()}
        # Local/bare remote: no GitHub host for gh. Report the pushed branch + diff.
        diffstat = _run(["git", "--no-pager", "diff", "--stat", f"{base}...{branch}"]).stdout.strip()
        if not diffstat:
            diffstat = _run(["git", "--no-pager", "show", "--stat", "--oneline", "HEAD"]).stdout.strip()
        return {
            "status": "branch_pushed",
            "branch": branch,
            "base": base,
            "note": "pushed to a local remote (dry run); a real PR needs a GitHub host.",
            "diffstat": diffstat,
            "gh_error": pr.stderr.strip()[:200],
        }
    except subprocess.TimeoutExpired:
        return {"error": "git/gh command timed out"}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"gh_open_pr failed: {exc}"}
