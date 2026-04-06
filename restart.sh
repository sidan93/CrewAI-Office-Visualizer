#!/usr/bin/env bash
# Rebuild and restart the full Docker Compose stack (backend + UI).
set -euo pipefail
cd "$(dirname "$0")"

BACKEND_URL="${BACKEND_URL:-http://localhost:18765}"
UI_URL="${UI_URL:-http://localhost:17300}"

echo "Stopping existing stack..."
docker compose down
echo "Starting stack (rebuild enabled)..."
docker compose up -d --build

echo
echo "Services started:"
echo "  - Backend: ${BACKEND_URL}"
echo "  - UI:      ${UI_URL}"
echo
