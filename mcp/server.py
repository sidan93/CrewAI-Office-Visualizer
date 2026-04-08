import os
from datetime import datetime, timezone

import httpx
from mcp.server.fastmcp import FastMCP


HOST = os.getenv("MCP_HOST", "0.0.0.0")
PORT = int(os.getenv("MCP_PORT", "18900"))
MCP_PATH = os.getenv("MCP_PATH", "/mcp")
OFFICE_UI_BASE_URL = os.getenv("OFFICE_UI_BASE_URL", "http://localhost:17300").rstrip("/")
OFFICE_VISUALIZER_API_URL = os.getenv("OFFICE_VISUALIZER_API_URL", "http://backend:8000").rstrip("/")
OFFICE_VISUALIZER_HTTP_TIMEOUT = float(os.getenv("OFFICE_VISUALIZER_HTTP_TIMEOUT", "10"))

mcp = FastMCP(
    "office-visualizer-http",
    host=HOST,
    port=PORT,
    streamable_http_path=MCP_PATH,
)

@mcp.tool()
def send_event(
    workspace_id: str,
    workspace_token: str,
    agent: str,
    action: str,
    message: str = "",
) -> dict:
    workspace_id = workspace_id.strip()
    workspace_token = workspace_token.strip()
    agent = agent.strip()
    action = action.strip()

    if not workspace_id:
        raise ValueError("workspace_id is required")
    if not workspace_token:
        raise ValueError("workspace_token is required")
    if not agent:
        raise ValueError("agent is required")
    if not action:
        raise ValueError("action is required")

    url = f"{OFFICE_VISUALIZER_API_URL}/w/{workspace_id}/event"
    headers = {"Authorization": f"Bearer {workspace_token}"}
    payload = {"agent": agent, "action": action, "message": message}

    with httpx.Client(timeout=OFFICE_VISUALIZER_HTTP_TIMEOUT) as client:
        response = client.post(url, headers=headers, json=payload)

    return {
        "request_url": url,
        "status_code": response.status_code,
        "ok": response.is_success,
        "response_text": response.text,
    }


if __name__ == "__main__":
    mcp.run(transport="streamable-http")