import type { MapViewport } from './types'

export function getViewport(
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

export function pointToCanvas(viewport: MapViewport, x: number, y: number) {
  return {
    px: viewport.drawX + (x / viewport.mapW) * viewport.drawW,
    py: viewport.drawY + (y / viewport.mapH) * viewport.drawH,
  }
}

export function canvasToMapPoint(
  viewport: MapViewport,
  cssX: number,
  cssY: number,
): { mx: number; my: number } | null {
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
