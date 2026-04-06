#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
AGENT="${AGENT:-demo}"

curl -sS -X POST "${BASE_URL}/event" \
  -H 'Content-Type: application/json' \
  -d "{\"agent\":\"${AGENT}\",\"action\":\"IDLE\"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for action 'IDLE' at ${BASE_URL}/event" >&2
  exit 1
}

echo "OK: IDLE at ${BASE_URL}/event"
