#!/usr/bin/env bash
# Requires proxy reachable (e.g. docker compose up or local uvicorn).
set -euo pipefail
BASE_URL="${BASE_URL:-http://127.0.0.1:18765}"
curl -sf "${BASE_URL}/health" | grep -q '"status":"ok"' || {
  echo "health check failed for ${BASE_URL}/health" >&2
  exit 1
}
echo "OK: ${BASE_URL}/health"
