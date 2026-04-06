import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

type ZoneLike = {
  center?: { x: number; y: number }
  door_way?: { x: number; y: number }
  seats?: Array<{ id?: string; x: number; y: number }>
}

type EditablePointKind = 'center' | 'door_way' | 'seat'
type EditablePoint = {
  id: string
  label: string
  x: number
  y: number
  color: string
  kind: EditablePointKind
}

type MapViewport = {
  drawX: number
  drawY: number
  drawW: number
  drawH: number
  mapW: number
  mapH: number
}

const MOVE_MS = 1200
const MAX_EVENTS = 80

function extractAutoIdleRoamSalt(message?: string): string | undefined {
  if (!message) return undefined
  const prefix = 'auto-idle-roam:'
  if (!message.startsWith(prefix)) return undefined
  const salt = message.slice(prefix.length).trim()
  return salt.length > 0 ? salt : undefined
}

function getViewport(
  w: number,
  h: number,
  mapAspectRatio: number,
  mapW: number,
  mapH: number,
): MapViewport {
  const canvasAspect = w / h
  let drawW = w
  let drawH = h
  if (canvasAspect > mapAspectRatio) {
    drawW = h * mapAspectRatio
  } else {
    drawH = w / mapAspectRatio
  }
  return {
    drawX: (w - drawW) / 2,
    drawY: (h - drawH) / 2,
    drawW,
    drawH,
    mapW,
    mapH,
  }
}

function pointToCanvas(viewport: MapViewport, x: number, y: number) {
  return {
    px: viewport.drawX + (x / viewport.mapW) * viewport.drawW,
    py: viewport.drawY + (y / viewport.mapH) * viewport.drawH,
  }
}

function buildEditablePoints(mapData: OfficeMapData | null): EditablePoint[] {
  const zones = (mapData?.zones ?? {}) as Record<string, ZoneLike>
  const points: EditablePoint[] = []
  Object.entries(zones).forEach(([zoneKey, zone]) => {
    if (zone.center) {
      points.push({
        id: `${zoneKey}::center`,
        label: `${zoneKey}.center`,
        x: zone.center.x,
        y: zone.center.y,
        color: '#f59e0b',
        kind: 'center',
      })
    }
    if (zone.door_way) {
      points.push({
        id: `${zoneKey}::door_way`,
        label: `${zoneKey}.door`,
        x: zone.door_way.x,
        y: zone.door_way.y,
        color: '#38bdf8',
        kind: 'door_way',
      })
    }
    zone.seats?.forEach((seat, idx) => {
      points.push({
        id: `${zoneKey}::seat::${idx}`,
        label: `${zoneKey}.seat:${seat.id ?? idx + 1}`,
        x: seat.x,
        y: seat.y,
        color: '#34d399',
        kind: 'seat',
      })
    })
  })
  return points
}

