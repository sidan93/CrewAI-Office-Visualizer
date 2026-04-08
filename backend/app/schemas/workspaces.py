from pydantic import BaseModel, Field


class CreateWorkspaceRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200, description="Optional workspace display name.")


class CreateWorkspaceResponse(BaseModel):
    workspace_id: str = Field(..., description="Workspace id to use in API routes.", examples=["ws_a12bc34d56ef"])
    token: str = Field(..., description="Workspace write/read token. Returned once.", examples=["wst_..."])
