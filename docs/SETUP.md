# Setup and Run

## Docker mode (recommended)

The stack uses non-default host ports to reduce collisions:

- UI: `17300` -> container `80`
- Backend API: `18765` -> container `8000`

From repository root:

```bash
docker compose up -d --build
```

Or rebuild + restart:

```bash
./restart.sh
```

If you change backend port mapping in `docker-compose.yml`, rebuild the UI image so `VITE_WS_URL` matches your setup.

## Service endpoints

| Service | URL | Notes |
|--------|-----|--------|
| UI | [http://localhost:17300](http://localhost:17300) | Browser app served by nginx in container. |
| Backend API | [http://localhost:18765](http://localhost:18765) | `GET /health`, `POST /workspaces`, `POST /w/{workspace_id}/event`, `GET /w/{workspace_id}/ws`. |
| Swagger | [http://localhost:18765/docs](http://localhost:18765/docs) | OpenAPI UI. |
| ReDoc | [http://localhost:18765/redoc](http://localhost:18765/redoc) | Alternate API docs. |
| OpenAPI JSON | [http://localhost:18765/openapi.json](http://localhost:18765/openapi.json) | Raw schema. |

## Local development (without Docker)

### Backend

From `backend/` (Python 3.12):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Database and migrations (external Postgres)

Backend supports external Postgres via `DATABASE_URL`.

Example:

```bash
export DATABASE_URL='postgresql+psycopg://user:password@db-host:5432/office_visualizer'
```

Run migrations from `backend/`:

```bash
cd backend
alembic upgrade head
```

Connection checklist:

1. Postgres host is reachable from backend process/container.
2. `DATABASE_URL` uses `postgresql+psycopg://...`.
3. DB user has privileges to create/update tables.
4. `alembic upgrade head` completes without errors.
5. `GET /health` and `POST /workspaces` both succeed after startup.

### UI

From `ui/`:

```bash
cd ui
npm install
npm run dev
```

Vite runs on `5173` by default and proxies `/health`, `/workspaces`, and `/w/*` to `http://127.0.0.1:8000`.

## Smoke checks

Default scripts:

```bash
./tests/health.sh
eval "$(./tests/create_workspace.sh)"
./tests/send_event.sh
```

Override base URL:

```bash
BASE_URL=http://127.0.0.1:18765 ./tests/health.sh
```
