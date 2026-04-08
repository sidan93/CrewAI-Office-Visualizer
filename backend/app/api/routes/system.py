from fastapi import APIRouter
from app.schemas.events import HealthResponse

router = APIRouter(
    tags=["system"],
)


@router.get(
    "/health",
    summary="Health check",
    description="Simple liveness endpoint for smoke tests and monitoring.",
    response_model=HealthResponse,
)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
