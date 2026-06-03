"""FastAPI app + APScheduler that runs the DQ check pass on a fixed interval."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI

from dq_runner import db
from dq_runner.config import Config, load_config
from dq_runner.runner import run_pass
from dq_runner.state import Snapshot
from dq_runner.telemetry import setup_metrics

logging.basicConfig(
    level=logging.INFO,
    format='{"level":"%(levelname)s","service":"dq-runner","message":"%(message)s"}',
)
log = logging.getLogger("dq_runner")


def _connect_redis(redis_url: str | None):
    if not redis_url:
        return None
    try:
        import redis

        return redis.Redis.from_url(redis_url)
    except Exception as exc:  # noqa: BLE001
        log.warning("redis connect failed: %s", exc)
        return None


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or load_config()
    snapshot = Snapshot()
    metrics = setup_metrics(cfg.otel_endpoint, snapshot, cfg.metric_export_interval_ms)
    redis_conn = _connect_redis(cfg.redis_url)

    def do_pass() -> dict[str, int]:
        try:
            with db.connect(cfg.database_url) as conn:
                db.ensure_schema(conn)
                result = run_pass(
                    conn, cfg, snapshot, metrics.violations, metrics.runs, redis_conn
                )
            log.info("dq pass complete violations=%s", result["violations"])
            return result
        except Exception as exc:  # noqa: BLE001
            log.warning("dq pass failed: %s", exc)
            return {"violations": 0, "error": 1}

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        do_pass,
        "interval",
        seconds=cfg.check_interval_seconds,
        id="dq-pass",
        max_instances=1,
        coalesce=True,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        scheduler.start()
        do_pass()  # one pass immediately so dashboards populate without waiting
        log.info("dq-runner started (interval=%ss)", cfg.check_interval_seconds)
        yield
        scheduler.shutdown(wait=False)
        metrics.shutdown()

    app = FastAPI(title="dq-runner", version="0.0.0", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "dq-runner"}

    @app.post("/run")
    def run_now() -> dict[str, int]:
        return do_pass()

    @app.get("/violations")
    def violations(limit: int = 20) -> dict[str, object]:
        with db.connect(cfg.database_url) as conn:
            return {"violations": db.recent_violations(conn, limit)}

    return app
