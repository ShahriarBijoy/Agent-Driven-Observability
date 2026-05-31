# agent-service

`agent-service` will host the Claude Agent SDK integration for the AI Observability Lab (Phase 5). It exposes an HTTP API that accepts trace events and agent invocations, persists them to the shared database, and emits OpenTelemetry signals to the configured collector. The service is intentionally empty at this stage — all implementation details are captured in `docs/PLAN.html`.

This app is managed with [uv](https://docs.astral.sh/uv/). After installing uv, run `uv sync` to create the virtual environment and `uv run python -m agent_service` to launch the app. Python 3.11+ is required (3.12 recommended).
