#!/usr/bin/env bash
# Rebuild and restart the full Docker Compose stack (backend + UI).
set -euo pipefail
cd "$(dirname "$0")"
docker compose down
docker compose up -d --build

echo ""
echo "Started CrewAI Office Visualizer:"
echo "- UI:      http://localhost:17300"
echo "- Backend: http://localhost:18765"
echo "- Event:   http://localhost:18765/event  (POST)"
echo "- WS:      ws://localhost:18765/ws"
echo ""
echo "Quick smoke:"
echo "  BASE_URL=http://localhost:18765 ./tests/send_event.sh"
