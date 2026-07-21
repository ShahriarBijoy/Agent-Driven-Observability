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
import os
import re
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


# ---- Kubernetes shaped reads (PLAN-2 P8) ------------------------------------
#
# The cluster is legible through two shapes: k8s_events turns the clusterEvents
# Loki stream into a compact timeline (instead of a kubectl wall the model has
# to re-parse every turn), and kubectl_read wraps get/describe/top as FIXED
# ARGV subprocess calls (the gh_open_pr pattern) so investigating agents never
# need Bash for cluster reads. Both go through the agent-ro kubeconfig.

_EVENTS_JOB = "integrations/kubernetes/eventhandler"
_LOGFMT_RE = re.compile(r'(\w+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))')
_K8S_NAMESPACE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_K8S_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$")
_K8S_RESOURCE_RE = re.compile(r"^[a-z][a-z0-9.-]{0,80}$")
_K8S_SELECTOR_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9=!,._/-]{0,199}$")
_EVENT_LEVELS = {"info": "Info", "normal": "Info", "warning": "Warning", "error": "Error"}


def _logfmt(line: str) -> dict[str, str]:
    return {k: (q if q is not None else b) for k, q, b in
            ((m[0], m[1] or None, m[2]) for m in _LOGFMT_RE.findall(line))}


async def k8s_events(
    namespace: str = "",
    object_name: str = "",
    level: str = "",
    range: str = "1h",
    limit: int = 60,
) -> dict:
    """Curated timeline of Kubernetes events from the clusterEvents stream."""
    selectors = [f'job="{_EVENTS_JOB}"']
    if namespace:
        if not _K8S_NAMESPACE_RE.match(namespace):
            return {"error": f"invalid namespace: {namespace!r}"}
        selectors.append(f'namespace="{namespace}"')
    if level:
        mapped = _EVENT_LEVELS.get(level.strip().lower())
        if mapped is None:
            return {"error": f"invalid level {level!r} (use info|warning|error)"}
        selectors.append(f'level="{mapped}"')
    logql = "{" + ", ".join(selectors) + "}"
    if object_name:
        if not _K8S_NAME_RE.match(object_name):
            return {"error": f"invalid object_name: {object_name!r}"}
        logql += f" |= `{object_name}`"

    limit = max(1, min(int(limit), 200))
    raw = await loki_query(logql, range, limit=limit)
    if "error" in raw:
        return raw
    events = []
    for row in raw.get("lines", []):
        fields = _logfmt(row.get("line", ""))
        labels = row.get("labels", {})
        ts = datetime.fromtimestamp(int(row["ts"]) / 1e9).astimezone().strftime("%H:%M:%S")
        entry = {
            "time": ts,
            "level": labels.get("level", ""),
            "namespace": labels.get("namespace", ""),
            "object": f"{fields.get('kind', labels.get('kind', '?'))}/{fields.get('name', labels.get('name', '?'))}",
            "reason": labels.get("reason", fields.get("reason", "")),
            "message": fields.get("msg", "")[:240],
        }
        count = fields.get("count", "")
        if count and count != "1":
            entry["seen"] = f"x{count}"
        events.append(entry)
    events.reverse()  # loki_query is newest-first; a timeline reads oldest-first
    return {
        "query": logql,
        "range": range,
        "count": len(events),
        "note": "timeline oldest-first, local time HH:MM:SS; narrow with namespace/object_name/level if truncated",
        "events": events,
    }


