import type { AgentVisual, MapViewport } from './types'

const AGENT_FRAME_W = 20
const AGENT_FRAME_H = 32
const AGENT_DRAW_H = 48
const AGENT_DRAW_W = (AGENT_FRAME_W / AGENT_FRAME_H) * AGENT_DRAW_H

export type AgentRect = {
  x: number
  y: number
  w: number
  h: number
}

export function getAgentRect(agent: AgentVisual, viewport: MapViewport): AgentRect {
  const x = viewport.drawX + agent.cx * viewport.drawW - AGENT_DRAW_W / 2
  const y = viewport.drawY + agent.cy * viewport.drawH - AGENT_DRAW_H / 2
  return {
    x,
    y,
    w: AGENT_DRAW_W,
    h: AGENT_DRAW_H,
  }
}

export function getAgentHeadAnchor(agent: AgentVisual, viewport: MapViewport): { x: number; y: number } {
  const rect = getAgentRect(agent, viewport)
  return {
    x: rect.x + rect.w / 2,
    y: rect.y - 8,
  }
}

