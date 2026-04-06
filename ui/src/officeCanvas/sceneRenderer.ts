import { drawCharacter } from '../agentSprites'
import type { OfficeMapData } from '../resolveOfficeMove'
import { getAgentHeadAnchor } from './agentLayout'
import type { AgentVisual, EditablePoint, MapViewport } from './types'
import { getViewport, pointToCanvas } from './viewport'

type DrawSceneArgs = {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  agents: Map<string, AgentVisual>
  mapImage: HTMLImageElement | null
  mapAspectRatio: number
  mapData: OfficeMapData | null
  editablePoints: EditablePoint[]
  selectedPointId: string | null
  draggingPointId: string | null
  debugPlaces: boolean
  editPlaces: boolean
  now: number
}

function drawGrid(ctx: CanvasRenderingContext2D, drawX: number, drawY: number, drawW: number, drawH: number) {
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
}

function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  viewport: MapViewport,
  editablePoints: EditablePoint[],
  selectedPointId: string | null,
  draggingPointId: string | null,
  editPlaces: boolean,
) {
  const { drawX, drawY, drawW, drawH, mapW, mapH } = viewport
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
}

function drawAgents(
  ctx: CanvasRenderingContext2D,
  agents: Map<string, AgentVisual>,
  now: number,
  viewport: MapViewport,
) {
  const { drawX, drawY, drawW, drawH } = viewport
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

    if (!a.message || (a.messageVisibleUntil ?? 0) <= now) return
    drawMessageBubble(ctx, a, viewport)
  })
}

function drawMessageBubble(ctx: CanvasRenderingContext2D, agent: AgentVisual, viewport: MapViewport) {
  const { drawX, drawW } = viewport
  const maxWidth = Math.min(300, drawW * 0.5)
  const message = (agent.message ?? '').trim().replace(/\s+/g, ' ').slice(0, 220)
  if (!message) return

  ctx.save()
  ctx.font = '8px "Press Start 2P", monospace'

  const words = message.split(' ')
  const lines: string[] = []
  let line = ''
  const maxLines = 4
  for (const word of words) {
    const next = line.length > 0 ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth - 18) {
      line = next
      continue
    }
    if (line.length > 0) {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
      continue
    }
    const clipped = `${word.slice(0, 24)}…`
    lines.push(clipped)
    line = ''
    break
  }
  if (line.length > 0 && lines.length < maxLines) {
    lines.push(line)
  } else if (line.length > 0 && lines.length === maxLines) {
    const lastIdx = maxLines - 1
    lines[lastIdx] = `${lines[lastIdx].slice(0, Math.max(0, lines[lastIdx].length - 1))}…`
  }
  if (lines.length === 0) lines.push(message)

  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width))
  const bubbleW = Math.ceil(textWidth + 18)
  const lineH = 11
  const bubbleH = lines.length * lineH + 14

  const anchor = getAgentHeadAnchor(agent, viewport)
  const minX = drawX + 4
  const maxX = drawX + drawW - bubbleW - 4
  const bubbleX = Math.min(maxX, Math.max(minX, anchor.x - bubbleW / 2))
  const bubbleY = anchor.y - bubbleH - 4

  ctx.fillStyle = '#0b1020ee'
  ctx.strokeStyle = '#5b6a93'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(bubbleX, bubbleY, bubbleW, bubbleH, 6)
  ctx.fill()
  ctx.stroke()

  const tipX = Math.min(bubbleX + bubbleW - 10, Math.max(bubbleX + 10, anchor.x))
  const tipY = bubbleY + bubbleH
  ctx.beginPath()
  ctx.moveTo(tipX - 4, tipY)
  ctx.lineTo(tipX + 4, tipY)
  ctx.lineTo(anchor.x, anchor.y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = '#e8ecff'
  lines.forEach((text, idx) => {
    ctx.fillText(text, bubbleX + 9, bubbleY + 11 + idx * lineH)
  })
  ctx.restore()
}

export function drawScene({
  ctx,
  w,
  h,
  agents,
  mapImage,
  mapAspectRatio,
  mapData,
  editablePoints,
  selectedPointId,
  draggingPointId,
  debugPlaces,
  editPlaces,
  now,
}: DrawSceneArgs): MapViewport {
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
  drawGrid(ctx, drawX, drawY, drawW, drawH)

  if (debugPlaces) {
    drawDebugOverlay(
      ctx,
      viewport,
      editablePoints,
      selectedPointId,
      draggingPointId,
      editPlaces,
    )
    return viewport
  }

  drawAgents(ctx, agents, now, viewport)
  return viewport
}