async def kubectl_read(
    verb: str,
    resource: str = "",
    name: str = "",
    namespace: str = "",
    selector: str = "",
) -> dict:
    """Run one read-only kubectl verb with a fixed, validated argv (no shell)."""
    kubeconfig = config.k8s_kubeconfig
    if not os.path.exists(kubeconfig):
        return {"error": "no cluster credentials: run `obs k8s agent-kubeconfig` first"}
    verb = verb.strip().lower()
    if verb not in ("get", "describe", "top"):
        return {"error": f"verb {verb!r} not allowed (get|describe|top only)"}
    for label, value, pattern in (
        ("resource", resource, _K8S_RESOURCE_RE),
        ("name", name, _K8S_NAME_RE),
        ("namespace", namespace, _K8S_NAMESPACE_RE),
        ("selector", selector, _K8S_SELECTOR_RE),
    ):
        if value and not pattern.match(value):
            return {"error": f"invalid {label}: {value!r}"}
    # Secrets stay dark even though RBAC already denies them — a clear refusal
    # beats a cryptic Forbidden.
    if resource.split(".")[0].rstrip("s") == "secret":
        return {"error": "secrets are off-limits to the investigating agents"}

    argv = ["kubectl", "--kubeconfig", kubeconfig, verb]
    if verb == "get":
        if not resource:
            return {"error": "get needs a resource (e.g. pods, deployments, events)"}
        argv.append(resource)
        if name:
            argv += [name, "-n", namespace or "subject"]
        elif namespace:
            argv += ["-n", namespace]
        else:
            argv.append("-A")
        argv += ["-o", "wide"]
        if selector:
            argv += ["-l", selector]
    elif verb == "describe":
        if not resource or not (name or selector):
            return {"error": "describe needs a resource plus a name or selector"}
        argv.append(resource)
        if name:
            argv.append(name)
        if selector:
            argv += ["-l", selector]
        argv += ["-n", namespace or "subject"]
    else:  # top
        if resource not in ("pods", "nodes", "pod", "node"):
            return {"error": "top works on pods or nodes"}
        argv.append("pods" if resource.startswith("pod") else "nodes")
        if resource.startswith("pod"):
            argv += (["-n", namespace] if namespace else ["-A"])
            if selector:
                argv += ["-l", selector]

    try:
        proc = await asyncio.to_thread(
            subprocess.run, argv, capture_output=True, text=True, timeout=30
        )
    except subprocess.TimeoutExpired:
        return {"error": "kubectl timed out after 30s", "argv": argv[3:]}
    except FileNotFoundError:
        return {"error": "kubectl is not installed on the agent-service host"}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"kubectl failed: {exc}"}
    out = (proc.stdout or "").strip()
    if len(out) > 8000:
        out = out[:8000] + f"\n… (+{len(out) - 8000} chars truncated — narrow the query)"
    result: dict[str, Any] = {"argv": argv[3:], "output": out}
    if proc.returncode != 0:
        result["error"] = (proc.stderr or "").strip()[:500] or f"kubectl exited {proc.returncode}"
    return result


# ---- gitops delivery plane (P10): Argo CD / Rollouts CR reads ---------------
# No Argo API, no argocd login: everything is a read of the CRs through the
# same agent-ro kubeconfig kubectl_read uses (its ClusterRole gained
# argoproj.io get/list in infra/k8s/cluster/agent-ro.yaml). Server-side
# fixed argv, shaped output.


async def _kubectl_json(args: list[str]) -> dict:
    """One kubectl read returning parsed JSON (fixed argv, agent-ro identity)."""
    kubeconfig = config.k8s_kubeconfig
    if not os.path.exists(kubeconfig):
        return {"error": "no cluster credentials: run `obs k8s agent-kubeconfig` first"}
    argv = ["kubectl", "--kubeconfig", kubeconfig, *args, "-o", "json"]
    try:
        proc = await asyncio.to_thread(
            subprocess.run, argv, capture_output=True, text=True, timeout=30
        )
    except subprocess.TimeoutExpired:
        return {"error": "kubectl timed out after 30s"}
    except FileNotFoundError:
        return {"error": "kubectl is not installed on the agent-service host"}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"kubectl failed: {exc}"}
    if proc.returncode != 0:
        return {"error": (proc.stderr or "").strip()[:500] or f"kubectl exited {proc.returncode}"}
    try:
        return {"data": json.loads(proc.stdout)}
    except Exception:  # noqa: BLE001
        return {"error": "kubectl returned unparseable JSON"}


def _shape_application(app: dict) -> dict:
    st = app.get("status") or {}
    op = st.get("operationState") or {}
    sync = st.get("sync") or {}
    return {
        "app": ((app.get("metadata") or {}).get("name")),
        "sync": sync.get("status"),
        "revision": (sync.get("revision") or "")[:12],
        "health": (st.get("health") or {}).get("status"),
        "operation": {
            "phase": op.get("phase"),
            "message": (op.get("message") or "")[:300],
            "startedAt": op.get("startedAt"),
            "finishedAt": op.get("finishedAt"),
            "syncedRevision": ((op.get("syncResult") or {}).get("revision") or "")[:12],
        },
        # Deploy history, newest last: id + revision + deployedAt is exactly
        # what "what shipped, when?" needs.
        "history": [
            {
                "id": h.get("id"),
                "revision": (h.get("revision") or "")[:12],
                "deployedAt": h.get("deployedAt"),
                "deployStartedAt": h.get("deployStartedAt"),
            }
            for h in (st.get("history") or [])[-5:]
        ],
        "conditions": [
            {"type": c.get("type"), "message": (c.get("message") or "")[:200]}
            for c in (st.get("conditions") or [])[:5]
        ],
    }


