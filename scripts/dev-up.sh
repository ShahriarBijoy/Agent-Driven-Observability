#!/usr/bin/env bash
set -euo pipefail

# Bring up the full lab: subject + observability + lineage planes.
# Usage: ./scripts/dev-up.sh [extra docker compose args]
cd "$(dirname "$0")/.."

docker compose \
  -f infra/compose.yml \
  -f infra/compose.observability.yml \
  -f infra/compose.lineage.yml \
  up -d "$@"
