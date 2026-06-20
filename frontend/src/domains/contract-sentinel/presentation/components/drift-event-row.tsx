import { useState } from "react"
import { CheckCheck, ChevronDown, ChevronRight, Zap, AlertTriangle, Info, Link2 } from "lucide-react"
import type { DriftEventDto, ServiceEdgeDto, ServiceNodeDto, EndpointCall } from "../../infrastructure/api/types"
import { useAcknowledgeDrift, useUnacknowledgeDrift } from "../hooks/use-drift"

// ── Labels ────────────────────────────────────────────────────────────────────

const CHANGE_LABELS: Record<string, string> = {
  PATH_REMOVED:                 "Path removed",
  RESPONSE_FIELD_REMOVED:       "Response field removed",
  RESPONSE_FIELD_TYPE_CHANGED:  "Field type changed",
  REQUEST_REQUIRED_FIELD_ADDED: "Required field added",
  PATH_ADDED:                   "Path added",
  RESPONSE_FIELD_ADDED:         "Response field added",
  REQUEST_OPTIONAL_FIELD_ADDED: "Optional field added",
}

// Changes where callers of the endpoint are directly at risk
const BREAKING_TYPES = new Set([
  "PATH_REMOVED",
  "RESPONSE_FIELD_REMOVED",
  "RESPONSE_FIELD_TYPE_CHANGED",
  "REQUEST_REQUIRED_FIELD_ADDED",
])

// Changes where no existing callers are harmed (additive)
const ADDITIVE_TYPES = new Set([
  "PATH_ADDED",
  "RESPONSE_FIELD_ADDED",
  "REQUEST_OPTIONAL_FIELD_ADDED",
])

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET:    { bg: "#dcfce7", text: "#15803d" },
  POST:   { bg: "#dbeafe", text: "#1d4ed8" },
  PUT:    { bg: "#fef9c3", text: "#a16207" },
  PATCH:  { bg: "#f3e8ff", text: "#7e22ce" },
  DELETE: { bg: "#fee2e2", text: "#b91c1c" },
}

// ── Path matching ─────────────────────────────────────────────────────────────
// Converts a path template like /foo/{id}/bar into a regex that matches any
// concrete or parameterised variant, then tests both directions so {id} == {itemId}.
function pathsMatch(driftPath: string, callPath: string): boolean {
  if (!driftPath || !callPath) return false
  const toRegex = (p: string) =>
    new RegExp(`^${p.replace(/\{[^}]+\}/g, "[^/]+")}$`)
  return toRegex(driftPath).test(callPath) || toRegex(callPath).test(driftPath)
}

// ── Impact computation ────────────────────────────────────────────────────────

interface CallerImpact {
  serviceName:   string
  sourceId:      string
  directCalls:   EndpointCall[]   // calls that match the changed endpoint
  relatedCalls:  EndpointCall[]   // other calls to this service (context)
  isDirectHit:   boolean
}

