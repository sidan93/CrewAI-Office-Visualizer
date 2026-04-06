import type { OfficeMapData } from '../resolveOfficeMove'
import { pointToCanvas } from './viewport'
import type { EditablePoint, MapViewport, ZoneLike } from './types'

export function buildEditablePoints(mapData: OfficeMapData | null): EditablePoint[] {
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

export function updateDraftPoint(
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

export function pickNearestPoint(
  points: EditablePoint[],
  viewport: MapViewport,
  cssX: number,
  cssY: number,
  maxDistance = 14,
): EditablePoint | null {
  let best: EditablePoint | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const point of points) {
    const { px, py } = pointToCanvas(viewport, point.x, point.y)
    const dx = px - cssX
    const dy = py - cssY
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d < bestDist) {
      best = point
      bestDist = d
    }
  }
  return bestDist <= maxDistance ? best : null
}
