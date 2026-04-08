import json
import time
from fastapi import WebSocket
from sqlalchemy import select
from app.db import SessionLocal
from app.idle_roam import IdleRoamConfig, IdleRoamTracker, build_idle_roam_message
from app.models import AgentEventRecord, AgentStateRecord
from app.schemas.events import AgentAction, OfficeEvent


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
