import hashlib
import secrets
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import WorkspaceToken


def issue_workspace_token() -> str:
    return f"wst_{secrets.token_urlsafe(32)}"


def hash_workspace_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def resolve_workspace_from_token(db: Session, token: str) -> str:
    token_hash = hash_workspace_token(token)
    record = db.scalar(
        select(WorkspaceToken).where(
            WorkspaceToken.token_hash == token_hash, WorkspaceToken.revoked_at.is_(None)
        )
    )
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid workspace token")
    record.last_used_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()
    return record.workspace_id
