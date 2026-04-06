/** WebSocket URL: VITE_WS_URL in Docker build, else Vite dev proxy or host:18765 (compose default). */
const DEFAULT_HOST_WS_PORT = 18765

export function getWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined
  if (env) return env
  if (import.meta.env.DEV) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/ws`
  }
  return `ws://${location.hostname}:${DEFAULT_HOST_WS_PORT}/ws`
}
