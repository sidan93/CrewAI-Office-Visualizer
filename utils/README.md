# MCP quick setup

Use these templates to connect this project as an MCP server from other projects.

## 1) Copy templates

Copy `utils/mcp.config.example.json` and `utils/.env.mcp.example` into your target project.

## 2) Set environment variables

- `OFFICE_VISUALIZER_MCP_URL` - MCP endpoint URL.
- `OFFICE_VISUALIZER_MCP_TOKEN` - token value only if auth is enabled on your side.

Default local value:

```bash
OFFICE_VISUALIZER_MCP_URL=http://127.0.0.1:18765
```

## 3) Wire the config in your MCP client

Point your MCP-capable client/tooling to the copied `mcp.config.json` and load environment variables.

## Notes

- This folder intentionally contains only connection templates.
- API smoke checks and debug calls stay in `tests/`.
