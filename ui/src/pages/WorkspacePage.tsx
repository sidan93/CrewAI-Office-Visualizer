import { useEffect, useMemo, useState } from 'react'
import { OfficeCanvas } from '../OfficeCanvas'
import { loadWorkspaceToken, saveWorkspaceToken } from '../workspaceApi'

type WorkspacePageProps = {
  workspaceId: string
  onBackHome: () => void
}

export function WorkspacePage({ workspaceId, onBackHome }: WorkspacePageProps) {
  const [manualToken, setManualToken] = useState('')
  const [tokenSaved, setTokenSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    const params = new URLSearchParams(window.location.search)
    const tokenFromQuery = params.get('token')?.trim()
    if (!tokenFromQuery) return
    saveWorkspaceToken(workspaceId, tokenFromQuery)
    setTokenSaved(String(Date.now()))
  }, [workspaceId])

  const token = useMemo(() => {
    if (!workspaceId) return null
    return loadWorkspaceToken(workspaceId)
  }, [workspaceId, tokenSaved])

  if (!token) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 p-4 text-slate-100">
        <h1 className="text-xl font-semibold">Workspace {workspaceId}</h1>
        <p className="text-sm text-slate-300">
          Token is required for WebSocket connection. Paste workspace token below.
        </p>
        <input
          value={manualToken}
          onChange={(event) => setManualToken(event.target.value)}
          className="rounded border border-[#3d4566] bg-[#0f1424] px-3 py-2 text-sm"
          placeholder="wst_..."
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!manualToken.trim()) return
              saveWorkspaceToken(workspaceId, manualToken.trim())
              setTokenSaved(String(Date.now()))
            }}
            className="rounded bg-indigo-500 px-3 py-2 text-sm font-medium text-white"
          >
            Save token
          </button>
          <button
            type="button"
            onClick={onBackHome}
            className="rounded border border-[#3d4566] px-3 py-2 text-sm"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between border-b border-[#3d4566] px-4 py-2 text-xs text-slate-300">
        <span>
          Workspace: <span className="font-mono">{workspaceId}</span>
        </span>
        <button type="button" onClick={onBackHome} className="text-indigo-300 underline">
          Create another workspace
        </button>
      </div>
      <OfficeCanvas workspaceId={workspaceId} workspaceToken={token} />
    </div>
  )
}
