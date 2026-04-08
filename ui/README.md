# UI (`ui/`)

Frontend for CrewAI Office Visualizer.

Built with React, TypeScript, Vite, and Tailwind CSS.

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+

## Install

```bash
npm install
```

## Run in development

```bash
npm run dev
```

By default Vite starts at `http://localhost:5173`.

In dev mode, API and WebSocket requests are proxied to the backend through `vite.config.ts`:

- `/workspaces`
- `/w` (including WebSocket upgrade)
- `/health`

Default proxy target is `http://127.0.0.1:8000`.

## Build and preview

```bash
npm run build
npm run preview
```

## Environment variables

The UI supports optional Vite environment variables:

- `VITE_API_URL` - HTTP base URL for API calls (for example `http://localhost:18765`)
- `VITE_WS_URL` - WebSocket base URL (for example `ws://localhost:18765`)

Behavior summary:

- **Development (`npm run dev`)**: uses relative API paths and same-origin WebSocket path via Vite dev server.
- **Production build**:
  - if `VITE_API_URL`/`VITE_WS_URL` are set, they are used;
  - otherwise falls back to current host with default backend port `18765`.

## Lint

```bash
npm run lint
```

## Notes

- Workspace tokens are stored in browser `localStorage` per workspace.
- Main project docs and Docker quick start are in the repository root `README.md`.
