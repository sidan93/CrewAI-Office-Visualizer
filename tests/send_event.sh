#!/usr/bin/env bash
# Sends a sample office event to POST /event (agents should move in the UI).
set -euo pipefail
BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
AGENT="${AGENT:-demo}"
ACTION="${ACTION:-IDLE}"
MESSAGE="${MESSAGE:-Smoke test message}"
curl -sS -X POST "${BASE_URL}/event" \
  -H 'Content-Type: application/json' \
  -d "{\"agent\":\"${AGENT}\",\"action\":\"${ACTION}\",\"message\":\"${MESSAGE}\"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for ${BASE_URL}/event" >&2
  exit 1
}
echo "OK: event ${ACTION} with message at ${BASE_URL}/event"
