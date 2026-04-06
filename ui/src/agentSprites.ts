const HERO_SPRITES = import.meta.glob('./assets/heroes/*.png', {
  eager: true,
  import: 'default',
}) as Record<string, string>

export type Direction = 'down' | 'left' | 'right' | 'up'
export type AnimState = 'idle' | 'walk'

export type CharacterState = {
  spriteUrl: string | null
  direction: Direction
  animState: AnimState
  walkStartedAt: number
  idleTurnAt: number
  idleStep: number
  idleOffset: number
}

type DrawCharacterArgs = {
  ctx: CanvasRenderingContext2D
  name: string
  cx: number
  cy: number
  color: string
  state: CharacterState
  now: number
  drawX: number
  drawY: number
  drawW: number
  drawH: number
}

type UpdateCharacterStateArgs = {
  state: CharacterState
  now: number
  dx: number
  dy: number
  isResting: boolean
}

const ROW_BY_DIRECTION: Record<Direction, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
}

const WALK_SEQUENCE = [0, 1, 2, 1, 0]
const FRAME_W = 20
const FRAME_H = 32
const FRAME_OFFSET_X = 2
const FRAME_OFFSET_Y = 0
const WALK_FPS = 8
const MOVE_EPS = 0.0008
const DRAW_H = 48
const IDLE_FRAME = 1
const WORK_IDLE_INTERVAL_MS = 4200
const REST_IDLE_INTERVAL_MS = 2600

const REST_IDLE_PATTERN: Direction[] = [
  'up',
  'up',
  'left',
  'up',
  'right',
  'up',
  'down',
  'up',
]
const WORK_IDLE_PATTERN: Direction[] = ['down', 'left', 'down', 'right']

const IMAGE_CACHE = new Map<string, HTMLImageElement>()

const heroSpriteUrls = Object.entries(HERO_SPRITES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url)

function hashU32(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function loadSprite(url: string | null): HTMLImageElement | null {
  if (!url) return null
  const existing = IMAGE_CACHE.get(url)
  if (existing) return existing
  const img = new Image()
  img.src = url
  IMAGE_CACHE.set(url, img)
  return img
}

function pickAgentSprite(agentId: string): string | null {
  if (heroSpriteUrls.length === 0) return null
  const idx = hashU32(agentId) % heroSpriteUrls.length
  return heroSpriteUrls[idx]
}

function resolveDirectionFromDelta(
  dx: number,
  dy: number,
  fallback: Direction,
): Direction {
  if (Math.abs(dx) < MOVE_EPS && Math.abs(dy) < MOVE_EPS) return fallback
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

function resolveIdleDirection(
  isResting: boolean,
  idleStep: number,
  idleOffset: number,
): Direction {
  const pattern = isResting ? REST_IDLE_PATTERN : WORK_IDLE_PATTERN
  return pattern[(idleStep + idleOffset) % pattern.length]
}

function drawFallback(
  ctx: CanvasRenderingContext2D,
  color: string,
  px: number,
  py: number,
  w: number,
  h: number,
) {
  ctx.fillStyle = color
  ctx.fillRect(px, py, w, h)
  ctx.strokeStyle = '#0f0f18'
  ctx.lineWidth = 2
  ctx.strokeRect(px, py, w, h)
}

function walkFrameIndex(now: number, walkStartedAt: number): number {
  const frame = Math.floor(((now - walkStartedAt) / 1000) * WALK_FPS)
  return WALK_SEQUENCE[frame % WALK_SEQUENCE.length]
}

export function hashAgentColor(name: string): string {
  const hue = hashU32(name) % 360
  return `hsl(${hue} 70% 55%)`
}

export function createCharacterState(agentId: string, now: number): CharacterState {
  const seed = hashU32(`${agentId}:idle`)
  return {
    spriteUrl: pickAgentSprite(agentId),
    direction: 'down',
    animState: 'idle',
    walkStartedAt: now,
    idleTurnAt: now,
    idleStep: 0,
    idleOffset: seed % REST_IDLE_PATTERN.length,
  }
}

export function updateCharacterState({
  state,
  now,
  dx,
  dy,
  isResting,
}: UpdateCharacterStateArgs): CharacterState {
  const moving = Math.abs(dx) >= MOVE_EPS || Math.abs(dy) >= MOVE_EPS
  if (moving) {
    return {
      ...state,
      animState: 'walk',
      direction: resolveDirectionFromDelta(dx, dy, state.direction),
      walkStartedAt: state.animState === 'walk' ? state.walkStartedAt : now,
      idleTurnAt: now,
    }
  }

  const interval = isResting ? REST_IDLE_INTERVAL_MS : WORK_IDLE_INTERVAL_MS
  const shouldTurn = now - state.idleTurnAt >= interval
  const idleStep = shouldTurn ? state.idleStep + 1 : state.idleStep
  return {
    ...state,
    animState: 'idle',
    idleStep,
    idleTurnAt: shouldTurn ? now : state.idleTurnAt,
    direction: resolveIdleDirection(isResting, idleStep, state.idleOffset),
  }
}

export function drawCharacter({
  ctx,
  name,
  cx,
  cy,
  color,
  state,
  now,
  drawX,
  drawY,
  drawW,
  drawH,
}: DrawCharacterArgs) {
  const frameW = FRAME_W
  const frameH = FRAME_H
  const dstH = DRAW_H
  const dstW = (frameW / frameH) * dstH
  const px = drawX + cx * drawW - dstW / 2
  const py = drawY + cy * drawH - dstH / 2

  const image = loadSprite(state.spriteUrl)
  const loaded = image && image.complete && image.naturalWidth > 0
  if (!loaded) {
    drawFallback(ctx, color, px, py, dstW, dstH)
  } else {
    const row = ROW_BY_DIRECTION[state.direction]
    const col = state.animState === 'walk' ? walkFrameIndex(now, state.walkStartedAt) : IDLE_FRAME
    ctx.drawImage(
      image,
      FRAME_OFFSET_X + col * frameW,
      FRAME_OFFSET_Y + row * frameH,
      frameW,
      frameH,
      px,
      py,
      dstW,
      dstH,
    )
  }

  ctx.fillStyle = '#e8ecff'
  ctx.font = '8px "Press Start 2P", monospace'
  ctx.fillText(name.slice(0, 12), px, py - 6)
}
