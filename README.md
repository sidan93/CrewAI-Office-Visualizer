# CrewAI Office Visualizer

An autonomous visualizer that turns AI agent work into a **digital stage** while keeping corporate security intact.

## Concept

**CrewAI Office Visualizer** is a standalone open-source **sidecar** that plugs into any CrewAI project and renders agent actions in real time on a map of a virtual office.

## Tech stack (On-Prem)

| Layer | Choice |
|--------|--------|
| **Backend** | **FastAPI** (Python 3.12) — lightweight broker: accepts events from agents via HTTP POST and pushes them to the UI instantly via WebSockets. |
| **Frontend** | **React + Vite** — the office map uses the **Canvas API** or **PixiJS** for smooth character movement; styling with **Tailwind CSS**. |
| **Integration** | Minimal **Python SDK** / helper script wired into CrewAI **`step_callback`**. |
| **Infrastructure** | **Docker Compose** — full isolation, one command on any server. |

## Repository layout

| Path | Purpose |
|------|---------|
| `proxy/` | FastAPI backend (event ingestion & fan-out). |
| `ui/` | React frontend (virtual office visualization). |
| `client/` | Examples and helpers to connect from your agents. |

## License

MIT — see [LICENSE](LICENSE).

## GitHub description (short)

CrewAI Office Visualizer — Open-source tool to turn agent logs into a living digital workspace. Watch agents move between zones, stream thoughts, and report tool usage in real-time. 100% On-Prem, privacy-first monitoring with easy integration via step callbacks.

## Roadmap

1. **Event protocol** — Define a JSON schema for per-step payloads (agent name, role, action, location, etc.).
2. **FastAPI broker** — Implement `/event` to accept payloads and broadcast to WebSocket clients.
3. **Office frontend** — Map with zones (e.g. Research, QA, Dev) and smooth agent icons moving between them.
4. **AETERNA integration** — Include this visualizer in the main project via `docker-compose.yml` and wire `step_callback` in `aeterna-brain`.
