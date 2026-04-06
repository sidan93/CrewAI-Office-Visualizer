# API Contract

## Event endpoint

`POST /event`

Minimal JSON payload:

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

Any other value returns HTTP `422`.

## Example request

```bash
curl -sS -X POST http://127.0.0.1:18765/event \
  -H 'Content-Type: application/json' \
  -d '{"agent":"demo","action":"WORKING","message":"Preparing report"}'
```

## Realtime stream

`GET /ws` (WebSocket) provides live event updates for the UI.