function computeImpact(
  event:       DriftEventDto,
  graphEdges:  ServiceEdgeDto[],
  graphNodes:  ServiceNodeDto[],
): CallerImpact[] {
  const nodeById = Object.fromEntries(graphNodes.map(n => [n.id, n]))
  const callerEdges = graphEdges.filter(e => e.targetId === event.serviceId)

  return callerEdges.map(edge => {
    const calls = edge.endpointCalls ?? []

    const directCalls = event.httpMethod && event.apiPath
      ? calls.filter(
          c => c.method === event.httpMethod && pathsMatch(event.apiPath!, c.path)
        )
      : []

    const relatedCalls = calls.filter(c => !directCalls.includes(c))

    return {
      serviceName:  nodeById[edge.sourceId]?.name ?? edge.sourceName ?? edge.sourceId,
      sourceId:     edge.sourceId,
      directCalls,
      relatedCalls,
      isDirectHit:  directCalls.length > 0,
    }
  }).sort((a, b) => Number(b.isDirectHit) - Number(a.isDirectHit))  // direct hits first
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MethodPill({ method }: { method: string }) {
  const c = METHOD_COLORS[method] ?? { bg: "#f1f5f9", text: "#475569" }
  return (
    <span
      className="text-xs font-bold px-1.5 py-0.5 rounded font-mono shrink-0"
      style={{ background: c.bg, color: c.text }}
    >
      {method}
    </span>
  )
}

function ImpactPanel({ event, impacts }: { event: DriftEventDto; impacts: CallerImpact[] }) {
  const isAdditive = ADDITIVE_TYPES.has(event.changeType)

  if (isAdditive) {
    return (
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2 text-xs" style={{ color: "#15803d" }}>
          <Info className="w-3.5 h-3.5 shrink-0" />
          Additive change — no existing callers are affected. Services can adopt this at their own pace.
        </div>
      </div>
    )
  }

  if (impacts.length === 0) {
    return (
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
          No services in the dependency graph call this service directly.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: "var(--color-border)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
        Impact breakdown
      </p>

      {impacts.map(imp => (
        <div
          key={imp.sourceId}
          className="rounded-lg p-3"
          style={{
            background:   imp.isDirectHit ? "#fff7ed" : "var(--color-background)",
            border:       `1px solid ${imp.isDirectHit ? "#fed7aa" : "var(--color-border)"}`,
          }}
        >
          {/* Caller service name + risk label */}
          <div className="flex items-center gap-2 mb-2">
            {imp.isDirectHit
              ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#ea580c" }} />
              : <Link2        className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--color-text-secondary)" }} />
            }
            <span className="text-xs font-semibold font-mono" style={{ color: "var(--color-text-primary)" }}>
              {imp.serviceName}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded ml-auto"
              style={{
                background: imp.isDirectHit ? "#ffedd5" : "#f1f5f9",
                color:      imp.isDirectHit ? "#c2410c" : "var(--color-text-secondary)",
              }}
            >
              {imp.isDirectHit ? "Direct hit" : "Indirect dependency"}
            </span>
          </div>

          {/* Matched calls */}
          {imp.directCalls.length > 0 && (
            <div className="space-y-1 mb-2">
              {imp.directCalls.map((call, i) => (
                <div key={i} className="flex items-center gap-2">
                  <MethodPill method={call.method} />
                  <code className="text-xs truncate" style={{ color: "var(--color-text-primary)" }}>
                    {call.path}
                  </code>
                  {call.description && (
                    <span className="text-xs truncate ml-auto" style={{ color: "var(--color-text-secondary)" }}>
                      {call.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No known direct calls but still a caller */}
          {!imp.isDirectHit && imp.relatedCalls.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                Calls {imp.relatedCalls.length} other endpoint{imp.relatedCalls.length > 1 ? "s" : ""} on this service:
              </p>
              {imp.relatedCalls.slice(0, 3).map((call, i) => (
                <div key={i} className="flex items-center gap-2 opacity-60">
                  <MethodPill method={call.method} />
                  <code className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
                    {call.path}
                  </code>
                </div>
              ))}
              {imp.relatedCalls.length > 3 && (
                <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  +{imp.relatedCalls.length - 3} more
                </p>
              )}
            </div>
          )}

          {!imp.isDirectHit && imp.relatedCalls.length === 0 && (
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Dependency detected but no specific endpoint calls recorded yet. Run a scan to enrich.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  event:       DriftEventDto
  queryKey:    unknown[]
  graphEdges?: ServiceEdgeDto[]
  graphNodes?: ServiceNodeDto[]
}

export function DriftEventRow({ event, queryKey, graphEdges = [], graphNodes = [] }: Props) {
  const { mutate: acknowledge,   isPending: isMarking   } = useAcknowledgeDrift(queryKey)
  const { mutate: unacknowledge, isPending: isUnmarking } = useUnacknowledgeDrift(queryKey)
  const isPending = isMarking || isUnmarking
  const [expanded, setExpanded] = useState(false)

  const impacts       = computeImpact(event, graphEdges, graphNodes)
  const affectedNames = impacts.map(i => i.serviceName)
  const directHits    = impacts.filter(i => i.isDirectHit).length
  const isBreaking    = BREAKING_TYPES.has(event.changeType)
  const isAdditive    = ADDITIVE_TYPES.has(event.changeType)
  const mc            = event.httpMethod ? (METHOD_COLORS[event.httpMethod] ?? { bg: "#f1f5f9", text: "#475569" }) : null

  return (
    <div
      className="rounded-xl border transition-opacity"
      style={{
        background:  event.acknowledged ? "var(--color-background)" : "var(--color-surface)",
        borderColor: isBreaking && !event.acknowledged && directHits > 0
          ? "#fca5a5"
          : "var(--color-border)",
        opacity: event.acknowledged ? 0.55 : 1,
      }}
    >
      {/* Clickable header row */}
      <div
        className="p-4 cursor-pointer select-none"
        onClick={() => setExpanded(x => !x)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">

            {/* Change label + service + expand icon */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{
                  background: isBreaking ? "#fee2e2" : isAdditive ? "#f0fdf4" : "#f1f5f9",
                  color:      isBreaking ? "#b91c1c" : isAdditive ? "#15803d" : "#475569",
                }}
              >
                {CHANGE_LABELS[event.changeType] ?? event.changeType}
              </span>
              <span className="text-xs font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>
                {event.serviceName}
              </span>
              <span className="ml-auto" style={{ color: "var(--color-text-secondary)" }}>
                {expanded
                  ? <ChevronDown  className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />
                }
              </span>
            </div>

            {/* Endpoint */}
            {event.httpMethod && event.apiPath && mc && (
              <div className="flex items-center gap-2 mb-2">
                <MethodPill method={event.httpMethod} />
                <code className="text-xs truncate" style={{ color: "var(--color-text-primary)" }}>
                  {event.apiPath}
                </code>
              </div>
            )}

            {/* Summary: affected service pills (collapsed view) */}
            {!expanded && affectedNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                <Zap className="w-3 h-3 shrink-0" style={{ color: "#f59e0b" }} />
                <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                  {directHits > 0
                    ? `${directHits} direct hit${directHits > 1 ? "s" : ""} ·`
                    : "Affects:"
                  }
                </span>
                {affectedNames.slice(0, 3).map(name => (
                  <span
                    key={name}
                    className="text-xs px-1.5 py-0.5 rounded font-mono"
                    style={{
                      background: directHits > 0 ? "#fff7ed" : "#f1f5f9",
                      color:      directHits > 0 ? "#c2410c" : "var(--color-text-secondary)",
                    }}
                  >
                    {name}
                  </span>
                ))}
                {affectedNames.length > 3 && (
                  <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                    +{affectedNames.length - 3} more
                  </span>
                )}
                <span className="text-xs ml-1" style={{ color: "var(--color-primary)" }}>
                  click to expand
                </span>
              </div>
            )}

            {isAdditive && !expanded && (
              <p className="text-xs mt-1.5" style={{ color: "#15803d" }}>
                Additive — no callers affected
              </p>
            )}

            <p className="text-xs mt-2" style={{ color: "var(--color-text-secondary)" }}>
              {new Date(event.detectedAt).toLocaleString()}
            </p>
          </div>

          <button
            onClick={e => {
              e.stopPropagation()
              event.acknowledged ? unacknowledge(event.id) : acknowledge(event.id)
            }}
            disabled={isPending}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border transition-colors shrink-0 disabled:opacity-50"
            style={event.acknowledged
              ? { color: "var(--color-primary)", borderColor: "var(--color-primary)", background: "var(--color-primary-bg)" }
              : { color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }
            }
            title={event.acknowledged ? "Click to unmark" : "Mark as reviewed"}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {event.acknowledged ? "Marked" : "Mark it"}
          </button>
        </div>

        {/* Expanded impact panel */}
        {expanded && (
          <ImpactPanel event={event} impacts={impacts} />
        )}
      </div>
    </div>
  )
}
