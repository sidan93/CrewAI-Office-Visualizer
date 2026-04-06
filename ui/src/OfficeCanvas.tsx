import { useEffect, useRef, useState } from 'react'
import { getWsUrl } from './wsUrl'
import officeMapUrl from './assets/maps/01_office.png'
import officeMapDataUrl from './assets/maps/01_offfice.json?url'
import {
  createCharacterState,
  drawCharacter,
  hashAgentColor,
  type CharacterState,
  updateCharacterState,
} from './agentSprites'
import {
  type OccupiedPos,
  isRestAction,
  type OfficeMapData,
  resolveOfficeMove,
  resolveTargetZone,
  type TargetZone,
} from './resolveOfficeMove'

type OfficeEventPayload = {
  type?: 'event'
  agent: string
  action: string
  message?: string
}

type OfficeSnapshotPayload = {
  type: 'snapshot'
  agents: OfficeEventPayload[]
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
  isResting: boolean
  targetZone: TargetZone
  character: CharacterState
  action?: string
  message?: string
}

type UiEvent = {
  id: number
  ts: number
  title: string
  details?: string
}

const MOVE_MS = 1200
const MAX_EVENTS = 80

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  agents: Map<string, AgentVisual>,
  mapImage: HTMLImageElement | null,
  mapAspectRatio: number,
  now: number,
) {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#12192b'
  ctx.fillRect(0, 0, w, h)

  const canvasAspect = w / h
  let drawW = w
  let drawH = h
  if (canvasAspect > mapAspectRatio) {
    drawW = h * mapAspectRatio
  } else {
    drawH = w / mapAspectRatio
  }
  const drawX = (w - drawW) / 2
  const drawY = (h - drawH) / 2

  if (mapImage) {
    ctx.drawImage(mapImage, drawX, drawY, drawW, drawH)
  } else {
    ctx.fillStyle = '#1a1c2e'
    ctx.fillRect(drawX, drawY, drawW, drawH)
  }

  ctx.strokeStyle = '#3d4566'
  ctx.lineWidth = 2
  ctx.strokeRect(drawX, drawY, drawW, drawH)

  const step = 32
  ctx.strokeStyle = '#2a314866'
  ctx.lineWidth = 1
  for (let x = drawX; x <= drawX + drawW; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, drawY)
    ctx.lineTo(x, drawY + drawH)
    ctx.stroke()
  }
  for (let y = drawY; y <= drawY + drawH; y += step) {
    ctx.beginPath()
    ctx.moveTo(drawX, y)
    ctx.lineTo(drawX + drawW, y)
    ctx.stroke()
  }

  agents.forEach((a) => {
    drawCharacter({
      ctx,
      name: a.name,
      cx: a.cx,
      cy: a.cy,
      color: a.color,
      state: a.character,
      now,
      drawX,
      drawY,
      drawW,
      drawH,
    })
  })
}

