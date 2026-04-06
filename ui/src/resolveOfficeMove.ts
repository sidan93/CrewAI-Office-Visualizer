/**
 * Maps semantic actions to normalized canvas coordinates [0,1] using office map zones.
 */

export type OfficeMapData = {
  map_metadata?: { resolution?: { width?: number; height?: number } }
  zones?: Record<string, MapZoneJson>
}

type MapZoneJson = {
  center?: { x: number; y: number }
  bounds?: { x_range: [number, number]; y_range: [number, number] }
  door_way?: { x: number; y: number }
  seats?: Array<{ id?: string; x: number; y: number }>
}

export type PrevPos = { cx: number; cy: number }
export type OccupiedPos = { x: number; y: number }
export type TargetZone = 'work' | 'relax' | 'meeting'

const DEFAULT_W = 2752
const DEFAULT_H = 1536

/** Actions that send the agent to the break / lounge area. */
const REST_ACTIONS = new Set([
  'idle',
  'end',
  'done',
  'finish',
  'rest',
  'lounge',
  'break',
])

/** Actions that send the agent to the meeting room. */
const MEETING_ACTIONS = new Set([
  'meeting',
  'meet',
  'call',
  'sync',
  'standup',
  'interview',
  'review',
  'planning',
])

function mapSize(map: OfficeMapData | null): { w: number; h: number } {
  const w = map?.map_metadata?.resolution?.width ?? DEFAULT_W
  const h = map?.map_metadata?.resolution?.height ?? DEFAULT_H
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

function norm(px: number, py: number, w: number, h: number) {
  return { x: px / w, y: py / h }
}

function hashPointInRect(
  agent: string,
  salt: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
) {
  let hh = 0
  const s = `${agent}\0${salt}`
  for (let i = 0; i < s.length; i++) hh = (hh * 31 + s.charCodeAt(i)) >>> 0
  const u = (hh & 0xffff) / 0xffff
  const v = ((hh >>> 16) & 0xffff) / 0xffff
  const pad = 0.07
  const x = x0 + (x1 - x0) * (pad + u * (1 - 2 * pad))
  const y = y0 + (y1 - y0) * (pad + v * (1 - 2 * pad))
  return { x, y }
}

function deskNorm(agent: string, work: MapZoneJson | undefined, w: number, h: number) {
  const b = work?.bounds
  if (b?.x_range && b?.y_range) {
    const [x0, x1] = b.x_range
    const [y0, y1] = b.y_range
    const p = hashPointInRect(agent, 'desk', x0, x1, y0, y1)
    return norm(p.x, p.y, w, h)
  }
  if (work?.center) return norm(work.center.x, work.center.y, w, h)
  return { x: 0.5, y: 0.55 }
}

function relaxTargetNorm(
  agent: string,
  relax: MapZoneJson | undefined,
  w: number,
  h: number,
) {
  const seat = pickSeatNorm(agent, relax, [], w, h, 'relax')
  if (seat) return seat
  const b = relax?.bounds
  if (b?.x_range && b?.y_range) {
    const [x0, x1] = b.x_range
    const [y0, y1] = b.y_range
    const p = hashPointInRect(agent, 'relax', x0, x1, y0, y1)
    return norm(p.x, p.y, w, h)
  }
  if (relax?.center) return norm(relax.center.x, relax.center.y, w, h)
  return { x: 0.22, y: 0.28 }
}

function hashU32(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function isSeatOccupied(
  seat: { x: number; y: number },
  occupied: OccupiedPos[],
  w: number,
  h: number,
): boolean {
  const sx = seat.x / w
  const sy = seat.y / h
  const eps = 0.012
  return occupied.some((p) => {
    const dx = p.x - sx
    const dy = p.y - sy
    return dx * dx + dy * dy <= eps * eps
  })
}

function pickSeatNorm(
  agent: string,
  zone: MapZoneJson | undefined,
  occupied: OccupiedPos[],
  w: number,
  h: number,
  salt: string,
): { x: number; y: number } | null {
  const seats = zone?.seats
  if (!seats || seats.length === 0) return null
  const start = hashU32(`${agent}\0${salt}`) % seats.length
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[(start + i) % seats.length]
    if (!isSeatOccupied(seat, occupied, w, h)) {
      return norm(seat.x, seat.y, w, h)
    }
  }
  return norm(seats[start].x, seats[start].y, w, h)
}

function lobbyDoorNorm(lobby: MapZoneJson | undefined, w: number, h: number) {
  if (lobby?.door_way) return norm(lobby.door_way.x, lobby.door_way.y, w, h)
  if (lobby?.center) return norm(lobby.center.x, lobby.center.y, w, h)
  return { x: 0.72, y: 0.96 }
}

function relaxDoorNorm(relax: MapZoneJson | undefined, w: number, h: number) {
  if (relax?.door_way) return norm(relax.door_way.x, relax.door_way.y, w, h)
  return relaxTargetNorm('__door__', relax, w, h)
}

export function isRestAction(action: string): boolean {
  return REST_ACTIONS.has(action.trim().toLowerCase())
}

export function isMeetingAction(action: string): boolean {
  return MEETING_ACTIONS.has(action.trim().toLowerCase())
}

export function resolveTargetZone(action: string): TargetZone {
  if (isRestAction(action)) return 'relax'
  if (isMeetingAction(action)) return 'meeting'
  return 'work'
}

/**
 * Returns animation endpoints: from (nx,ny) to (tx,ty) in normalized map space.
 */
export function resolveOfficeMove(
  agent: string,
  actionRaw: string,
  prev: PrevPos | undefined,
  map: OfficeMapData | null,
  occupied?: { work: OccupiedPos[]; relax: OccupiedPos[]; meeting: OccupiedPos[] },
  relaxSalt?: string,
): { nx: number; ny: number; tx: number; ty: number } {
  const { w, h } = mapSize(map)
  const zones = map?.zones
  const lobby = zones?.lobby_entry as MapZoneJson | undefined
  const work = zones?.work_open_space as MapZoneJson | undefined
  const relax = zones?.relax_area as MapZoneJson | undefined
  const meeting = zones?.meeting_room as MapZoneJson | undefined

  const targetZone = resolveTargetZone(actionRaw)
  const desk =
    pickSeatNorm(agent, work, occupied?.work ?? [], w, h, 'work') ??
    deskNorm(agent, work, w, h)
  const lounge =
    pickSeatNorm(
      agent,
      relax,
      occupied?.relax ?? [],
      w,
      h,
      relaxSalt ? `relax:${relaxSalt}` : 'relax',
    ) ?? relaxTargetNorm(agent, relax, w, h)
  const meetingSeat =
    pickSeatNorm(agent, meeting, occupied?.meeting ?? [], w, h, 'meeting') ??
    (meeting?.center ? norm(meeting.center.x, meeting.center.y, w, h) : desk)
  const entrance = lobbyDoorNorm(lobby, w, h)
  const loungeDoor = relaxDoorNorm(relax, w, h)
  const meetingDoor = meeting?.door_way
    ? norm(meeting.door_way.x, meeting.door_way.y, w, h)
    : entrance

  if (!prev) {
    if (targetZone === 'relax') {
      return {
        nx: loungeDoor.x,
        ny: loungeDoor.y,
        tx: lounge.x,
        ty: lounge.y,
      }
    }
    if (targetZone === 'meeting') {
      return {
        nx: meetingDoor.x,
        ny: meetingDoor.y,
        tx: meetingSeat.x,
        ty: meetingSeat.y,
      }
    }
    return {
      nx: entrance.x,
      ny: entrance.y,
      tx: desk.x,
      ty: desk.y,
    }
  }

  if (targetZone === 'relax') {
    return {
      nx: prev.cx,
      ny: prev.cy,
      tx: lounge.x,
      ty: lounge.y,
    }
  }
  if (targetZone === 'meeting') {
    return {
      nx: prev.cx,
      ny: prev.cy,
      tx: meetingSeat.x,
      ty: meetingSeat.y,
    }
  }

  return {
    nx: prev.cx,
    ny: prev.cy,
    tx: desk.x,
    ty: desk.y,
  }
}
