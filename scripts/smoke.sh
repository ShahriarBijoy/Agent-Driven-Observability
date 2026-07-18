#!/usr/bin/env bash
set -euo pipefail

# End-to-end smoke test for the Phase 1 subject system.
#   1. Build + start the stack (postgres, redis, the four TS services).
#   2. Wait for the gateway /health to report healthy.
#   3. Run the one-shot seed job (idempotent).
#   4. POST a chat request through the gateway and assert the response
#      carries a non-empty `retrieved` array (proves the RAG flow ran).
# Prints PASS/FAIL and exits non-zero on any failure.

cd "$(dirname "$0")/.."

COMPOSE_FILE="infra/compose.yml"
# Overridable: obs smoke exports the mode-aware URL (k8s mode = the VM).
GATEWAY="${GATEWAY:-http://localhost:8080}"
HEALTH_TIMEOUT_SECONDS=180

fail() {
  echo "SMOKE: FAIL — $1" >&2
  if [ "${SMOKE_MODE:-compose}" != "k8s" ]; then
    echo "----- gateway logs (tail) -----" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail 50 gateway >&2 || true
  fi
  exit 1
}

# k8s mode (obs smoke exports SMOKE_MODE): the subject system already runs in
# the cluster - deployed, seeded, and health-gated by k8s-build.ps1 - so the
# compose up/seed steps must not run (they'd start a SECOND subject system).
if [ "${SMOKE_MODE:-compose}" != "k8s" ]; then
  echo "SMOKE: bringing up the subject system (build + up)..."
  docker compose -f "$COMPOSE_FILE" up -d --build
fi

echo "SMOKE: waiting up to ${HEALTH_TIMEOUT_SECONDS}s for gateway health..."
deadline=$(( $(date +%s) + HEALTH_TIMEOUT_SECONDS ))
until curl -fsS "${GATEWAY}/health" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    fail "gateway did not become healthy within ${HEALTH_TIMEOUT_SECONDS}s"
  fi
  sleep 3
done
echo "SMOKE: gateway is healthy."

if [ "${SMOKE_MODE:-compose}" != "k8s" ]; then
  echo "SMOKE: seeding the corpus (one-shot)..."
  docker compose -f "$COMPOSE_FILE" run --rm seed || fail "seed job failed"
fi

echo "SMOKE: issuing a chat request through the gateway..."
RESPONSE="$(curl -fsS -X POST "${GATEWAY}/v1/chat" \
  -H "authorization: Bearer dev-local-token" \
  -H "content-type: application/json" \
  -d '{"prompt":"hello"}')" || fail "chat request did not return 2xx"

echo "SMOKE: response: ${RESPONSE}"

# Assert `retrieved` is a non-empty array. Prefer jq when present; otherwise
# fall back to a small Bun one-liner (the same runtime the services use).
if command -v jq >/dev/null 2>&1; then
  COUNT="$(printf '%s' "$RESPONSE" | jq '.retrieved | length')" \
    || fail "could not parse response JSON with jq"
elif command -v bun >/dev/null 2>&1; then
  COUNT="$(printf '%s' "$RESPONSE" | bun -e \
    'const t=await Bun.stdin.text();const j=JSON.parse(t);const r=j.retrieved;process.stdout.write(String(Array.isArray(r)?r.length:-1));')" \
    || fail "could not parse response JSON with bun"
else
  fail "neither jq nor bun is available to parse the response"
fi

if [ -z "${COUNT:-}" ] || [ "$COUNT" -le 0 ] 2>/dev/null; then
  fail "expected a non-empty 'retrieved' array, got count='${COUNT}'"
fi

echo "SMOKE: retrieved ${COUNT} chunk(s)."
echo "SMOKE: PASS"
exit 0
