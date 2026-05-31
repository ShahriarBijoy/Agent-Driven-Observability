# dq-runner

`dq-runner` will execute scheduled data-quality checks against the AI Observability Lab's data store (Phase 3). It polls on a configurable interval, runs a suite of assertion queries, emits pass/fail metrics via OpenTelemetry, and enqueues remediation tasks through Redis when violations are detected. The service is intentionally empty at this stage — all implementation details are captured in `docs/PLAN.html`.

This app is managed with [uv](https://docs.astral.sh/uv/). After installing uv, run `uv sync` to create the virtual environment and `uv run python -m dq_runner` to launch the app. Python 3.11+ is required (3.12 recommended).
