#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
WORKSPACE_ID="${WORKSPACE_ID:?WORKSPACE_ID is required}"
WORKSPACE_TOKEN="${WORKSPACE_TOKEN:?WORKSPACE_TOKEN is required}"
AGENT="${AGENT:-demo}"
MESSAGE="${MESSAGE:-Agent is taking a break}"

curl -sS -X POST "${BASE_URL}/w/${WORKSPACE_ID}/event" \
  -H "Authorization: Bearer ${WORKSPACE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{"agent":"${AGENT}","action":"IDLE","message":"${MESSAGE}"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for action 'IDLE' at ${BASE_URL}/w/${WORKSPACE_ID}/event" >&2
  exit 1
}

echo "OK: IDLE with message at ${BASE_URL}/w/${WORKSPACE_ID}/event"
