# API Contract

## Overview

The API is workspace-scoped. Every write or stream operation is tied to a single workspace:

- create workspace: `POST /workspaces`
- send event: `POST /w/{workspace_id}/event` (requires Bearer token)
- stream updates: `GET /w/{workspace_id}/ws?token=...` (requires workspace token)

Terminology:

- Canonical API name: `workspace_id`
- Integration alias (optional): `project_id` (same value, different name in client config)

## Create workspace

`POST /workspaces`

Request:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | no | Optional workspace display name. |

Response:

| Field | Type | Description |
|-------|------|-------------|
| `workspace_id` | string | Workspace id for URL path (`/w/{workspace_id}`). |
| `token` | string | Workspace token. Returned only once. |

If your integration stores this id as `project_id`, pass that same value to the `{workspace_id}` path segment.

Example:

```bash
curl -sS -X POST http://127.0.0.1:18765/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"Team Alpha"}'
```

## Event endpoint

`POST /w/{workspace_id}/event`

Headers:

- `Authorization: Bearer <workspace_token>`
- `Content-Type: application/json`

Payload:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `agent` | string | yes | Agent id / display key. |
| `action` | enum | yes | Strict enum value. |
| `message` | string | no | Optional extra detail. |

Allowed `action` values:

- `REGISTERED`
- `IDLE`
- `MEETING`
- `WORKING`

Validation notes:

- Invalid or missing token: `401`
- Token from another workspace: `403`
- Invalid action enum: `422`

Example:

```bash
curl -sS -X POST "http://127.0.0.1:18765/w/${WORKSPACE_ID}/event" \
  -H "Authorization: Bearer ${WORKSPACE_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","action":"WORKING","message":"Preparing report"}'
```

## Realtime stream

`GET /w/{workspace_id}/ws?token=<workspace_token>`

The stream sends:

- initial snapshot:
  - `{"type":"snapshot","workspace_id":"...","agents":[...]}`
- subsequent events:
  - `{"type":"event","workspace_id":"...","agent":"...","action":"...","message":"...","load":{...}}`

If token is invalid or does not match path workspace, server closes connection with policy violation.
