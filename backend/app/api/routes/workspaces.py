from fastapi import APIRouter
from app.schemas.workspaces import CreateWorkspaceRequest, CreateWorkspaceResponse
from app.services.workspaces import create_workspace

router = APIRouter(
    tags=["workspaces"],
)


@router.post(
    "/workspaces",
    summary="Create workspace",
    description="Creates a workspace and returns workspace token once.",
    response_model=CreateWorkspaceResponse,
)
def create_workspace_route(payload: CreateWorkspaceRequest) -> CreateWorkspaceResponse:
    return create_workspace(payload.name)
