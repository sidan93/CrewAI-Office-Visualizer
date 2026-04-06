import {
  createCharacterState,
  hashAgentColor,
  type CharacterState,
} from '../agentSprites'
import {
  isRestAction,
  type OccupiedPos,
  type OfficeMapData,
  resolveOfficeMove,
  resolveTargetZone,
} from '../resolveOfficeMove'
import type { AgentVisual, OfficeEventPayload } from './types'

export const MESSAGE_TTL_MS = 5000

export function extractAutoIdleRoamSalt(message?: string): string | undefined {
  if (!message) return undefined
  const prefix = 'auto-idle-roam:'
  if (!message.startsWith(prefix)) return undefined
  const salt = message.slice(prefix.length).trim()
  return salt.length > 0 ? salt : undefined
}

function isInternalAutoIdleRoamMessage(message?: string): boolean {
  return typeof message === 'string' && message.startsWith('auto-idle-roam:')
}

export function collectOccupied(
  agents: Map<string, AgentVisual>,
  movingAgent: string,
): {
  work: OccupiedPos[]
  relax: OccupiedPos[]
  meeting: OccupiedPos[]
} {
  const work: OccupiedPos[] = []
  const relax: OccupiedPos[] = []
  const meeting: OccupiedPos[] = []
  agents.forEach((agent) => {
    if (agent.name === movingAgent) return
    const p = { x: agent.tx, y: agent.ty }
    if (agent.targetZone === 'relax') relax.push(p)
    else if (agent.targetZone === 'meeting') meeting.push(p)
    else work.push(p)
  })
  return { work, relax, meeting }
}

type ApplyOfficeEventArgs = {
  agents: Map<string, AgentVisual>
  data: OfficeEventPayload
  mapData: OfficeMapData | null
  now: number
}

export function applyOfficeEvent({
  agents,
  data,
  mapData,
  now,
}: ApplyOfficeEventArgs): AgentVisual {
  const prev = agents.get(data.agent)
  const prevPos = prev ? { cx: prev.cx, cy: prev.cy } : undefined
  const occupied = collectOccupied(agents, data.agent)
  const messageText = typeof data.message === 'string' ? data.message : undefined
  const relaxSalt = extractAutoIdleRoamSalt(messageText)
  const { nx, ny, tx, ty } = resolveOfficeMove(
    data.agent,
    data.action,
    prevPos,
    mapData,
    occupied,
    relaxSalt,
  )

  const character: CharacterState =
    prev?.character ?? createCharacterState(data.agent, now)
  const messageProvided = Object.prototype.hasOwnProperty.call(data, 'message')
  const isInternalMessage = isInternalAutoIdleRoamMessage(messageText)
  const hasMessage =
    typeof messageText === 'string' &&
    messageText.trim().length > 0 &&
    !isInternalMessage
  const shouldClearMessage = messageProvided && !hasMessage
  const nextMessage = shouldClearMessage ? undefined : hasMessage ? messageText : prev?.message
  const nextMessageUpdatedAt = shouldClearMessage
    ? undefined
    : hasMessage
      ? now
      : prev?.messageUpdatedAt
  const nextMessageVisibleUntil = shouldClearMessage
    ? undefined
    : hasMessage
      ? now + MESSAGE_TTL_MS
      : prev?.messageVisibleUntil
  const entry: AgentVisual = {
    name: data.agent,
    nx,
    ny,
    cx: nx,
    cy: ny,
    tx,
    ty,
    moveStart: now,
    color: prev?.color ?? hashAgentColor(data.agent),
    isResting: isRestAction(data.action),
    targetZone: resolveTargetZone(data.action),
    character,
    action: data.action,
    load: data.load,
    message: nextMessage,
    messageUpdatedAt: nextMessageUpdatedAt,
    messageVisibleUntil: nextMessageVisibleUntil,
  }
  agents.set(data.agent, entry)
  return entry
}
