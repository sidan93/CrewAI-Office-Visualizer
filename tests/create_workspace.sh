#!/usr/bin/env bash
# Creates workspace and prints shell exports for WORKSPACE_ID and WORKSPACE_TOKEN.
set -euo pipefail

BASE_URL="${BASE_URL:-http://host.docker.internal:18765}"
WORKSPACE_NAME="${WORKSPACE_NAME:-Smoke Workspace}"

RESPONSE="$(curl -sS -X POST "${BASE_URL}/workspaces" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${WORKSPACE_NAME}\"}")"

WORKSPACE_ID="$(printf '%s' "${RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["workspace_id"])')"
WORKSPACE_TOKEN="$(printf '%s' "${RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"

echo "export WORKSPACE_ID=${WORKSPACE_ID}"
echo "export WORKSPACE_TOKEN=${WORKSPACE_TOKEN}"
