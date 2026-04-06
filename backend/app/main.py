import asyncio
import json
import time
import uuid
from enum import Enum
from fastapi import FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select
from app.db import SessionLocal, engine
from app.idle_roam import IdleRoamConfig, IdleRoamTracker, build_idle_roam_message
from app.models import AgentEventRecord, AgentStateRecord, Base, Workspace, WorkspaceToken
from app.security import hash_workspace_token, issue_workspace_token, resolve_workspace_from_token

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


class AgentAction(str, Enum):
    REGISTERED = "REGISTERED"
    IDLE = "IDLE"
    MEETING = "MEETING"
    WORKING = "WORKING"


class OfficeEvent(BaseModel):
    agent: str = Field(
        ...,
        min_length=1,
        description="Unique agent id or display key.",
        examples=["researcher-1", "demo-agent"],
    )
    action: AgentAction = Field(
        ...,
        description="Strict agent action enum accepted by the API.",
        examples=["REGISTERED", "IDLE", "MEETING", "WORKING"],
    )
    message: str | None = Field(
        default=None,
        description="Optional human-readable detail for current action.",
        examples=["Reviewing requirements", "Preparing response"],
    )
    load: dict[str, float] | None = Field(
        default=None,
        description=(
            "Cumulative load distribution in percent by stage. "
            "Keys: idle, working, meeting. Sum is approximately 100."
        ),
        examples=[{"idle": 35.0, "working": 55.0, "meeting": 10.0}],
    )


class CreateWorkspaceRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200, description="Optional workspace display name.")


class CreateWorkspaceResponse(BaseModel):
    workspace_id: str = Field(..., description="Workspace id to use in API routes.", examples=["ws_a12bc34d56ef"])
    token: str = Field(..., description="Workspace write/read token. Returned once.", examples=["wst_..."])


class HealthResponse(BaseModel):
    status: str = Field(
        ...,
        description="Service health status.",
        examples=["ok"],
    )