function updateDraftPoint(
  mapData: OfficeMapData | null,
  pointId: string,
  x: number,
  y: number,
): OfficeMapData | null {
  if (!mapData?.zones) return mapData
  const [zoneKey, kind, idxRaw] = pointId.split('::')
  const zones = mapData.zones as Record<string, ZoneLike>
  const zone = zones[zoneKey]
  if (!zone) return mapData

  const next = structuredClone(mapData) as OfficeMapData
  const nextZones = next.zones as Record<string, ZoneLike>
  const nextZone = nextZones[zoneKey]
  if (!nextZone) return mapData

  const nx = Math.round(x)
  const ny = Math.round(y)
  if (kind === 'center' && nextZone.center) {
    nextZone.center = { x: nx, y: ny }
    return next
  }
  if (kind === 'door_way' && nextZone.door_way) {
    nextZone.door_way = { x: nx, y: ny }
    return next
  }
  if (kind === 'seat' && nextZone.seats) {
    const seatIdx = Number(idxRaw)
    if (Number.isFinite(seatIdx) && seatIdx >= 0 && seatIdx < nextZone.seats.length) {
      nextZone.seats[seatIdx] = { ...nextZone.seats[seatIdx], x: nx, y: ny }
      return next
    }
  }
  return mapData
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  agents: Map<string, AgentVisual>,
  mapImage: HTMLImageElement | null,
  mapAspectRatio: number,
  mapData: OfficeMapData | null,
  editablePoints: EditablePoint[],
  selectedPointId: string | null,
  draggingPointId: string | null,
  debugPlaces: boolean,
  editPlaces: boolean,
  now: number,
): MapViewport {
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#12192b'
  ctx.fillRect(0, 0, w, h)

  const mapW = mapData?.map_metadata?.resolution?.width ?? 2752
  const mapH = mapData?.map_metadata?.resolution?.height ?? 1536
  const viewport = getViewport(w, h, mapAspectRatio, mapW, mapH)
  const { drawX, drawY, drawW, drawH } = viewport

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

  if (debugPlaces) {
    const coordStep = 256
    ctx.strokeStyle = '#64748b55'
    ctx.lineWidth = 1
    ctx.fillStyle = '#94a3b8'
    ctx.font = '10px monospace'
    for (let x = 0; x <= mapW; x += coordStep) {
      const { px } = pointToCanvas(viewport, x, 0)
      ctx.beginPath()
      ctx.moveTo(px, drawY)
      ctx.lineTo(px, drawY + drawH)
      ctx.stroke()
      ctx.fillText(`x:${x}`, px + 2, drawY + 12)
    }
    for (let y = 0; y <= mapH; y += coordStep) {
      const { py } = pointToCanvas(viewport, 0, y)
      ctx.beginPath()
      ctx.moveTo(drawX, py)
      ctx.lineTo(drawX + drawW, py)
      ctx.stroke()
      ctx.fillText(`y:${y}`, drawX + 4, py - 4)
    }

    editablePoints.forEach((p) => {
      const { px, py } = pointToCanvas(viewport, p.x, p.y)
      const isSelected = p.id === selectedPointId
      const isDragging = p.id === draggingPointId
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = isDragging ? '#f97316' : isSelected ? '#f8fafc' : '#0b1020cc'
      ctx.lineWidth = isSelected ? 2 : 1
      ctx.stroke()

      const label = `${p.label} (${p.x}, ${p.y})`
      const textW = ctx.measureText(label).width
      const textX = Math.min(Math.max(px + 7, drawX + 2), drawX + drawW - textW - 2)
      const textY = Math.min(Math.max(py - 7, drawY + 12), drawY + drawH - 3)
      ctx.fillStyle = '#0b1020cc'
      ctx.fillRect(textX - 2, textY - 10, textW + 4, 12)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '10px monospace'
      ctx.fillText(label, textX, textY)
    })

    ctx.fillStyle = '#0b1020d9'
    ctx.fillRect(drawX + 6, drawY + drawH - 22, 420, 16)
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '10px monospace'
    ctx.fillText(
      editPlaces
        ? 'EDIT MODE: drag points, then Copy JSON'
        : 'DEBUG MODE: map points + absolute pixel coords',
      drawX + 10,
      drawY + drawH - 10,
    )
    return viewport
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
  return viewport
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
  const [mapDataDraft, setMapDataDraft] = useState<OfficeMapData | null>(null)
  const [isEventsPanelOpen, setIsEventsPanelOpen] = useState(false)
  const [isAgentsPanelOpen, setIsAgentsPanelOpen] = useState(false)
  const [isDebugPlacesEnabled, setIsDebugPlacesEnabled] = useState(false)
  const [isEditPlacesEnabled, setIsEditPlacesEnabled] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [fallbackJson, setFallbackJson] = useState<string | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const viewportRef = useRef<MapViewport | null>(null)
  const mapDataDraftRef = useRef<OfficeMapData | null>(null)
  const editablePointsRef = useRef<EditablePoint[]>([])
  const selectedPointIdRef = useRef<string | null>(null)
  const draggingPointIdRef = useRef<string | null>(null)
  const isDebugPlacesEnabledRef = useRef(false)
  const isEditPlacesEnabledRef = useRef(false)
  const [recentEvents, setRecentEvents] = useState<UiEvent[]>([])
  const editablePoints = useMemo(
    () => buildEditablePoints(mapDataDraft),
    [mapDataDraft],
  )

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
    const relaxSalt = extractAutoIdleRoamSalt(data.message)
    const { nx, ny, tx, ty } = resolveOfficeMove(
      data.agent,
      data.action,
      prevPos,
      mapDataDraftRef.current,
      occupied,
      relaxSalt,
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
        if (!cancelled) setMapDataDraft(data)
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
    mapDataDraftRef.current = mapDataDraft
  }, [mapDataDraft])

  useEffect(() => {
    editablePointsRef.current = editablePoints
  }, [editablePoints])

  useEffect(() => {
    selectedPointIdRef.current = selectedPointId
  }, [selectedPointId])

  useEffect(() => {
    draggingPointIdRef.current = draggingPointId
  }, [draggingPointId])

  useEffect(() => {
    isDebugPlacesEnabledRef.current = isDebugPlacesEnabled
  }, [isDebugPlacesEnabled])

  useEffect(() => {
    if (!isDebugPlacesEnabled) {
      setIsEditPlacesEnabled(false)
      setDraggingPointId(null)
    }
  }, [isDebugPlacesEnabled])

  useEffect(() => {
    isEditPlacesEnabledRef.current = isEditPlacesEnabled
  }, [isEditPlacesEnabled])

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

      const mapDraft = mapDataDraftRef.current
      const mapW = mapDraft?.map_metadata?.resolution?.width ?? 2752
      const mapH = mapDraft?.map_metadata?.resolution?.height ?? 1536
      const mapAspectRatio = mapW / mapH

      const viewport = drawScene(
        ctx,
        cssW,
        cssH,
        agentsRef.current,
        mapImageRef.current,
        mapAspectRatio,
        mapDraft,
        editablePointsRef.current,
        selectedPointIdRef.current,
        draggingPointIdRef.current,
        isDebugPlacesEnabledRef.current,
        isEditPlacesEnabledRef.current,
        now,
      )
      viewportRef.current = viewport
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
  }, [])

  const canvasMapPoint = (
    evt: ReactPointerEvent<HTMLCanvasElement>,
  ): { mx: number; my: number } | null => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const rect = evt.currentTarget.getBoundingClientRect()
    const cssX = evt.clientX - rect.left
    const cssY = evt.clientY - rect.top
    if (
      cssX < viewport.drawX ||
      cssX > viewport.drawX + viewport.drawW ||
      cssY < viewport.drawY ||
      cssY > viewport.drawY + viewport.drawH
    ) {
      return null
    }
    const mx = ((cssX - viewport.drawX) / viewport.drawW) * viewport.mapW
    const my = ((cssY - viewport.drawY) / viewport.drawH) * viewport.mapH
    return {
      mx: Math.max(0, Math.min(viewport.mapW, mx)),
      my: Math.max(0, Math.min(viewport.mapH, my)),
    }
  }

  const pickNearestPoint = (
    evt: ReactPointerEvent<HTMLCanvasElement>,
  ): EditablePoint | null => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const rect = evt.currentTarget.getBoundingClientRect()
    const cssX = evt.clientX - rect.left
    const cssY = evt.clientY - rect.top
    let best: EditablePoint | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const point of editablePoints) {
      const { px, py } = pointToCanvas(viewport, point.x, point.y)
      const dx = px - cssX
      const dy = py - cssY
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < bestDist) {
        best = point
        bestDist = d
      }
    }
    return bestDist <= 14 ? best : null
  }

  const onCanvasPointerDown = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!(isDebugPlacesEnabled && isEditPlacesEnabled)) return
    const nearest = pickNearestPoint(evt)
    if (!nearest) return
    evt.currentTarget.setPointerCapture(evt.pointerId)
    dragPointerIdRef.current = evt.pointerId
    setSelectedPointId(nearest.id)
    setDraggingPointId(nearest.id)
    setCopyStatus(null)
  }

  const onCanvasPointerMove = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!(isDebugPlacesEnabled && isEditPlacesEnabled)) return
    if (dragPointerIdRef.current !== evt.pointerId || !draggingPointId) return
    const nextPoint = canvasMapPoint(evt)
    if (!nextPoint) return
    setMapDataDraft((prev) =>
      updateDraftPoint(prev, draggingPointId, nextPoint.mx, nextPoint.my),
    )
  }

  const onCanvasPointerUp = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragPointerIdRef.current !== evt.pointerId) return
    dragPointerIdRef.current = null
    setDraggingPointId(null)
    if (evt.currentTarget.hasPointerCapture(evt.pointerId)) {
      evt.currentTarget.releasePointerCapture(evt.pointerId)
    }
  }

  const onCopyJson = async () => {
    if (!mapDataDraft) return
    const payload = JSON.stringify(mapDataDraft, null, 2)
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('clipboard API unavailable')
      }
      await navigator.clipboard.writeText(payload)
      setFallbackJson(null)
      setCopyStatus('Copied JSON to clipboard')
    } catch {
      setFallbackJson(payload)
      setCopyStatus('Clipboard blocked: copy from textarea below')
    }
  }

  const statusColor =
    status === 'open' ? 'text-emerald-400' : 'text-amber-300'
  const agentsList = Array.from(agentsRef.current.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed tracking-wide">
        <div className="flex items-center gap-2">
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
            onClick={() => setIsDebugPlacesEnabled((v) => !v)}
            className={`rounded border px-2 py-1 text-[9px] ${
              isDebugPlacesEnabled
                ? 'border-emerald-600 bg-emerald-900/40 text-emerald-300'
                : 'border-[#3d4566] bg-[#1a1c2e] text-slate-300 hover:bg-[#242a3f]'
            }`}
            title="Toggle debug places mode"
          >
            Debug places {isDebugPlacesEnabled ? 'ON' : 'OFF'}
          </button>
          {isDebugPlacesEnabled ? (
            <>
              <button
                type="button"
                onClick={() => setIsEditPlacesEnabled((v) => !v)}
                className={`rounded border px-2 py-1 text-[9px] ${
                  isEditPlacesEnabled
                    ? 'border-orange-500 bg-orange-950/40 text-orange-300'
                    : 'border-[#3d4566] bg-[#1a1c2e] text-slate-300 hover:bg-[#242a3f]'
                }`}
                title="Enable dragging of map points"
              >
                Edit places {isEditPlacesEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => void onCopyJson()}
                disabled={!mapDataDraft}
                className="rounded border border-[#3d4566] bg-[#1a1c2e] px-2 py-1 text-[9px] text-slate-300 hover:bg-[#242a3f] disabled:cursor-not-allowed disabled:opacity-50"
                title="Copy generated map JSON"
              >
                Copy JSON
              </button>
            </>
          ) : null}
        </div>
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
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />
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
        {(copyStatus || fallbackJson) && !isAgentsPanelOpen && !isEventsPanelOpen ? (
          <div className="absolute bottom-2 left-2 z-20 max-w-[42%] rounded border border-[#3d4566] bg-[#0f1424e8] p-2">
            {copyStatus ? (
              <p className="mb-1 text-[9px] leading-relaxed text-emerald-300">
                {copyStatus}
              </p>
            ) : null}
            {fallbackJson ? (
              <textarea
                readOnly
                value={fallbackJson}
                className="h-24 w-full rounded border border-[#3d4566] bg-[#0b1020] p-2 text-[9px] text-slate-200"
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="text-[8px] leading-relaxed text-[#8b93b8]">
        POST <span className="text-slate-300">agent</span> +{' '}
        <span className="text-slate-300">action</span> to /event — positions
        come from map zones (first visit: entrance → desk; idle/end → break
        area).
        {mapDataDraft?.zones
          ? ` Zones: ${Object.keys(mapDataDraft.zones).length}.`
          : ''}
      </p>
    </div>
  )
}