async def argo_app(name: str = "") -> dict:
    """One Argo CD Application (or the slim list of all of them) from the CR."""
    if name and not _K8S_NAME_RE.match(name):
        return {"error": f"invalid application name: {name!r}"}
    args = ["get", "applications.argoproj.io", "-n", "argocd"]
    if name:
        args.insert(2, name)
    raw = await _kubectl_json(args)
    if "error" in raw:
        return raw
    data = raw["data"]
    if name:
        return _shape_application(data)
    return {
        "apps": [
            {
                "app": (a.get("metadata") or {}).get("name"),
                "sync": ((a.get("status") or {}).get("sync") or {}).get("status"),
                "health": (((a.get("status") or {}).get("health")) or {}).get("status"),
                "revision": (((a.get("status") or {}).get("sync") or {}).get("revision") or "")[:12],
            }
            for a in data.get("items") or []
        ]
    }


def _shape_step(step: dict) -> str:
    if "setWeight" in step:
        return f"setWeight {step['setWeight']}"
    if "pause" in step:
        dur = (step.get("pause") or {}).get("duration")
        return f"pause {dur}" if dur else "pause (manual)"
    if "analysis" in step:
        names = [t.get("templateName") for t in (step["analysis"].get("templates") or [])]
        return f"analysis {','.join(str(n) for n in names)}"
    return next(iter(step.keys()), "step")


async def rollout_status(name: str, namespace: str = "subject") -> dict:
    """Canary state of one Rollout: phase, step position, hashes, replicas."""
    if not _K8S_NAME_RE.match(name):
        return {"error": f"invalid rollout name: {name!r}"}
    if namespace and not _K8S_NAMESPACE_RE.match(namespace):
        return {"error": f"invalid namespace: {namespace!r}"}
    raw = await _kubectl_json(["get", "rollouts.argoproj.io", name, "-n", namespace or "subject"])
    if "error" in raw:
        return raw
    ro = raw["data"]
    st = ro.get("status") or {}
    spec = ro.get("spec") or {}
    steps = ((spec.get("strategy") or {}).get("canary") or {}).get("steps") or []
    return {
        "rollout": name,
        "phase": st.get("phase"),
        "message": (st.get("message") or "")[:300],
        "aborted": bool(st.get("abort")),
        "step": f"{st.get('currentStepIndex', '-')}/{len(steps)}",
        "steps": [_shape_step(s) for s in steps],
        "stableHash": st.get("stableRS"),
        "canaryHash": st.get("currentPodHash"),
        "replicas": {
            "desired": spec.get("replicas"),
            "updated": st.get("updatedReplicas"),
            "ready": st.get("readyReplicas"),
            "available": st.get("availableReplicas"),
        },
        "conditions": [
            {"type": c.get("type"), "reason": c.get("reason"),
             "message": (c.get("message") or "")[:200]}
            for c in (st.get("conditions") or [])[-3:]
        ],
        "note": "canary metrics carry rollouts_pod_template_hash=<canaryHash>; "
                "analysisrun_get quotes the per-measurement values",
    }


def _shape_analysisrun(run: dict) -> dict:
    st = run.get("status") or {}
    return {
        "name": (run.get("metadata") or {}).get("name"),
        "phase": st.get("phase"),
        "message": (st.get("message") or "")[:300],
        "startedAt": st.get("startedAt"),
        "metrics": [
            {
                "name": mr.get("name"),
                "phase": mr.get("phase"),
                "successful": mr.get("successful"),
                "failed": mr.get("failed"),
                "inconclusive": mr.get("inconclusive"),
                # Verbatim: the exact values the promotion decision saw.
                "measurements": [
                    {
                        "phase": m.get("phase"),
                        "value": m.get("value"),
                        "startedAt": m.get("startedAt"),
                        **({"message": (m.get("message") or "")[:200]} if m.get("message") else {}),
                    }
                    for m in (mr.get("measurements") or [])
                ],
            }
            for mr in (st.get("metricResults") or [])
        ],
    }


