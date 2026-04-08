import uuid
from app.db import SessionLocal
from app.models import Workspace, WorkspaceToken
from app.schemas.workspaces import CreateWorkspaceResponse
from app.security import hash_workspace_token, issue_workspace_token


def create_workspace(name: str | None) -> CreateWorkspaceResponse:
    workspace_id = f"ws_{uuid.uuid4().hex[:12]}"
    raw_token = issue_workspace_token()
    with SessionLocal() as db:
        workspace = Workspace(id=workspace_id, name=name)
        token_record = WorkspaceToken(workspace_id=workspace_id, token_hash=hash_workspace_token(raw_token))
        db.add(workspace)
        db.add(token_record)
        db.commit()
    return CreateWorkspaceResponse(workspace_id=workspace_id, token=raw_token)