class AcceptedResponse(BaseModel):
    status: str = Field(
        ...,
        description="Event ingestion status.",
        examples=["accepted"],
    )


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}
        self._agents: dict[str, dict[str, OfficeEvent]] = {}
        self._idle_roam: dict[str, IdleRoamTracker] = {}
        self._agent_stage_state: dict[str, dict[str, dict]] = {}

    def _action_to_stage(self, action: AgentAction) -> str:
        if action == AgentAction.MEETING:
            return "meeting"
        if action == AgentAction.WORKING:
            return "working"
        return "idle"

    def _ensure_workspace(self, workspace_id: str) -> None:
        self._connections.setdefault(workspace_id, [])
        self._agents.setdefault(workspace_id, {})
        self._agent_stage_state.setdefault(workspace_id, {})
        self._idle_roam.setdefault(workspace_id, IdleRoamTracker())

    def _ensure_agent_stage_state(self, workspace_id: str, agent: str, now: float) -> dict:
        self._ensure_workspace(workspace_id)
        state = self._agent_stage_state[workspace_id].get(agent)
        if state is not None:
            return state
        state = {
            "current_action": AgentAction.REGISTERED,
            "changed_at": now,
            "durations_s": {"idle": 0.0, "working": 0.0, "meeting": 0.0},
        }
        self._agent_stage_state[workspace_id][agent] = state
        return state

    def _snapshot_stage_percentages(self, workspace_id: str, agent: str, now: float) -> dict[str, float]:
        state = self._ensure_agent_stage_state(workspace_id, agent, now)
        durations = dict(state["durations_s"])
        elapsed = max(0.0, now - float(state["changed_at"]))
        current_stage = self._action_to_stage(state["current_action"])
        durations[current_stage] += elapsed
        total = durations["idle"] + durations["working"] + durations["meeting"]
        if total <= 0:
            return {"idle": 100.0, "working": 0.0, "meeting": 0.0}
        return {
            "idle": (durations["idle"] / total) * 100.0,
            "working": (durations["working"] / total) * 100.0,
            "meeting": (durations["meeting"] / total) * 100.0,
        }

    def _persist_event(self, workspace_id: str, event: OfficeEvent) -> None:
        with SessionLocal() as db:
            db.add(
                AgentEventRecord(
                    workspace_id=workspace_id,
                    agent=event.agent,
                    action=event.action.value,
                    message=event.message,
                    load_json=json.dumps(event.load) if event.load is not None else None,
                )
            )
            state = db.scalar(
                select(AgentStateRecord).where(
                    AgentStateRecord.workspace_id == workspace_id,
                    AgentStateRecord.agent == event.agent,
                )
            )
            if state is None:
                db.add(
                    AgentStateRecord(
                        workspace_id=workspace_id,
                        agent=event.agent,
                        action=event.action.value,
                        message=event.message,
                        load_json=json.dumps(event.load) if event.load is not None else None,
                    )
                )
            else:
                state.action = event.action.value
                state.message = event.message
                state.load_json = json.dumps(event.load) if event.load is not None else None
                db.add(state)
            db.commit()

    async def connect(self, workspace_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._ensure_workspace(workspace_id)
        self._connections[workspace_id].append(websocket)
        now = time.monotonic()
        workspace_agents = self._agents[workspace_id]
        await websocket.send_text(
            json.dumps(
                {
                    "type": "snapshot",
                    "workspace_id": workspace_id,
                    "agents": [
                        {
                            **agent.model_dump(),
                            "workspace_id": workspace_id,
                            "load": self._snapshot_stage_percentages(workspace_id, name, now),
                        }
                        for name, agent in sorted(workspace_agents.items(), key=lambda item: item[0])
                    ],
                },
                ensure_ascii=False,
            )
        )

    def disconnect(self, workspace_id: str, websocket: WebSocket) -> None:
        connections = self._connections.get(workspace_id, [])
        if websocket in connections:
            connections.remove(websocket)

    def upsert_agent_event(self, workspace_id: str, event: OfficeEvent) -> OfficeEvent:
        self._ensure_workspace(workspace_id)
        now = time.monotonic()
        stage_state = self._ensure_agent_stage_state(workspace_id, event.agent, now)
        elapsed = max(0.0, now - float(stage_state["changed_at"]))
        prev_stage = self._action_to_stage(stage_state["current_action"])
        stage_state["durations_s"][prev_stage] += elapsed
        stage_state["current_action"] = event.action
        stage_state["changed_at"] = now
        load = self._snapshot_stage_percentages(workspace_id, event.agent, now)
        enriched_event = event.model_copy(update={"load": load})
        self._idle_roam[workspace_id].observe_event(event.agent, event.action.value)
        self._agents[workspace_id][event.agent] = enriched_event
        self._persist_event(workspace_id, enriched_event)
        return enriched_event

    def collect_idle_roam_events(self, workspace_id: str, config: IdleRoamConfig) -> list[OfficeEvent]:
        self._ensure_workspace(workspace_id)
        actions_by_agent = {
            agent: snapshot.action.value for agent, snapshot in self._agents[workspace_id].items()
        }
        emissions = self._idle_roam[workspace_id].collect(actions_by_agent, config)
        events: list[OfficeEvent] = []
        for emission in emissions:
            event = OfficeEvent(
                agent=emission.agent,
                action=AgentAction.IDLE,
                message=build_idle_roam_message(emission.sequence),
            )
            events.append(self.upsert_agent_event(workspace_id, event))
        return events

    def list_workspaces(self) -> list[str]:
        return list(self._connections.keys())

    async def broadcast_json(self, workspace_id: str, payload: dict) -> None:
        text = json.dumps(payload, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in self._connections.get(workspace_id, []):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(workspace_id, ws)


manager = ConnectionManager()
IDLE_ROAM_CONFIG = IdleRoamConfig()
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


@app.get(
    "/health",
    tags=["system"],
    summary="Health check",
    description="Simple liveness endpoint for smoke tests and monitoring.",
    response_model=HealthResponse,
)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.post(
    "/workspaces",
    tags=["workspaces"],
    summary="Create workspace",
    description="Creates a workspace and returns workspace token once.",
    response_model=CreateWorkspaceResponse,
)
def create_workspace(payload: CreateWorkspaceRequest) -> CreateWorkspaceResponse:
    workspace_id = f"ws_{uuid.uuid4().hex[:12]}"
    raw_token = issue_workspace_token()
    with SessionLocal() as db:
        workspace = Workspace(id=workspace_id, name=payload.name)
        token_record = WorkspaceToken(workspace_id=workspace_id, token_hash=hash_workspace_token(raw_token))
        db.add(workspace)
        db.add(token_record)
        db.commit()
    return CreateWorkspaceResponse(workspace_id=workspace_id, token=raw_token)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization Bearer token is required"
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header")
    return token


@app.post(
    "/w/{workspace_id}/event",
    tags=["events"],
    summary="Ingest workspace agent event",
    description=(
        "Accepts workspace-scoped agent event, updates state for that workspace, "
        "and broadcasts only to workspace WebSocket clients. "
        "Allowed `action` values: REGISTERED, IDLE, MEETING, WORKING."
    ),
    response_model=AcceptedResponse,
)
async def post_event(
    workspace_id: str, event: OfficeEvent, authorization: str | None = Header(default=None)
) -> AcceptedResponse:
    token = _extract_bearer_token(authorization)
    with SessionLocal() as db:
        resolved_workspace_id = resolve_workspace_from_token(db, token)
    if resolved_workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token does not match workspace")
    enriched_event = manager.upsert_agent_event(workspace_id, event)
    payload = {"type": "event", "workspace_id": workspace_id, **enriched_event.model_dump()}
    await manager.broadcast_json(workspace_id, payload)
    return AcceptedResponse(status="accepted")


@app.websocket("/w/{workspace_id}/ws")
async def websocket_endpoint(websocket: WebSocket, workspace_id: str, token: str = Query(default="")) -> None:
    if not token:
        await websocket.close(code=1008, reason="Workspace token required")
        return
    try:
        with SessionLocal() as db:
            resolved_workspace_id = resolve_workspace_from_token(db, token)
    except HTTPException:
        await websocket.close(code=1008, reason="Invalid workspace token")
        return
    if resolved_workspace_id != workspace_id:
        await websocket.close(code=1008, reason="Token does not match workspace")
        return
    await manager.connect(workspace_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(workspace_id, websocket)
