#!/usr/bin/env bash
# Sends a sample office event to tenant endpoint.
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
WORKSPACE_ID="${WORKSPACE_ID:?WORKSPACE_ID is required}"
WORKSPACE_TOKEN="${WORKSPACE_TOKEN:?WORKSPACE_TOKEN is required}"
AGENT="${AGENT:-demo}"
ACTION="${ACTION:-IDLE}"
MESSAGE="${MESSAGE:-Smoke test message}"

curl -sS -X POST "${BASE_URL}/w/${WORKSPACE_ID}/event" \
  -H "Authorization: Bearer ${WORKSPACE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"agent\":\"${AGENT}\",\"action\":\"${ACTION}\",\"message\":\"${MESSAGE}\"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for ${BASE_URL}/w/${WORKSPACE_ID}/event" >&2
  exit 1
}

echo "OK: event ${ACTION} with message at ${BASE_URL}/w/${WORKSPACE_ID}/event"