export function OfficeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const agentsRef = useRef<Map<string, AgentVisual>>(new Map())
  const mapImageRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number>(0)
  const eventSeqRef = useRef(0)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [lastError, setLastError] = useState<string | null>(null)
  const [mapData, setMapData] = useState<OfficeMapData | null>(null)
  const [isEventsPanelOpen, setIsEventsPanelOpen] = useState(false)
  const [isAgentsPanelOpen, setIsAgentsPanelOpen] = useState(false)
  const [recentEvents, setRecentEvents] = useState<UiEvent[]>([])

  const pushEvent = (title: string, details?: string) => {
    eventSeqRef.current += 1
    const next: UiEvent = {
      id: eventSeqRef.current,
      ts: Date.now(),
      title,
      details,
    }
    setRecentEvents((prev) => [next, ...prev].slice(0, MAX_EVENTS))
  }

  const collectOccupied = (movingAgent: string): {
    work: OccupiedPos[]
    relax: OccupiedPos[]
    meeting: OccupiedPos[]
  } => {
    const work: OccupiedPos[] = []
    const relax: OccupiedPos[] = []
    const meeting: OccupiedPos[] = []
    agentsRef.current.forEach((agent) => {
      if (agent.name === movingAgent) return
      const p = { x: agent.tx, y: agent.ty }
      if (agent.targetZone === 'relax') relax.push(p)
      else if (agent.targetZone === 'meeting') meeting.push(p)
      else work.push(p)
    })
    return { work, relax, meeting }
  }

  const applyOfficeEvent = (data: OfficeEventPayload) => {
    const m = agentsRef.current
    const prev = m.get(data.agent)
    const prevPos = prev ? { cx: prev.cx, cy: prev.cy } : undefined
    const occupied = collectOccupied(data.agent)
    const { nx, ny, tx, ty } = resolveOfficeMove(
      data.agent,
      data.action,
      prevPos,
      mapData,
      occupied,
    )
    const entry: AgentVisual = {
      name: data.agent,
      nx,
      ny,
      cx: nx,
      cy: ny,
      tx,
      ty,
      moveStart: performance.now(),
      color: prev?.color ?? hashAgentColor(data.agent),
      isResting: isRestAction(data.action),
      targetZone: resolveTargetZone(data.action),
      character: prev?.character ?? createCharacterState(data.agent, performance.now()),
      action: data.action,
      message: data.message,
    }
    m.set(data.agent, entry)
  }

  useEffect(() => {
    const img = new Image()
    img.src = officeMapUrl
    img.onload = () => {
      mapImageRef.current = img
    }
    return () => {
      mapImageRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadMapData = async () => {
      try {
        const res = await fetch(officeMapDataUrl)
        if (!res.ok) return
        const data = (await res.json()) as OfficeMapData
        if (!cancelled) setMapData(data)
      } catch {
        /* ignore */
      }
    }
    void loadMapData()
    return () => {
      cancelled = true
    }
  }, [])

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
        const prevCx = a.cx
        const prevCy = a.cy
        const t = Math.min(1, (now - a.moveStart) / MOVE_MS)
        a.cx = a.nx + (a.tx - a.nx) * t
        a.cy = a.ny + (a.ty - a.ny) * t
        a.character = updateCharacterState({
          state: a.character,
          now,
          dx: a.cx - prevCx,
          dy: a.cy - prevCy,
          isResting: a.isResting,
        })
      })

      const mapW = mapData?.map_metadata?.resolution?.width ?? 2752
      const mapH = mapData?.map_metadata?.resolution?.height ?? 1536
      const mapAspectRatio = mapW / mapH

      drawScene(
        ctx,
        cssW,
        cssH,
        agentsRef.current,
        mapImageRef.current,
        mapAspectRatio,
        now,
      )
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const url = getWsUrl()
    const ws = new WebSocket(url)

    ws.onopen = () => {
      setStatus('open')
      setLastError(null)
      pushEvent('WS:open', `Connected to ${url}`)
    }
    ws.onclose = () => {
      setStatus('closed')
      pushEvent('WS:close')
    }
    ws.onerror = () => {
      setLastError('WebSocket error')
      setStatus('closed')
      pushEvent('WS:error', 'WebSocket error')
    }
    ws.onmessage = (ev) => {
      try {
        const raw = JSON.parse(ev.data) as OfficeEventPayload | OfficeSnapshotPayload
        if (raw && raw.type === 'snapshot') {
          for (const event of raw.agents) {
            if (
              typeof event?.agent === 'string' &&
              typeof event?.action === 'string'
            ) {
              applyOfficeEvent(event)
            }
          }
          pushEvent('snapshot:loaded', `${raw.agents.length} agents restored`)
          return
        }

        const data = raw as OfficeEventPayload
        if (typeof data.agent !== 'string' || typeof data.action !== 'string') {
          return
        }
        applyOfficeEvent(data)
        pushEvent(
          `event:${data.agent}`,
          `${data.action}${data.message ? ` • ${data.message}` : ''}`,
        )
      } catch {
        pushEvent('event:invalid', 'Invalid JSON payload')
      }
    }

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
      ws.close()
    }
  }, [mapData])

  const statusColor =
    status === 'open' ? 'text-emerald-400' : 'text-amber-300'
  const agentsList = Array.from(agentsRef.current.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed tracking-wide">
        <button
          type="button"
          onClick={() => setIsAgentsPanelOpen((v) => !v)}
          className="text-[11px] text-sky-300 underline decoration-dotted underline-offset-4 hover:text-sky-200"
          title="Toggle agents panel"
        >
          Office map
        </button>
        <button
          type="button"
          onClick={() => setIsEventsPanelOpen((v) => !v)}
          className={`${statusColor} rounded border border-[#3d4566] bg-[#1a1c2e] px-2 py-1 hover:bg-[#242a3f]`}
          title="Toggle events panel"
        >
          WS: {status}
          {lastError ? ` — ${lastError}` : ''}
        </button>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded border-2 border-[#3d4566] bg-[#1a1c2e] shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <aside
          className={`absolute bottom-0 left-0 top-0 z-10 w-[300px] border-r border-[#3d4566] bg-[#141a2be6] p-2 transition-transform duration-200 ${isAgentsPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] tracking-wide text-sky-300">Agents now</p>
            <button
              type="button"
              onClick={() => setIsAgentsPanelOpen(false)}
              className="rounded border border-[#3d4566] px-1 py-[2px] text-[9px] text-slate-300 hover:bg-[#242a3f]"
            >
              close
            </button>
          </div>
          <div className="h-full overflow-y-auto pr-1">
            {agentsList.length === 0 ? (
              <p className="text-[9px] text-[#8b93b8]">No agents yet</p>
            ) : (
              agentsList.map((agent) => (
                <div
                  key={agent.name}
                  className="mb-1 rounded border border-[#2d3552] bg-[#1a1f33] p-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-sm border border-[#0f0f18]"
                      style={{ backgroundColor: agent.color }}
                    />
                    <p className="text-[9px] text-emerald-300">{agent.name}</p>
                  </div>
                  <p className="mt-[2px] text-[8px] text-slate-200">
                    {agent.action ?? 'waiting'}
                  </p>
                  {agent.message ? (
                    <p className="text-[8px] text-[#8b93b8]">{agent.message}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </aside>
        <aside
          className={`absolute bottom-0 right-0 top-0 z-10 w-[300px] border-l border-[#3d4566] bg-[#141a2be6] p-2 transition-transform duration-200 ${isEventsPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] tracking-wide text-sky-300">Last events</p>
            <button
              type="button"
              onClick={() => setIsEventsPanelOpen(false)}
              className="rounded border border-[#3d4566] px-1 py-[2px] text-[9px] text-slate-300 hover:bg-[#242a3f]"
            >
              close
            </button>
          </div>
          <div className="h-full overflow-y-auto pr-1">
            {recentEvents.length === 0 ? (
              <p className="text-[9px] text-[#8b93b8]">No events yet</p>
            ) : (
              recentEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="mb-1 rounded border border-[#2d3552] bg-[#1a1f33] p-1"
                >
                  <p className="text-[9px] text-emerald-300">{evt.title}</p>
                  {evt.details ? (
                    <p className="text-[8px] text-slate-300">{evt.details}</p>
                  ) : null}
                  <p className="text-[8px] text-[#8b93b8]">
                    {new Date(evt.ts).toLocaleTimeString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
      <p className="text-[8px] leading-relaxed text-[#8b93b8]">
        POST <span className="text-slate-300">agent</span> +{' '}
        <span className="text-slate-300">action</span> to /event — positions
        come from map zones (first visit: entrance → desk; idle/end → break
        area).
        {mapData?.zones
          ? ` Zones: ${Object.keys(mapData.zones).length}.`
          : ''}
      </p>
    </div>
  )
}
