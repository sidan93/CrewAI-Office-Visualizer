# Backend (`backend/`)

FastAPI backend for CrewAI Office Visualizer.

Provides workspace creation, event ingestion, and workspace-scoped WebSocket streaming.

## Prerequisites

- Python 3.12+
- `pip`

## Install dependencies

```bash
pip install -r requirements.txt
```

## Run locally

From `backend/`:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Open:

- API base: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- ReDoc: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

## Environment variables

- `DATABASE_URL` (optional): SQLAlchemy database URL.
  - Default in Docker Compose: `sqlite:////app/office_visualizer.db`.
  - For local development, common SQLite form is `sqlite:///./office_visualizer.db`.

## Main endpoints

- `POST /workspaces` - create workspace and return one-time token.
- `POST /w/{workspace_id}/event` - ingest workspace event (`Authorization: Bearer <token>` required).
- `GET /health` - liveness probe.
- `WS /w/{workspace_id}/ws?token=<token>` - receive snapshot and real-time updates.

## Docker image

The local Docker image is built from `backend/Dockerfile` and starts with:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Notes

- Workspace token protects both HTTP event ingestion and WebSocket access.
- Root project setup, compose orchestration, and smoke scripts are documented in the repository root `README.md`.
