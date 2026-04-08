from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from app.runtime import manager
from app.services.auth import resolve_workspace_for_token

router = APIRouter()


@router.websocket("/w/{workspace_id}/ws")
async def websocket_endpoint(websocket: WebSocket, workspace_id: str, token: str = Query(default="")) -> None:
    if not token:
        await websocket.close(code=1008, reason="Workspace token required")
        return
    try:
        resolved_workspace_id = resolve_workspace_for_token(token)
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
