#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
WORKSPACE_ID="${WORKSPACE_ID:?WORKSPACE_ID is required}"
WORKSPACE_TOKEN="${WORKSPACE_TOKEN:?WORKSPACE_TOKEN is required}"
AGENT="${AGENT:-demo}"
MESSAGE="${MESSAGE:-Agent registered in office}"

curl -sS -X POST "${BASE_URL}/w/${WORKSPACE_ID}/event" \
  -H "Authorization: Bearer ${WORKSPACE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{"agent":"${AGENT}","action":"REGISTERED","message":"${MESSAGE}"}" | grep -q '"status":"accepted"' || {
  echo "send_event failed for action 'REGISTERED' at ${BASE_URL}/w/${WORKSPACE_ID}/event" >&2
  exit 1
}

echo "OK: REGISTERED with message at ${BASE_URL}/w/${WORKSPACE_ID}/event"
