import { useEffect, useRef, useState } from 'react'
import { getWsUrl } from './wsUrl'

type OfficeEventPayload = {
  agent: string
  x: number
  y: number
  action?: string
  message?: string
}

type AgentVisual = {
  name: string
  nx: number
  ny: number
  cx: number
  cy: number
  tx: number
  ty: number
  moveStart: number
  color: string
  action?: string
  message?: string
}

const MOVE_MS = 320
const AGENT_SIZE = 14

function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return `hsl(${hue} 70% 55%)`
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  agents: Map<string, AgentVisual>,
) {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#1a1c2e'
  ctx.fillRect(0, 0, w, h)

  const zW = w / 3
  const labels = ['Research', 'Dev', 'QA']
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 ? '#252840' : '#22263a'
    ctx.fillRect(i * zW, 0, zW, h)
    ctx.strokeStyle = '#3d4566'
    ctx.lineWidth = 2
    ctx.strokeRect(i * zW + 4, 4, zW - 8, h - 8)
    ctx.fillStyle = '#6b7399'
    ctx.font = '10px "Press Start 2P", monospace'
    ctx.fillText(labels[i], i * zW + 16, 28)
  }

  const step = 32
  ctx.strokeStyle = '#2a3148'
  ctx.lineWidth = 1
  for (let x = 0; x <= w; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y <= h; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  agents.forEach((a) => {
    const px = a.cx * w - AGENT_SIZE / 2
    const py = a.cy * h - AGENT_SIZE / 2
    ctx.fillStyle = a.color
    ctx.fillRect(px, py, AGENT_SIZE, AGENT_SIZE)
    ctx.strokeStyle = '#0f0f18'
    ctx.lineWidth = 2
    ctx.strokeRect(px, py, AGENT_SIZE, AGENT_SIZE)
    const label = a.action ?? a.name
    ctx.fillStyle = '#e8ecff'
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.fillText(label.slice(0, 12), px, py - 6)
  })
}

export function OfficeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<Map<string, AgentVisual>>(new Map())
  const rafRef = useRef<number>(0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const parent = canvas.parentElement
      const cw = parent?.clientWidth ?? 640
      const ch = parent?.clientHeight ?? 400
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const tick = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
      const cssW = canvas.width / dpr
      const cssH = canvas.height / dpr

      agentsRef.current.forEach((a) => {
        const t = Math.min(1, (now - a.moveStart) / MOVE_MS)
        a.cx = a.nx + (a.tx - a.nx) * t
        a.cy = a.ny + (a.ty - a.ny) * t
      })

      drawScene(ctx, cssW, cssH, agentsRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const url = getWsUrl()
    const ws = new WebSocket(url)

    ws.onopen = () => {
      setStatus('open')
      setLastError(null)
    }
    ws.onclose = () => setStatus('closed')
    ws.onerror = () => {
      setLastError('WebSocket error')
      setStatus('closed')
    }
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as OfficeEventPayload
        if (
          typeof data.agent !== 'string' ||
          typeof data.x !== 'number' ||
          typeof data.y !== 'number'
        ) {
          return
        }
        const m = agentsRef.current
        const prev = m.get(data.agent)
        const nx = prev?.cx ?? data.x
        const ny = prev?.cy ?? data.y
        const entry: AgentVisual = {
          name: data.agent,
          nx,
          ny,
          cx: nx,
          cy: ny,
          tx: data.x,
          ty: data.y,
          moveStart: performance.now(),
          color: prev?.color ?? hashColor(data.agent),
          action: data.action,
          message: data.message,
        }
        m.set(data.agent, entry)
      } catch {
        /* ignore */
      }
    }

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      ws.close()
    }
  }, [])

  const statusColor =
    status === 'open' ? 'text-emerald-400' : 'text-amber-300'

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed tracking-wide">
        <h1 className="text-[11px] text-sky-300">Office map</h1>
        <span className={statusColor}>
          WS: {status}
          {lastError ? ` — ${lastError}` : ''}
        </span>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded border-2 border-[#3d4566] bg-[#1a1c2e] shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]">
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      <p className="text-[8px] leading-relaxed text-[#8b93b8]">
        POST events to <span className="text-slate-300">/event</span> — agents
        move on the grid.
      </p>
    </div>
  )
}
