from fastapi import APIRouter, Header
from app.runtime import manager
from app.schemas.events import AcceptedResponse, OfficeEvent
from app.services.auth import ensure_workspace_access, extract_bearer_token

router = APIRouter(
    tags=["events"],
)


@router.post(
    "/w/{workspace_id}/event",
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
    token = extract_bearer_token(authorization)
    ensure_workspace_access(workspace_id, token)
    enriched_event = manager.upsert_agent_event(workspace_id, event)
    payload = {"type": "event", "workspace_id": workspace_id, **enriched_event.model_dump()}
    await manager.broadcast_json(workspace_id, payload)
    return AcceptedResponse(status="accepted")
