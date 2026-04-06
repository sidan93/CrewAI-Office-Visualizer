import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import officeMapUrl from './assets/maps/01_office.png'
import officeMapDataUrl from './assets/maps/01_offfice.json?url'
import { updateCharacterState } from './agentSprites'
import type { OfficeMapData } from './resolveOfficeMove'
import { buildEditablePoints, pickNearestPoint, updateDraftPoint } from './officeCanvas/mapEditor'
import { AgentsPanel, EventsPanel, TopBar } from './officeCanvas/panels'
import { getAgentRect } from './officeCanvas/agentLayout'
import { MESSAGE_TTL_MS } from './officeCanvas/agentState'
import { drawScene } from './officeCanvas/sceneRenderer'
import type { AgentVisual, EditablePoint, MapViewport, UiEvent } from './officeCanvas/types'
import { useOfficeRealtime } from './officeCanvas/useOfficeRealtime'
import { canvasToMapPoint } from './officeCanvas/viewport'

const MOVE_MS = 1200
const MAX_EVENTS = 80

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

  useOfficeRealtime({
    agentsRef,
    mapDataDraftRef,
    setStatus,
    setLastError,
    setRecentEvents,
    eventSeqRef,
    maxEvents: MAX_EVENTS,
  })

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

      const viewport = drawScene({
        ctx,
        w: cssW,
        h: cssH,
        agents: agentsRef.current,
        mapImage: mapImageRef.current,
        mapAspectRatio,
        mapData: mapDraft,
        editablePoints: editablePointsRef.current,
        selectedPointId: selectedPointIdRef.current,
        draggingPointId: draggingPointIdRef.current,
        debugPlaces: isDebugPlacesEnabledRef.current,
        editPlaces: isEditPlacesEnabledRef.current,
        now,
      })
      viewportRef.current = viewport
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const onCanvasPointerDown = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!(isDebugPlacesEnabled && isEditPlacesEnabled)) return
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = evt.currentTarget.getBoundingClientRect()
    const cssX = evt.clientX - rect.left
    const cssY = evt.clientY - rect.top
    const nearest = pickNearestPoint(editablePoints, viewport, cssX, cssY)
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
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = evt.currentTarget.getBoundingClientRect()
    const cssX = evt.clientX - rect.left
    const cssY = evt.clientY - rect.top
    const nextPoint = canvasToMapPoint(viewport, cssX, cssY)
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

  const onCanvasClick = (evt: ReactPointerEvent<HTMLCanvasElement>) => {
    if (isDebugPlacesEnabled && isEditPlacesEnabled) return
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = evt.currentTarget.getBoundingClientRect()
    const cssX = evt.clientX - rect.left
    const cssY = evt.clientY - rect.top
    const now = performance.now()

    const agentsByZ = Array.from(agentsRef.current.values()).sort((a, b) => a.cy - b.cy)
    for (let i = agentsByZ.length - 1; i >= 0; i--) {
      const agent = agentsByZ[i]
      const hasMessage = typeof agent.message === 'string' && agent.message.trim().length > 0
      if (!hasMessage) continue
      const hit = getAgentRect(agent, viewport)
      const inside =
        cssX >= hit.x && cssX <= hit.x + hit.w && cssY >= hit.y && cssY <= hit.y + hit.h
      if (!inside) continue
      agent.messageVisibleUntil = now + MESSAGE_TTL_MS
      agent.messageUpdatedAt = now
      break
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

  const agentsList = Array.from(agentsRef.current.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2 p-3">
      <TopBar
        status={status}
        lastError={lastError}
        isDebugPlacesEnabled={isDebugPlacesEnabled}
        isEditPlacesEnabled={isEditPlacesEnabled}
        mapDataDraftPresent={Boolean(mapDataDraft)}
        onToggleAgentsPanel={() => setIsAgentsPanelOpen((v) => !v)}
        onToggleEventsPanel={() => setIsEventsPanelOpen((v) => !v)}
        onToggleDebugPlaces={() => setIsDebugPlacesEnabled((v) => !v)}
        onToggleEditPlaces={() => setIsEditPlacesEnabled((v) => !v)}
        onCopyJson={() => void onCopyJson()}
      />
      <div className="relative min-h-0 flex-1 overflow-hidden rounded border-2 border-[#3d4566] bg-[#1a1c2e] shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]">
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onClick={onCanvasClick}
        />
        <AgentsPanel
          isOpen={isAgentsPanelOpen}
          agents={agentsList}
          onClose={() => setIsAgentsPanelOpen(false)}
        />
        <EventsPanel
          isOpen={isEventsPanelOpen}
          events={recentEvents}
          onClose={() => setIsEventsPanelOpen(false)}
        />
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
