"""Entrypoint: launch the agent-service HTTP API with uvicorn."""

from __future__ import annotations

import uvicorn

from .config import config


def main() -> None:
    uvicorn.run(
        "agent_service.app:app",
        host="0.0.0.0",
        port=config.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
