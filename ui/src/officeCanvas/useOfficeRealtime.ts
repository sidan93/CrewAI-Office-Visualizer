import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { getWsUrl } from '../wsUrl'
import type { OfficeMapData } from '../resolveOfficeMove'
import { applyOfficeEvent } from './agentState'
import type { AgentVisual, OfficeEventPayload, OfficeSnapshotPayload, UiEvent } from './types'

type UseOfficeRealtimeArgs = {
  agentsRef: MutableRefObject<Map<string, AgentVisual>>
  mapDataDraftRef: MutableRefObject<OfficeMapData | null>
  setStatus: Dispatch<SetStateAction<'connecting' | 'open' | 'closed'>>
  setLastError: Dispatch<SetStateAction<string | null>>
  setRecentEvents: Dispatch<SetStateAction<UiEvent[]>>
  eventSeqRef: MutableRefObject<number>
  maxEvents?: number
}

export function useOfficeRealtime({
  agentsRef,
  mapDataDraftRef,
  setStatus,
  setLastError,
  setRecentEvents,
  eventSeqRef,
  maxEvents = 80,
}: UseOfficeRealtimeArgs) {
  useEffect(() => {
    const toDisplayMessage = (message?: string | null): string | undefined => {
      if (typeof message !== 'string') return undefined
      const trimmed = message.trim()
      if (!trimmed) return undefined
      if (trimmed.startsWith('auto-idle-roam:')) return undefined
      return trimmed
    }

    const pushEvent = (title: string, details?: string, agent?: string) => {
      eventSeqRef.current += 1
      const next: UiEvent = {
        id: eventSeqRef.current,
        ts: Date.now(),
        title,
        details,
        agent,
      }
      setRecentEvents((prev) => [next, ...prev].slice(0, maxEvents))
    }

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
            if (typeof event?.agent === 'string' && typeof event?.action === 'string') {
              applyOfficeEvent({
                agents: agentsRef.current,
                data: event,
                mapData: mapDataDraftRef.current,
                now: performance.now(),
              })
            }
          }
          pushEvent('snapshot:loaded', `${raw.agents.length} agents restored`)
          return
        }

        const data = raw as OfficeEventPayload
        if (typeof data.agent !== 'string' || typeof data.action !== 'string') {
          return
        }
        applyOfficeEvent({
          agents: agentsRef.current,
          data,
          mapData: mapDataDraftRef.current,
          now: performance.now(),
        })
        const displayMessage = toDisplayMessage(data.message)
        pushEvent(
          `event:${data.agent}`,
          `${data.action}${displayMessage ? ` • ${displayMessage}` : ''}`,
          data.agent,
        )
      } catch {
        pushEvent('event:invalid', 'Invalid JSON payload')
      }
    }

    return () => {
      ws.close()
    }
  }, [agentsRef, eventSeqRef, mapDataDraftRef, maxEvents, setLastError, setRecentEvents, setStatus])
}
