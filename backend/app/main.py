import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.events import router as events_router
from app.api.routes.system import router as system_router
from app.api.routes.workspaces import router as workspaces_router
from app.api.ws import router as ws_router
from app.db import engine
from app.models import Base
from app.runtime import IDLE_ROAM_CONFIG, manager

app = FastAPI(
    title="CrewAI Office Visualizer API",
    summary="Backend API for ingesting agent events and streaming them to UI clients.",
    description=(
        "FastAPI sidecar for the office visualizer.\n\n"
        "- `POST /workspaces`: create workspace and return access token.\n"
        "- `POST /w/{workspace_id}/event`: accepts a workspace-scoped CrewAI agent event.\n"
        "- `GET /health`: liveness check.\n"
        "- `GET /docs`: interactive Swagger UI.\n"
        "- `GET /redoc`: ReDoc documentation.\n"
        "- `WebSocket /w/{workspace_id}/ws`: workspace snapshot and real-time updates."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:17300",
        "http://127.0.0.1:17300",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:80",
        "http://127.0.0.1:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router)
app.include_router(workspaces_router)
app.include_router(events_router)
app.include_router(ws_router)

idle_roam_task: asyncio.Task[None] | None = None


async def idle_roam_loop() -> None:
    while True:
        await asyncio.sleep(IDLE_ROAM_CONFIG.check_interval_s)
        for workspace_id in manager.list_workspaces():
            events = manager.collect_idle_roam_events(workspace_id, IDLE_ROAM_CONFIG)
            for event in events:
                await manager.broadcast_json(
                    workspace_id, {"type": "event", "workspace_id": workspace_id, **event.model_dump()}
                )


@app.on_event("startup")
async def on_startup() -> None:
    global idle_roam_task
    Base.metadata.create_all(bind=engine)
    if idle_roam_task is None or idle_roam_task.done():
        idle_roam_task = asyncio.create_task(idle_roam_loop())


@app.on_event("shutdown")
async def on_shutdown() -> None:
    global idle_roam_task
    if idle_roam_task is not None:
        idle_roam_task.cancel()
        try:
            await idle_roam_task
        except asyncio.CancelledError:
            pass
        idle_roam_task = None
