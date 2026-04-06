import { useEffect, useState } from 'react'
import { HomePage } from './pages/HomePage'
import { WorkspacePage } from './pages/WorkspacePage'

function parseWorkspacePath(pathname: string): string | null {
  const match = pathname.match(/^\/w\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigateTo = (path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
      setPathname(path)
    }
  }

  const workspaceId = parseWorkspacePath(pathname)

  return (
    <div className="flex h-full min-h-screen flex-col bg-[#0f0f18]">
      {pathname === '/' ? (
        <HomePage onOpenWorkspace={(id) => navigateTo(`/w/${encodeURIComponent(id)}`)} />
      ) : workspaceId ? (
        <WorkspacePage workspaceId={workspaceId} onBackHome={() => navigateTo('/')} />
      ) : (
        <HomePage onOpenWorkspace={(id) => navigateTo(`/w/${encodeURIComponent(id)}`)} />
      )}
    </div>
  )
}

export default App
