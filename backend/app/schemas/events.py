from enum import Enum
from pydantic import BaseModel, Field


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