async def analysisrun_get(name: str = "", rollout: str = "", namespace: str = "subject") -> dict:
    """AnalysisRun verdicts with measurements verbatim. By name, or the newest
    runs for one rollout (or the whole namespace)."""
    for label, value in (("name", name), ("rollout", rollout)):
        if value and not _K8S_NAME_RE.match(value):
            return {"error": f"invalid {label}: {value!r}"}
    if namespace and not _K8S_NAMESPACE_RE.match(namespace):
        return {"error": f"invalid namespace: {namespace!r}"}
    ns = namespace or "subject"
    if name:
        raw = await _kubectl_json(["get", "analysisruns.argoproj.io", name, "-n", ns])
        if "error" in raw:
            return raw
        return _shape_analysisrun(raw["data"])
    raw = await _kubectl_json(["get", "analysisruns.argoproj.io", "-n", ns])
    if "error" in raw:
        return raw
    items = raw["data"].get("items") or []
    if rollout:
        items = [i for i in items
                 if ((i.get("metadata") or {}).get("name") or "").startswith(rollout + "-")]
    items.sort(key=lambda i: (i.get("metadata") or {}).get("creationTimestamp") or "", reverse=True)
    return {"runs": [_shape_analysisrun(i) for i in items[:3]],
            "note": "newest first (3 max); pass name= for one specific run"}


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
        # Pick the PR host by the remote's host (PLAN-2 P9 red-team fix #4):
        # a Gitea origin gets a Gitea API PR — gh would push the branch and
        # then fail to open anything.
        origin_url = _run(["git", "remote", "get-url", "origin"]).stdout.strip()
        if config.gitea_url and origin_url.startswith(config.gitea_url):
            api_pr = await gitea_open_pr(branch, base, title, body)
            if "error" not in api_pr:
                return {"status": "opened", "branch": branch, "pr_url": api_pr.get("pr_url")}
            return {"status": "branch_pushed", "branch": branch, "base": base,
                    "note": f"pushed to gitea but PR creation failed: {api_pr['error']}"}
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


# ---- Gitea (delivery history + PRs, PLAN-2 P9) -------------------------------


def _gitea_headers() -> dict[str, str] | None:
    if not config.gitea_token:
        return None
    return {"Authorization": f"token {config.gitea_token}"}


_GITEA_HELP = "GITEA_TOKEN is not configured — run 'obs ci token' and add it to apps/agent-service/.env"


async def gitea_ci_runs(limit: int = 5, branch: str = "") -> dict:
    """Recent CI runs with per-job status from the local forge. Compact,
    newest-first — the delivery-history half of 'what shipped recently?'."""
    headers = _gitea_headers()
    if headers is None:
        return {"error": _GITEA_HELP}
    limit = max(1, min(limit, 20))
    base = f"{config.gitea_url}/api/v1/repos/{config.gitea_repo}/actions"
    try:
        params: dict[str, str] = {"limit": str(limit)}
        if branch.strip():
            params["branch"] = branch.strip()
        resp = await _http().get(f"{base}/runs", params=params, headers=headers)
        resp.raise_for_status()
        runs = []
        for r in resp.json().get("workflow_runs", [])[:limit]:
            jobs = []
            try:
                jresp = await _http().get(f"{base}/runs/{r['id']}/jobs", headers=headers)
                jresp.raise_for_status()
                jobs = [
                    {"name": j.get("name"), "conclusion": j.get("conclusion") or j.get("status"),
                     "started_at": j.get("started_at"), "completed_at": j.get("completed_at")}
                    for j in jresp.json().get("jobs", [])
                ]
            except Exception:  # noqa: BLE001 — job detail is best-effort
                pass
            runs.append({
                "id": r.get("id"), "run_number": r.get("run_number"),
                "status": r.get("status"), "conclusion": r.get("conclusion"),
                "branch": r.get("head_branch"), "sha": (r.get("head_sha") or "")[:10],
                "title": (r.get("display_title") or "").strip()[:120],
                "started_at": r.get("started_at"), "url": r.get("html_url"),
                "jobs": jobs,
            })
        return {"repo": config.gitea_repo, "count": len(runs), "runs": runs}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"gitea runs query failed: {exc}"}


