#!/usr/bin/env bash
# Sends a sample office event to POST /event (agents should move in the UI).
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:18765}"
curl -sS -X POST "${BASE_URL}/event" \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","x":0.25,"y":0.5,"action":"think"}' | grep -q '"status":"accepted"' || {
  echo "send_event failed for ${BASE_URL}/event" >&2
  exit 1
}
echo "OK: event accepted at ${BASE_URL}/event"
