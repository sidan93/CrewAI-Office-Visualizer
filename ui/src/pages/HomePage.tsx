import { useState, type FormEvent } from 'react'
import { createWorkspace, saveWorkspaceToken, type CreateWorkspaceResponse } from '../workspaceApi'

type HomePageProps = {
  onOpenWorkspace: (workspaceId: string) => void
}

export function HomePage({ onOpenWorkspace }: HomePageProps) {
  const [workspaceName, setWorkspaceName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreateWorkspaceResponse | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    setCopyStatus(null)
    try {
      const result = await createWorkspace(workspaceName.trim() || undefined)
      saveWorkspaceToken(result.workspace_id, result.token)
      setCreated(result)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  const onCopyToken = async () => {
    if (!created?.token) return
    try {
      await navigator.clipboard.writeText(created.token)
      setCopyStatus('Token copied')
    } catch {
      setCopyStatus('Clipboard blocked, copy token manually')
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-4 text-slate-100">
      <h1 className="text-2xl font-semibold">CrewAI Office Workspaces</h1>
      <p className="text-sm text-slate-300">
        Create a workspace and use its token for API writes. This keeps events isolated per team.
      </p>
      <form onSubmit={onSubmit} className="rounded border border-[#3d4566] bg-[#1a1c2e] p-4">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
          Workspace name (optional)
        </label>
        <input
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
          className="mb-3 w-full rounded border border-[#3d4566] bg-[#0f1424] px-3 py-2 text-sm"
          placeholder="Team Alpha"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-70"
        >
          {isLoading ? 'Creating...' : 'Create workspace'}
        </button>
        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </form>

      {created ? (
        <div className="rounded border border-emerald-600/40 bg-[#0f1b22] p-4">
          <p className="text-sm">
            Workspace: <span className="font-mono">{created.workspace_id}</span>
          </p>
          <p className="mt-2 text-xs text-amber-200">Token is shown once. Save it now.</p>
          <textarea
            readOnly
            value={created.token}
            className="mt-2 h-20 w-full rounded border border-[#3d4566] bg-[#0b1020] p-2 font-mono text-xs"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void onCopyToken()}
              className="rounded border border-[#3d4566] px-3 py-1 text-xs"
            >
              Copy token
            </button>
            <button
              type="button"
              onClick={() => onOpenWorkspace(created.workspace_id)}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
            >
              Open workspace
            </button>
          </div>
          {copyStatus ? <p className="mt-2 text-xs text-slate-300">{copyStatus}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
