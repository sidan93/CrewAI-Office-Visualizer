import { useEffect, useMemo, useState } from 'react'
import type { AgentVisual, UiEvent } from './types'

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function getLoadPercentages(agent: AgentVisual): { idle: number; working: number; meeting: number } {
  const raw = agent.load
  if (!raw) return { idle: 100, working: 0, meeting: 0 }
  const idle = normalizePercent(raw.idle)
  const working = normalizePercent(raw.working)
  const meeting = normalizePercent(raw.meeting)
  const sum = idle + working + meeting
  if (sum <= 0) return { idle: 100, working: 0, meeting: 0 }
  return {
    idle: (idle / sum) * 100,
    working: (working / sum) * 100,
    meeting: (meeting / sum) * 100,
  }
}

type TopBarProps = {
  status: 'connecting' | 'open' | 'closed'
  lastError: string | null
  isDebugPlacesEnabled: boolean
  isEditPlacesEnabled: boolean
  mapDataDraftPresent: boolean
  onToggleAgentsPanel: () => void
  onToggleEventsPanel: () => void
  onToggleDebugPlaces: () => void
  onToggleEditPlaces: () => void
  onCopyJson: () => void
}

export function TopBar({
  status,
  lastError,
  isDebugPlacesEnabled,
  isEditPlacesEnabled,
  mapDataDraftPresent,
  onToggleAgentsPanel,
  onToggleEventsPanel,
  onToggleDebugPlaces,
  onToggleEditPlaces,
  onCopyJson,
}: TopBarProps) {
  const statusColor = status === 'open' ? 'text-emerald-400' : 'text-amber-300'

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed tracking-wide">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleAgentsPanel}
          className="text-[11px] text-sky-300 underline decoration-dotted underline-offset-4 hover:text-sky-200"
          title="Toggle agents panel"
        >
          Office map
        </button>
        <button
          type="button"
          onClick={onToggleDebugPlaces}
          className={`rounded border px-2 py-1 text-[9px] ${
            isDebugPlacesEnabled
              ? 'border-emerald-600 bg-emerald-900/40 text-emerald-300'
              : 'border-[#3d4566] bg-[#1a1c2e] text-slate-300 hover:bg-[#242a3f]'
          }`}
          title="Toggle debug places mode"
        >
          Debug places {isDebugPlacesEnabled ? 'ON' : 'OFF'}
        </button>
        {isDebugPlacesEnabled ? (
          <>
            <button
              type="button"
              onClick={onToggleEditPlaces}
              className={`rounded border px-2 py-1 text-[9px] ${
                isEditPlacesEnabled
                  ? 'border-orange-500 bg-orange-950/40 text-orange-300'
                  : 'border-[#3d4566] bg-[#1a1c2e] text-slate-300 hover:bg-[#242a3f]'
              }`}
              title="Enable dragging of map points"
            >
              Edit places {isEditPlacesEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={onCopyJson}
              disabled={!mapDataDraftPresent}
              className="rounded border border-[#3d4566] bg-[#1a1c2e] px-2 py-1 text-[9px] text-slate-300 hover:bg-[#242a3f] disabled:cursor-not-allowed disabled:opacity-50"
              title="Copy generated map JSON"
            >
              Copy JSON
            </button>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onToggleEventsPanel}
        className={`${statusColor} rounded border border-[#3d4566] bg-[#1a1c2e] px-2 py-1 hover:bg-[#242a3f]`}
        title="Toggle events panel"
      >
        WS: {status}
        {lastError ? ` — ${lastError}` : ''}
      </button>
    </header>
  )
}

type AgentsPanelProps = {
  isOpen: boolean
  agents: AgentVisual[]
  onClose: () => void
}

export function AgentsPanel({ isOpen, agents, onClose }: AgentsPanelProps) {
  return (
    <aside
      className={`absolute bottom-0 left-0 top-0 z-10 w-[300px] border-r border-[#3d4566] bg-[#141a2be6] p-2 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] tracking-wide text-sky-300">Agents now</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[#3d4566] px-1 py-[2px] text-[9px] text-slate-300 hover:bg-[#242a3f]"
        >
          close
        </button>
      </div>
      <div className="h-full overflow-y-auto pr-1">
        {agents.length === 0 ? (
          <p className="text-[9px] text-[#8b93b8]">No agents yet</p>
        ) : (
          agents.map((agent) => (
            (() => {
              const load = getLoadPercentages(agent)

              return (
                <div
                  key={agent.name}
                  className="mb-1 rounded border border-[#2d3552] bg-[#1a1f33] p-1"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-sm border border-[#0f0f18]"
                      style={{ backgroundColor: agent.color }}
                    />
                    <p className="text-[9px] text-emerald-300">{agent.name}</p>
                  </div>
                  <p className="mt-[2px] text-[8px] text-slate-200">{agent.action ?? 'waiting'}</p>
                  <div
                    className="mt-1 flex h-2 overflow-hidden rounded border border-[#2d3552] bg-[#10162a]"
                    title={`idle ${load.idle.toFixed(1)}% • working ${load.working.toFixed(1)}% • meeting ${load.meeting.toFixed(1)}%`}
                  >
                    <span className="h-full bg-amber-500/80" style={{ width: `${load.idle}%` }} />
                    <span className="h-full bg-emerald-500/80" style={{ width: `${load.working}%` }} />
                    <span className="h-full bg-violet-500/80" style={{ width: `${load.meeting}%` }} />
                  </div>
                  {agent.message ? (
                    <p className="mt-[2px] text-[8px] text-[#8b93b8]">{agent.message}</p>
                  ) : null}
                </div>
              )
            })()
          ))
        )}
      </div>
    </aside>
  )
}

type EventsPanelProps = {
  isOpen: boolean
  events: UiEvent[]
  onClose: () => void
}

export function EventsPanel({ isOpen, events, onClose }: EventsPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const agentOptions = useMemo(() => {
    const unique = new Set<string>()
    for (const evt of events) {
      if (typeof evt.agent === 'string' && evt.agent.trim().length > 0) {
        unique.add(evt.agent)
      }
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [events])
  const filteredEvents = useMemo(
    () => (selectedAgent ? events.filter((evt) => evt.agent === selectedAgent) : events),
    [events, selectedAgent],
  )
  useEffect(() => {
    if (selectedAgent && !agentOptions.includes(selectedAgent)) {
      setSelectedAgent('')
    }
  }, [agentOptions, selectedAgent])

  return (
    <aside
      className={`absolute bottom-0 right-0 top-0 z-10 w-[300px] border-l border-[#3d4566] bg-[#141a2be6] p-2 transition-transform duration-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] tracking-wide text-sky-300">Last events</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[#3d4566] px-1 py-[2px] text-[9px] text-slate-300 hover:bg-[#242a3f]"
        >
          close
        </button>
      </div>
      <div className="mb-2 rounded border border-[#2d3552] bg-[#1a1f33]/90 p-1">
        <label
          htmlFor="events-agent-filter"
          className="mb-1 block text-[8px] uppercase tracking-wide text-[#8b93b8]"
        >
          Filter by agent
        </label>
        <div className="relative">
          <select
            id="events-agent-filter"
            value={selectedAgent}
            onChange={(evt) => setSelectedAgent(evt.target.value)}
            className="min-w-0 w-full appearance-none rounded border border-[#3d4566] bg-[#0f1424] px-2 py-[4px] pr-6 text-[9px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none transition-colors hover:border-sky-500/60 hover:bg-[#131a2e] focus:border-sky-400 focus:ring-1 focus:ring-sky-400/60"
            title="Filter events by agent"
          >
            <option value="">All agents</option>
            {agentOptions.map((agentName) => (
              <option key={agentName} value={agentName}>
                {agentName}
              </option>
            ))}
          </select>
          <span
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-slate-400"
            aria-hidden="true"
          >
            v
          </span>
        </div>
      </div>
      <div className="h-full overflow-y-auto pr-1">
        {filteredEvents.length === 0 ? (
          <p className="text-[9px] text-[#8b93b8]">No events yet</p>
        ) : (
          filteredEvents.map((evt) => (
            <div key={evt.id} className="mb-1 rounded border border-[#2d3552] bg-[#1a1f33] p-1">
              <p className="text-[9px] text-emerald-300">{evt.title}</p>
              {evt.details ? <p className="text-[8px] text-slate-300">{evt.details}</p> : null}
              <p className="text-[8px] text-[#8b93b8]">
                {new Date(evt.ts).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>
    </aside>
  )
}