async def gitea_compare(base: str, head: str, include_diff: bool = False) -> dict:
    """base...head diff summary from the forge: commits + per-file stats.
    include_diff adds each commit's unified diff (truncated) when the span is
    small — the 'name the exact commit, file, and line' half of
    code-to-incident correlation."""
    headers = _gitea_headers()
    if headers is None:
        return {"error": _GITEA_HELP}
    if not base.strip() or not head.strip():
        return {"error": "base and head are required (branch, tag, or sha)"}
    try:
        resp = await _http().get(
            f"{config.gitea_url}/api/v1/repos/{config.gitea_repo}/compare/"
            f"{base.strip()}...{head.strip()}",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        # Gitea's compare has no top-level file list — files + stats hang off
        # each commit; aggregate the union for the summary.
        commits = []
        touched: dict[str, str] = {}
        for c in data.get("commits", []):
            commit_files = [f.get("filename") for f in (c.get("files") or []) if f.get("filename")]
            for f in c.get("files") or []:
                if f.get("filename"):
                    touched[f["filename"]] = f.get("status") or "changed"
            stats = c.get("stats") or {}
            entry = {
                "sha": (c.get("sha") or "")[:10],
                "message": (c.get("commit", {}).get("message") or "").strip()[:200],
                "author": c.get("commit", {}).get("author", {}).get("name"),
                "date": c.get("commit", {}).get("author", {}).get("date"),
                "additions": stats.get("additions"), "deletions": stats.get("deletions"),
                "files": commit_files[:20],
            }
            if include_diff and len(data.get("commits", [])) <= 5:
                try:
                    dresp = await _http().get(
                        f"{config.gitea_url}/api/v1/repos/{config.gitea_repo}/git/commits/"
                        f"{c.get('sha')}.diff",
                        headers=headers,
                    )
                    dresp.raise_for_status()
                    entry["diff"] = dresp.text[:4000]
                except Exception:  # noqa: BLE001 — diff is best-effort
                    pass
            commits.append(entry)
        return {
            "repo": config.gitea_repo, "base": base, "head": head,
            "total_commits": data.get("total_commits", len(commits)),
            "commits": commits,
            "files": [{"filename": k, "status": v} for k, v in sorted(touched.items())][:50],
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": f"gitea compare failed: {exc}"}


async def gitea_open_pr(head: str, base: str = "main", title: str = "", body: str = "") -> dict:
    """Open a PR on the forge from an already-pushed branch (POST /pulls with
    the scoped token). Also the API half gh_open_pr delegates to when the
    workspace origin is Gitea."""
    headers = _gitea_headers()
    if headers is None:
        return {"error": _GITEA_HELP}
    if not head.strip() or not title.strip():
        return {"error": "head branch and title are required"}
    try:
        resp = await _http().post(
            f"{config.gitea_url}/api/v1/repos/{config.gitea_repo}/pulls",
            headers=headers,
            json={"head": head.strip(), "base": base.strip() or "main",
                  "title": title, "body": body},
        )
        if resp.status_code == 409:
            return {"error": f"a PR for {head} already exists (or no diff against {base})"}
        resp.raise_for_status()
        pr = resp.json()
        return {"status": "opened", "pr_url": pr.get("html_url"),
                "number": pr.get("number"), "head": head, "base": base}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"gitea PR creation failed: {exc}"}


# ---- Grafana annotations (deploy markers) ------------------------------------


async def grafana_annotations(range: str = "2h", tags: list[str] | None = None) -> dict:
    """Deploy (and other) annotations in a window, oldest-first. The
    correlation primitive: 'what changed right before this alert?'"""
    start, end = parse_range(range)
    try:
        params: list[tuple[str, str]] = [
            ("from", str(int(start.timestamp() * 1000))),
            ("to", str(int(end.timestamp() * 1000))),
            ("limit", "100"),
        ]
        for tag in tags or ["deployment"]:
            if tag.strip():
                params.append(("tags", tag.strip()))
        resp = await _http().get(f"{config.grafana_url}/api/annotations", params=params)
        resp.raise_for_status()
        annotations = [
            {
                "time": datetime.fromtimestamp((a.get("time") or 0) / 1000).isoformat(),
                "tags": a.get("tags", []),
                "text": (a.get("text") or "")[:300],
            }
            for a in resp.json()
        ]
        annotations.sort(key=lambda a: a["time"])
        return {"range": range, "tags": tags or ["deployment"],
                "count": len(annotations), "annotations": annotations}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"grafana annotations query failed: {exc}"}
