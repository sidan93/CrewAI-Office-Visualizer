#!/usr/bin/env bash
# Sends a sample office event to POST /event (agents should move in the UI).
set -euo pipefail
BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
curl -sS -X POST "${BASE_URL}/event" \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","action":"IDLE"}' | grep -q '"status":"accepted"' || {
  echo "send_event failed for ${BASE_URL}/event" >&2
  exit 1
}
echo "OK: event IDLE at ${BASE_URL}/event"
