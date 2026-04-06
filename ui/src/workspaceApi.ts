export type CreateWorkspaceResponse = {
  workspace_id: string
  token: string
}

const DEFAULT_HOST_API_PORT = 18765

function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env) return env
  if (import.meta.env.DEV) return ''
  return `http://${location.hostname}:${DEFAULT_HOST_API_PORT}`
}

export async function createWorkspace(name?: string): Promise<CreateWorkspaceResponse> {
  const response = await fetch(`${getApiBaseUrl()}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) {
    throw new Error(`Create workspace failed (${response.status})`)
  }
  return (await response.json()) as CreateWorkspaceResponse
}

export function getWorkspaceTokenStorageKey(workspaceId: string): string {
  return `workspaceToken:${workspaceId}`
}

export function saveWorkspaceToken(workspaceId: string, token: string): void {
  localStorage.setItem(getWorkspaceTokenStorageKey(workspaceId), token)
}

export function loadWorkspaceToken(workspaceId: string): string | null {
  return localStorage.getItem(getWorkspaceTokenStorageKey(workspaceId))
}

export function getWorkspaceWsUrl(workspaceId: string, token: string): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  if (import.meta.env.DEV) {
    const safeWorkspaceId = encodeURIComponent(workspaceId)
    const safeToken = encodeURIComponent(token)
    return `${proto}//${location.host}/w/${safeWorkspaceId}/ws?token=${safeToken}`
  }
  const envWs = import.meta.env.VITE_WS_URL as string | undefined
  if (envWs) {
    const base = envWs.replace(/\/$/, '')
    const safeWorkspaceId = encodeURIComponent(workspaceId)
    const safeToken = encodeURIComponent(token)
    return `${base}/w/${safeWorkspaceId}/ws?token=${safeToken}`
  }
  const safeWorkspaceId = encodeURIComponent(workspaceId)
  const safeToken = encodeURIComponent(token)
  return `ws://${location.hostname}:${DEFAULT_HOST_API_PORT}/w/${safeWorkspaceId}/ws?token=${safeToken}`
}
