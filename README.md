# CrewAI Office Visualizer

An autonomous visualizer that turns AI agent work into a **digital stage** while keeping corporate security intact.

## Concept

**CrewAI Office Visualizer** is a standalone open-source **sidecar** that plugs into any CrewAI project and renders agent actions in real time on a map of a virtual office.

## Tech stack (On-Prem)

| Layer | Choice |
|--------|--------|
| **Backend** | **FastAPI** (Python 3.12) — lightweight broker: accepts events from agents via HTTP POST and pushes them to the UI instantly via WebSockets. |
| **Frontend** | **React + Vite** — the office map uses the **Canvas API** for smooth character movement; styling with **Tailwind CSS**. |
| **Integration** | Minimal **Python SDK** / helper script wired into CrewAI **`step_callback`**. |
| **Infrastructure** | **Docker Compose** — full isolation, one command on any server. |

## Repository layout

| Path | Purpose |
|------|---------|
| `proxy/` | FastAPI backend (event ingestion & fan-out). |
| `ui/` | React frontend (virtual office visualization). |
| `tests/` | Bash scripts (`curl`) for smoke checks against the proxy. |
| `client/` | Examples and helpers to connect from your agents (planned). |

## Quick start (Docker)

Requires [Docker](https://docs.docker.com/get-docker/) with Compose v2.

The proxy is published on host port **18765** (mapped to `8000` inside the container) and the UI on **17300** (mapped to `80`), so defaults avoid common clashes with `8000` / `3000`. Change mappings in [`docker-compose.yml`](docker-compose.yml) if needed; if you change the proxy port, rebuild the UI image so `VITE_WS_URL` matches.

From the repository root:

```bash
docker compose up -d --build
```

Or rebuild and restart everything in one step:

```bash
./restart.sh
```

### Opening the web UI (office map)

- **With Docker Compose:** in your browser go to **[http://localhost:17300](http://localhost:17300)** — that is the React frontend (nginx). The page opens a WebSocket to the proxy on port **18765** so agents appear on the canvas when you `POST /event`.
- **Local dev (no Docker):** start the proxy and `npm run dev` in `ui/`, then open **[http://localhost:5173](http://localhost:5173)** (or the URL Vite prints).

| Service | URL | Notes |
|--------|-----|--------|
| **UI** | [http://localhost:17300](http://localhost:17300) | Host port **17300** → nginx `80` in the container. WebSocket: `ws://localhost:18765/ws` (set at image build via `VITE_WS_URL`). |
| **Proxy API** | [http://localhost:18765](http://localhost:18765) | Host port **18765** → container `8000`. `GET /health`, `POST /event`, `WebSocket /ws`. |

Send a sample event (with the stack running):

```bash
curl -sS -X POST http://127.0.0.1:18765/event \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","x":0.5,"y":0.4,"action":"think"}'
```

Smoke scripts (same `BASE_URL` as above by default):

```bash
./tests/health.sh
./tests/send_event.sh
```

Override the proxy base URL if needed:

```bash
BASE_URL=http://127.0.0.1:18765 ./tests/health.sh
```

## Local development (without Docker)

**Proxy** — from `proxy/` with Python 3.12:

```bash
cd proxy
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**UI** — from `ui/`:

```bash
cd ui
npm install
npm run dev
```

Vite dev server defaults to port **5173** and proxies `/health`, `/event`, and `/ws` to `http://127.0.0.1:8000`, so keep the proxy running locally. Open the URL Vite prints (usually `http://localhost:5173`).

## Event payload (minimal)

JSON body for `POST /event`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent` | string | yes | Agent id / display key. |
| `x`, `y` | number | yes | Normalized position on the map, each in `[0, 1]`. |
| `action` | string | no | Short label on the canvas. |
| `message` | string | no | Reserved for future UI (optional). |

## License

MIT — see [LICENSE](LICENSE).

## GitHub description (short)

CrewAI Office Visualizer — Open-source tool to turn agent logs into a living digital workspace. Watch agents move between zones, stream thoughts, and report tool usage in real-time. 100% On-Prem, privacy-first monitoring with easy integration via step callbacks.

## Roadmap

1. **Event protocol** — Extend JSON schema for per-step payloads (agent name, role, action, location, etc.).
2. **FastAPI broker** — Hardening, auth optional, metrics.
3. **Office frontend** — Richer zones, sprites, PixiJS if needed.
4. **AETERNA integration** — Wire `step_callback` and include in the main project compose.
5. **`client/`** — Minimal Python helper for CrewAI `step_callback`.
