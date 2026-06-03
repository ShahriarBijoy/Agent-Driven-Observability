# dq-runner — Python data-quality service (Phase 3). Self-contained (no workspace
# deps), so the build context is apps/dq-runner. uv image ships uv + Python 3.11.
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies first (cached) from the lockfile, then the source.
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN uv sync --frozen --no-dev

EXPOSE 8091
CMD ["uv", "run", "--no-dev", "python", "-m", "dq_runner"]
