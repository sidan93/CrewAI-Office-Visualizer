from fastapi import HTTPException, status
from app.db import SessionLocal
from app.security import resolve_workspace_from_token


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization Bearer token is required",
        )
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization header")
    return token


def resolve_workspace_for_token(token: str) -> str:
    with SessionLocal() as db:
        return resolve_workspace_from_token(db, token)


def ensure_workspace_access(workspace_id: str, token: str) -> None:
    resolved_workspace_id = resolve_workspace_for_token(token)
    if resolved_workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token does not match workspace")
