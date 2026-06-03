"""Entrypoint: run the dq-runner FastAPI app under uvicorn."""

from __future__ import annotations

import uvicorn

from dq_runner.config import load_config


def main() -> None:
    cfg = load_config()
    uvicorn.run(
        "dq_runner.app:create_app",
        factory=True,
        host="0.0.0.0",
        port=cfg.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
