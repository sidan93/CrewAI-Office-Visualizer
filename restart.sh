#!/usr/bin/env bash
# Rebuild and restart the full Docker Compose stack (proxy + UI).
set -euo pipefail
cd "$(dirname "$0")"
docker compose down
docker compose up -d --build
