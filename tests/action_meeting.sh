#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
AGENT="${AGENT:-demo}"
MESSAGE="${MESSAGE:-Agent joined a meeting}"

curl -sS -X POST "${BASE_URL}/event" \
  -H 'Content-Type: application/json' \
  -d "{\"agent\":\"${AGENT}\",\"action\":\"MEETING\",\"message\":\"${MESSAGE}\"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for action 'MEETING' at ${BASE_URL}/event" >&2
  exit 1
}

echo "OK: MEETING with message at ${BASE_URL}/event"
