# CrewAI Office Visualizer

An on-prem visualizer that turns AI-agent events into a live office scene.

![CrewAI Office Visualizer screenshot](docs/images/office-with-agents.png)

## What it is

`CrewAI Office Visualizer` is a standalone sidecar service:

- creates isolated workspaces with dedicated token access;
- receives events via HTTP (`POST /w/{workspace_id}/event`);
- broadcasts updates to the UI through WebSocket (`/w/{workspace_id}/ws`);
- renders agent activity on a virtual office map.

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/) with Compose v2.

```bash
docker compose up -d --build
```

Or restart with rebuild:

```bash
./restart.sh
```

Open:

- UI: [http://localhost:17300](http://localhost:17300)
- API: [http://localhost:18765](http://localhost:18765)
- Swagger: [http://localhost:18765/docs](http://localhost:18765/docs)

Create workspace (`workspace_id`, equivalent to `project_id` in test configs) and send a test event:

```bash
WS_RESPONSE="$(curl -sS -X POST http://127.0.0.1:18765/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"Demo Team"}')"
WORKSPACE_ID="$(printf '%s' "${WS_RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["workspace_id"])')"
WORKSPACE_TOKEN="$(printf '%s' "${WS_RESPONSE}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"

curl -sS -X POST "http://127.0.0.1:18765/w/${WORKSPACE_ID}/event" \
  -H "Authorization: Bearer ${WORKSPACE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","action":"WORKING"}'
```

Smoke scripts:

```bash
./tests/health.sh
eval "$(./tests/create_workspace.sh)"
./tests/send_event.sh
```

Agent activity simulator (10 agents):

```bash
eval "$(./tests/create_workspace.sh)"
BASE_URL=http://127.0.0.1:18765 \
WORKSPACE_ID="${WORKSPACE_ID}" \
WORKSPACE_TOKEN="${WORKSPACE_TOKEN}" \
python3 tests/simulate_agents.py
```

Reproducible short run:

```bash
BASE_URL=http://127.0.0.1:18765 \
PROJECT_ID="${WORKSPACE_ID}" \
WORKSPACE_TOKEN="${WORKSPACE_TOKEN}" \
RUN_STEPS=20 \
SEED=42 \
python3 tests/simulate_agents.py
```

Simulator config notes:

- Required: `BASE_URL`.
- `WORKSPACE_TOKEN` + `WORKSPACE_ID` (or `PROJECT_ID`) are optional now: if missing, script auto-creates workspace and prints ready-to-open UI link.
- Key optional params:
  - `AGENTS_COUNT` (default `10`)
  - `RUN_STEPS` (`0` means infinite, stop with `Ctrl+C`)
  - `TICK_SECONDS_MIN` / `TICK_SECONDS_MAX`
  - `TASK_CHANGE_PROBABILITY`, `MEETING_PROBABILITY`, `IDLE_PROBABILITY`
  - `TASK_POOL` (CSV list of tasks)

Open workspace UI:

- Home page: [http://localhost:17300/](http://localhost:17300/)
- Workspace view: `http://localhost:17300/w/<workspace_id>`
- In external scripts/configs you may name this value `PROJECT_ID`, but API path parameter is `workspace_id`.

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/` | FastAPI backend (event ingestion and fan-out). |
| `ui/` | React frontend (office visualization). |
| `tests/` | Bash smoke scripts (`curl`). |
| `utils/` | MCP bootstrap templates. |
| `docs/` | Detailed documentation. |

## Documentation

- Setup and run modes: [`docs/SETUP.md`](docs/SETUP.md)
- API event contract: [`docs/API.md`](docs/API.md)
- Sprite pack format: [`docs/SPRITES.md`](docs/SPRITES.md)
- Project roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)
- MCP quick setup: [`utils/README.md`](utils/README.md)

## Migration notes (legacy to workspace routes)

Legacy single-tenant routes:

- `POST /event`
- `WS /ws`

New workspace routes:

- `POST /workspaces`
- `POST /w/{workspace_id}/event` + `Authorization: Bearer <token>`
- `WS /w/{workspace_id}/ws?token=<token>`

Migration checklist:

1. Provision a workspace and securely store token.
2. Update all event producers to send `Authorization: Bearer`.
3. Update UI/client websocket URLs to include workspace path + token query.
4. Validate isolation by opening two different workspaces and sending events to each.

Terminology note:

- API/docs use `workspace_id`.
- If your integration uses `project_id`, treat it as the same identifier value.

## License

MIT - see [LICENSE](LICENSE).
