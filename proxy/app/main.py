import asyncio
import json
import time
from enum import Enum
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from app.idle_roam import IdleRoamConfig, IdleRoamTracker, build_idle_roam_message

app = FastAPI(
    title="CrewAI Office Visualizer API",
    summary="Proxy API for ingesting agent events and streaming them to UI clients.",
    description=(
        "FastAPI sidecar for the office visualizer.\n\n"
        "- `POST /event`: accepts a CrewAI agent event.\n"
        "- `GET /health`: liveness check.\n"
        "- `GET /docs`: interactive Swagger UI.\n"
        "- `GET /redoc`: ReDoc documentation.\n"
        "- `WebSocket /ws`: pushes snapshots and real-time updates to UI clients."
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
        self._connections: list[WebSocket] = []
        self._agents: dict[str, OfficeEvent] = {}
        self._idle_roam = IdleRoamTracker()
        self._agent_stage_state: dict[str, dict] = {}

    def _action_to_stage(self, action: AgentAction) -> str:
        if action == AgentAction.MEETING:
            return "meeting"
        if action == AgentAction.WORKING:
            return "working"
        return "idle"

    def _ensure_agent_stage_state(self, agent: str, now: float) -> dict:
        state = self._agent_stage_state.get(agent)
        if state is not None:
            return state
        state = {
            "current_action": AgentAction.REGISTERED,
            "changed_at": now,
            "durations_s": {"idle": 0.0, "working": 0.0, "meeting": 0.0},
        }
        self._agent_stage_state[agent] = state
        return state

    def _snapshot_stage_percentages(self, agent: str, now: float) -> dict[str, float]:
        state = self._ensure_agent_stage_state(agent, now)
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

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        now = time.monotonic()
        await websocket.send_text(
            json.dumps(
                {
                    "type": "snapshot",
                    "agents": [
                        {
                            **agent.model_dump(),
                            "load": self._snapshot_stage_percentages(name, now),
                        }
                        for name, agent in sorted(self._agents.items(), key=lambda item: item[0])
                    ],
                },
                ensure_ascii=False,
            )
        )

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)

    def upsert_agent_event(self, event: OfficeEvent) -> OfficeEvent:
        now = time.monotonic()
        stage_state = self._ensure_agent_stage_state(event.agent, now)
        elapsed = max(0.0, now - float(stage_state["changed_at"]))
        prev_stage = self._action_to_stage(stage_state["current_action"])
        stage_state["durations_s"][prev_stage] += elapsed
        stage_state["current_action"] = event.action
        stage_state["changed_at"] = now
        load = self._snapshot_stage_percentages(event.agent, now)
        enriched_event = event.model_copy(update={"load": load})
        self._idle_roam.observe_event(event.agent, event.action.value)
        self._agents[event.agent] = enriched_event
        return enriched_event

    def collect_idle_roam_events(self, config: IdleRoamConfig) -> list[OfficeEvent]:
        actions_by_agent = {
            agent: snapshot.action.value for agent, snapshot in self._agents.items()
        }
        emissions = self._idle_roam.collect(actions_by_agent, config)
        events: list[OfficeEvent] = []
        for emission in emissions:
            event = OfficeEvent(
                agent=emission.agent,
                action=AgentAction.IDLE,
                message=build_idle_roam_message(emission.sequence),
            )
            events.append(self.upsert_agent_event(event))
        return events

    async def broadcast_json(self, payload: dict) -> None:
        text = json.dumps(payload, ensure_ascii=False)
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()
IDLE_ROAM_CONFIG = IdleRoamConfig()
idle_roam_task: asyncio.Task[None] | None = None


async def idle_roam_loop() -> None:
    while True:
        await asyncio.sleep(IDLE_ROAM_CONFIG.check_interval_s)
        events = manager.collect_idle_roam_events(IDLE_ROAM_CONFIG)
        for event in events:
            await manager.broadcast_json({"type": "event", **event.model_dump()})


@app.on_event("startup")
async def on_startup() -> None:
    global idle_roam_task
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
    "/event",
    tags=["events"],
    summary="Ingest agent event",
    description=(
        "Accepts an agent event, updates the in-memory state for that agent, "
        "and broadcasts the event to all active WebSocket clients. "
        "Allowed `action` values: REGISTERED, IDLE, MEETING, WORKING."
    ),
    response_model=AcceptedResponse,
)
async def post_event(event: OfficeEvent) -> AcceptedResponse:
    enriched_event = manager.upsert_agent_event(event)
    payload = {"type": "event", **enriched_event.model_dump()}
    await manager.broadcast_json(payload)
    return AcceptedResponse(status="accepted")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
