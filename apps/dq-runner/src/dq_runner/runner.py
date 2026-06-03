"""Run one pass of every data-quality check against the inferences table.

Each check fetches its data, updates the metric snapshot, and records violations.
Sections are independently guarded so one failing check never aborts the pass.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import psycopg
from opentelemetry.metrics import Counter

from dq_runner import db
from dq_runner.checks.cache_health import cache_hit_ratio, classify_cache
from dq_runner.checks.distribution import classify_drift, ks_drift
from dq_runner.checks.freshness import classify_freshness, freshness_seconds
from dq_runner.checks.schema_check import count_schema_failures
from dq_runner.checks.volume import classify_volume, volume_ratio
from dq_runner.config import Config
from dq_runner.state import Snapshot

log = logging.getLogger("dq_runner")

# DQ metric signal -> inferences column.
DRIFT_SIGNALS = {
    "prompt_chars": "prompt_chars",
    "retrieval_score": "retrieval_score_mean",
    "completion_tokens": "completion_tokens",
}


def _record_violation(
    conn: psycopg.Connection,
    counter: Counter,
    *,
    check: str,
    signal: str | None,
    severity: str,
    dataset: str | None,
    payload: dict[str, Any],
) -> None:
    try:
        db.insert_violation(conn, check, signal, severity, dataset, payload)
    except Exception as exc:  # noqa: BLE001 - violation persistence is best-effort
        log.warning("violation persist failed: %s", exc)
    counter.add(1, {"check": check, "severity": severity})
    log.info("dq violation check=%s signal=%s severity=%s", check, signal, severity)


def run_pass(
    conn: psycopg.Connection,
    cfg: Config,
    snapshot: Snapshot,
    metrics_violations: Counter,
    metrics_runs: Counter,
    redis_conn: Any | None = None,
    now: datetime | None = None,
) -> dict[str, int]:
    now = now or datetime.now(timezone.utc)
    metrics_runs.add(1)
    summary = {"violations": 0}

    def violate(**kwargs: Any) -> None:
        _record_violation(conn, metrics_violations, **kwargs)
        summary["violations"] += 1

    # --- freshness -------------------------------------------------------
    try:
        points: list[tuple[float, dict[str, str]]] = []
        for tenant, last in db.last_inference_per_tenant(conn).items():
            secs = freshness_seconds(last, now)
            if secs is None:
                continue
            points.append((secs, {"dataset": "inferences", "tenant": tenant}))
            severity = classify_freshness(secs, cfg.freshness_max_seconds)
            if severity:
                violate(
                    check="freshness",
                    signal=f"inferences:{tenant}",
                    severity=severity,
                    dataset="inferences",
                    payload={"tenant": tenant, "seconds": secs},
                )
        chunks_secs = freshness_seconds(db.max_created_at(conn, "chunks"), now)
        if chunks_secs is not None:
            points.append((chunks_secs, {"dataset": "vector_store.chunks", "tenant": ""}))
        snapshot.set_series("dq_freshness_seconds", points)
    except Exception as exc:  # noqa: BLE001
        log.warning("freshness check failed: %s", exc)

    # --- volume ----------------------------------------------------------
    try:
        current = db.inference_counts(conn, cfg.volume_window_seconds)
        baseline = db.inference_counts(conn, cfg.volume_baseline_seconds)
        count_points: list[tuple[float, dict[str, str]]] = []
        ratio_points: list[tuple[float, dict[str, str]]] = []
        for tenant in set(current) | set(baseline):
            cur = current.get(tenant, 0)
            base = baseline.get(tenant, 0)
            count_points.append((float(cur), {"tenant": tenant}))
            cur_per_min = cur / (cfg.volume_window_seconds / 60.0)
            base_per_min = base / (cfg.volume_baseline_seconds / 60.0)
            ratio = volume_ratio(cur_per_min, base_per_min)
            if ratio is None:
                continue
            ratio_points.append((ratio, {"tenant": tenant}))
            classified = classify_volume(ratio, cfg.volume_low, cfg.volume_high)
            if classified:
                kind, severity = classified
                violate(
                    check="volume",
                    signal=f"{kind}:{tenant}",
                    severity=severity,
                    dataset="inferences",
                    payload={
                        "tenant": tenant,
                        "kind": kind,
                        "ratio": ratio,
                        "current_per_min": cur_per_min,
                        "baseline_per_min": base_per_min,
                    },
                )
        snapshot.set_series("dq_volume_count", count_points)
        snapshot.set_series("dq_volume_ratio", ratio_points)
    except Exception as exc:  # noqa: BLE001
        log.warning("volume check failed: %s", exc)

    # --- distribution / drift -------------------------------------------
    try:
        drift_points: list[tuple[float, dict[str, str]]] = []
        for signal, column in DRIFT_SIGNALS.items():
            baseline_s = db.distribution_samples(conn, column, cfg.drift_baseline_seconds)
            current_s = db.distribution_samples(conn, column, cfg.drift_current_seconds)
            ks = ks_drift(baseline_s, current_s, cfg.distribution_min_samples)
            if ks is None:
                continue
            drift_points.append((ks, {"signal": signal}))
            severity = classify_drift(ks, cfg.drift_warn, cfg.drift_high)
            if severity:
                violate(
                    check="distribution",
                    signal=signal,
                    severity=severity,
                    dataset="inferences",
                    payload={"signal": signal, "ks": ks},
                )
        snapshot.set_series("dq_distribution_drift", drift_points)
    except Exception as exc:  # noqa: BLE001
        log.warning("distribution check failed: %s", exc)

    # --- schema ----------------------------------------------------------
    try:
        responses = db.recent_responses(conn, cfg.schema_sample_size)
        fail_count, errors = count_schema_failures(responses)
        snapshot.set_series("dq_schema_failures", [(float(fail_count), {})])
        snapshot.set_series("dq_schema_sampled", [(float(len(responses)), {})])
        if fail_count > 0:
            violate(
                check="schema",
                signal="chat_response",
                severity="high",
                dataset="completions.recent",
                payload={"failures": fail_count, "sampled": len(responses), "examples": errors[:5]},
            )
    except Exception as exc:  # noqa: BLE001
        log.warning("schema check failed: %s", exc)

    # --- cache health ----------------------------------------------------
    try:
        cache_points: list[tuple[float, dict[str, str]]] = []
        for tenant, (hits, total) in db.cache_stats(conn, cfg.cache_window_seconds).items():
            ratio = cache_hit_ratio(hits, total)
            if ratio is None:
                continue
            cache_points.append((ratio, {"tenant": tenant}))
            severity = classify_cache(ratio, total, cfg.cache_min_samples, cfg.cache_min_ratio)
            if severity:
                violate(
                    check="cache_health",
                    signal=tenant,
                    severity=severity,
                    dataset="cache.embeddings",
                    payload={"tenant": tenant, "ratio": ratio, "samples": total},
                )
        snapshot.set_series("dq_cache_hit_ratio", cache_points)
    except Exception as exc:  # noqa: BLE001
        log.warning("cache-health check failed: %s", exc)

    # --- redis cache size (supplementary gauge) --------------------------
    if redis_conn is not None:
        try:
            snapshot.set_series("dq_cache_keys", [(float(redis_conn.dbsize()), {})])
        except Exception as exc:  # noqa: BLE001
            log.warning("redis dbsize failed: %s", exc)

    return summary
