import type { CharacterState } from '../agentSprites'
import type { TargetZone } from '../resolveOfficeMove'

export type OfficeEventPayload = {
  type?: 'event'
  agent: string
  action: string
  message?: string | null
  load?: AgentLoadPayload
}

export type OfficeSnapshotPayload = {
  type: 'snapshot'
  agents: OfficeEventPayload[]
}

export type AgentVisual = {
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
  load?: AgentLoadPayload
  message?: string
  messageUpdatedAt?: number
  messageVisibleUntil?: number
}

export type AgentLoadPayload = {
  idle: number
  working: number
  meeting: number
}

export type UiEvent = {
  id: number
  ts: number
  title: string
  details?: string
  agent?: string
}

export type ZoneLike = {
  center?: { x: number; y: number }
  door_way?: { x: number; y: number }
  seats?: Array<{ id?: string; x: number; y: number }>
}

export type EditablePointKind = 'center' | 'door_way' | 'seat'

export type EditablePoint = {
  id: string
  label: string
  x: number
  y: number
  color: string
  kind: EditablePointKind
}

export type MapViewport = {
  drawX: number
  drawY: number
  drawW: number
  drawH: number
  mapW: number
  mapH: number
}
