#!/usr/bin/env bash
set -euo pipefail

# The Synthetic Incident demo (Plan section p6 task 10) - the lab's elevator pitch.
#
# It drives one on-purpose incident end to end:
#   1. make sure the lab is up (subject + observability planes) and the
#      host-run agent-service is reachable,
#   2. inject a chaos error burst (model-proxy 500s -> gateway 502s),
#   3. wait for the gateway "5xx > 2%" alert to fire, webhook the agent-service,
#      and produce a postmortem in the incident inbox,
#   4. ask the RCA assistant a scripted follow-up and stream its answer,
#   5. print a transcript.
#
# Prereqs you must have running yourself (the agent-service needs your local
# Claude Code session for auth, so this script cannot start it):
#   - Docker (this script brings up the compose stack if it is not already up)
#   - the agent-service on :8093   (e.g. `obs agents`)
#
# Usage: ./scripts/demo-incident.sh
cd "$(dirname "$0")/.."

GATEWAY="http://localhost:8080"
AGENT="http://localhost:8093"
TENANT="acme"
COMPOSE=(-f infra/compose.yml -f infra/compose.observability.yml)
INCIDENT_TIMEOUT_SECONDS=${INCIDENT_TIMEOUT_SECONDS:-540}

section() {
  echo
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
}
die() {
  echo "demo: FAIL - $1" >&2
  exit 1
}

PYTHON="$(command -v python3 || command -v python || true)"
[ -n "$PYTHON" ] || die "python3 (or python) is required to parse the agent stream"

# An SSE parser for the agent-service /chat stream (token/tool_call/done/error).
PARSER="$(mktemp)"
cleanup() {
  rm -f "$PARSER"
  # Best-effort: clear any chaos left on the subject services.
  curl -sf -X DELETE "http://localhost:8083/admin/chaos" >/dev/null 2>&1 || true
  curl -sf -X DELETE "http://localhost:8082/admin/chaos" >/dev/null 2>&1 || true
  [ -n "${CHAOS_PID:-}" ] && kill "$CHAOS_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cat >"$PARSER" <<'PY'
import sys, json
for raw in sys.stdin:
    raw = raw.strip()
    if not raw.startswith('data:'):
        continue
    try:
        ev = json.loads(raw[5:].strip())
    except Exception:
        continue
    t = ev.get('type')
    if t == 'token':
        sys.stdout.write(ev.get('text', ''))
        sys.stdout.flush()
    elif t == 'tool_call':
        sys.stdout.write('\n  - tool: ' + str(ev.get('toolCall', {}).get('name', '?')) + '\n')
        sys.stdout.flush()
    elif t == 'done':
        sys.stdout.write('\n\n[run ' + str(ev.get('status')) + ']\n')
        break
    elif t == 'error':
        sys.stdout.write('\n[error] ' + str(ev.get('message')) + '\n')
        break
PY

psql_lab() {
  docker compose -f infra/compose.yml exec -T postgres \
    psql -U lab -d observability_lab -tAc "$1" 2>/dev/null | tr -d '\r'
}

# --- 1. Preflight ------------------------------------------------------------
section "1/5  Preflight"

if ! curl -fsS "${GATEWAY}/health" >/dev/null 2>&1; then
  echo "gateway not up - bringing up the lab (subject + observability)..."
  docker compose "${COMPOSE[@]}" up -d --build
  echo "waiting up to 180s for the gateway to become healthy..."
  deadline=$(( $(date +%s) + 180 ))
  until curl -fsS "${GATEWAY}/health" >/dev/null 2>&1; do
    [ "$(date +%s)" -ge "$deadline" ] && die "gateway did not become healthy"
    sleep 3
  done
  docker compose -f infra/compose.yml run --rm seed >/dev/null 2>&1 || true
fi
echo "OK  gateway healthy"

curl -fsS "${AGENT}/health" >/dev/null 2>&1 \
  || die "agent-service not reachable at ${AGENT}. Start it first (e.g. \`obs agents\`) - it needs your local Claude session."
echo "OK  agent-service healthy"

# Prove the RAG path works before we break it.
curl -fsS -X POST "${GATEWAY}/v1/chat" \
  -H "authorization: Bearer dev-local-token" -H "content-type: application/json" \
  -d '{"prompt":"warm-up"}' >/dev/null 2>&1 || die "baseline chat request failed"
echo "OK  baseline /v1/chat works"

BEFORE="$(psql_lab 'select count(*) from incidents')"
BEFORE="${BEFORE:-0}"
echo "OK  incident inbox currently holds ${BEFORE} incident(s)"

# --- 2. Inject the incident --------------------------------------------------
section "2/5  Injecting a synthetic incident (chaos error burst)"
echo "driving traffic + a sustained model-proxy error burst (chaos/demo.yaml)..."
CHAOS_SCHEDULE="chaos/demo.yaml" \
GATEWAY_URL="${GATEWAY}" \
MODEL_PROXY_URL="http://localhost:8083" \
RETRIEVER_URL="http://localhost:8082" \
  bun --cwd apps/load-generator run chaos &
CHAOS_PID=$!
echo "OK  chaos scheduler started (pid ${CHAOS_PID})"

# --- 3. Wait for the postmortem ----------------------------------------------
section "3/5  Waiting for the reporter's postmortem in the incident inbox"
echo "the gateway 5xx alert fires (~2-3 min), webhooks the agent-service, and"
echo "the incident reporter investigates and writes a postmortem. Polling..."
deadline=$(( $(date +%s) + INCIDENT_TIMEOUT_SECONDS ))
NEW_ID=""
while :; do
  NOW="$(psql_lab 'select count(*) from incidents')"; NOW="${NOW:-0}"
  if [ "$NOW" -gt "$BEFORE" ] 2>/dev/null; then
    NEW_ID="$(psql_lab 'select id from incidents order by created_at desc limit 1')"
    break
  fi
  [ "$(date +%s)" -ge "$deadline" ] && die "no new incident within ${INCIDENT_TIMEOUT_SECONDS}s (is Grafana able to reach host.docker.internal:8093?)"
  sleep 10
done
echo "OK  new incident: ${NEW_ID}"
echo
echo "  -- incident inbox entry --"
psql_lab "select 'title:    '||title||E'\nseverity: '||severity||E'\nsummary:  '||coalesce(summary,'(none)') from incidents where id='${NEW_ID}'"
echo
echo "  -- postmortem (excerpt) --"
psql_lab "select left(coalesce(postmortem_md,'(no postmortem body)'), 1200) from incidents where id='${NEW_ID}'"

# --- 4. RCA follow-up --------------------------------------------------------
section "4/5  RCA assistant - scripted follow-up"
QUESTION="The gateway 5xx error rate just spiked. Using the metrics, logs, and traces, what is the failing dependency and the most likely cause? Cite the telemetry you used."
echo "Q: ${QUESTION}"
echo
echo "A:"
curl -sN --max-time 200 -X POST "${AGENT}/chat" \
  -H "content-type: application/json" \
  -d "$(printf '{"agent":"rca","tenant":"%s","message":%s}' "$TENANT" "$($PYTHON -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$QUESTION")")" \
  | "$PYTHON" -u "$PARSER" || echo "(rca stream ended)"

# --- 5. Done ==============================================================---
section "5/5  Done"
echo "Watch the incident recover: as the burst ends the SLIs return to healthy and"
echo "the alert resolves. Explore in Grafana (http://localhost:3001) and the web"
echo "control plane (http://localhost:3003 -> Incidents)."
echo
echo "demo: PASS"
