# Setup and Run

## Docker mode (recommended)

The stack uses non-default host ports to reduce collisions:

- UI: `17300` -> container `80`
- Proxy API: `18765` -> container `8000`

From repository root:

```bash
docker compose up -d --build
```

Or rebuild + restart:

```bash
./restart.sh
```

If you change proxy port mapping in `docker-compose.yml`, rebuild the UI image so `VITE_WS_URL` matches your setup.

## Service endpoints

| Service | URL | Notes |
|--------|-----|--------|
| UI | [http://localhost:17300](http://localhost:17300) | Browser app served by nginx in container. |
| Proxy API | [http://localhost:18765](http://localhost:18765) | `GET /health`, `POST /event`, `GET /ws`. |
| Swagger | [http://localhost:18765/docs](http://localhost:18765/docs) | OpenAPI UI. |
| ReDoc | [http://localhost:18765/redoc](http://localhost:18765/redoc) | Alternate API docs. |
| OpenAPI JSON | [http://localhost:18765/openapi.json](http://localhost:18765/openapi.json) | Raw schema. |

## Local development (without Docker)

### Proxy

From `proxy/` (Python 3.12):

```bash
cd proxy
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### UI

From `ui/`:

```bash
cd ui
npm install
npm run dev
```

Vite runs on `5173` by default and proxies `/health`, `/event`, and `/ws` to `http://127.0.0.1:8000`.

## Smoke checks

Default scripts:

```bash
./tests/health.sh
./tests/send_event.sh
```

Override base URL:

```bash
BASE_URL=http://127.0.0.1:18765 ./tests/health.sh
```
