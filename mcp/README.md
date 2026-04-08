# MCP server for CrewAI Office Visualizer

Standalone MCP server over HTTP (`streamable-http`) for Cursor and other MCP clients.

## Prerequisites

- Docker and Docker Compose installed.
- Backend service available (in this repo it is provided by `docker compose`).

## Start with Docker Compose

From project root:

```bash
docker compose up -d --build mcp
```

MCP endpoint:

`http://127.0.0.1:18900/mcp`

## Quick check

After startup, verify that the container is healthy:

```bash
docker compose ps mcp
```

Then call a simple tool (for example from Cursor after MCP is connected):

- `ping` -> `pong`
- `now` -> current UTC timestamp

## Available tools

- `ping` - returns `pong`.
- `now` - returns current UTC time (ISO).
- `workspace_link(workspace_id)` - builds UI URL.
- `send_event(workspace_id, workspace_token, agent, action, message?)` - sends event to backend.

## Environment variables

- `MCP_HOST` (default `0.0.0.0`)
- `MCP_PORT` (default `18900`)
- `MCP_PATH` (default `/mcp`)
- `OFFICE_VISUALIZER_API_URL` (default `http://backend:8000`)
- `OFFICE_UI_BASE_URL` (default `http://localhost:17300`)
- `OFFICE_VISUALIZER_HTTP_TIMEOUT` (default `10`)

## Cursor config (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "office-visualizer-http": {
      "transport": "streamable-http",
      "url": "http://127.0.0.1:18900/mcp"
    }
  }
}
```

## Example `send_event` call

Use `send_event(workspace_id, workspace_token, agent, action, message?)` to publish an agent event to backend.

Example values:

- `workspace_id`: `ws_98e3e503b0b6`
- `workspace_token`: `wst_DQlN-SJK56FEV8i4q0zfnSSLVU897NLRfGG8nWRmHkE`
- `agent`: `andrey`
- `action`: `WORKING`
- `message`: optional free-text comment

## Troubleshooting

- If MCP cannot connect from Cursor, verify the endpoint is reachable: `http://127.0.0.1:18900/mcp`.
- If `send_event` fails with `401/403`, re-check `workspace_id` and `workspace_token`.
- If requests time out, increase `OFFICE_VISUALIZER_HTTP_TIMEOUT` and restart the `mcp` service.
