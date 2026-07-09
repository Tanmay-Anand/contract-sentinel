import { Handle, Position, type NodeProps } from "@xyflow/react"
import { useDbSchema } from "../hooks/use-graph"
import type { ServiceEdgeDto } from "../../infrastructure/api/types"
import type { HandleSpec } from "../pages/graph-page"

function methodColor(method: string): { bg: string; text: string } {
  switch (method.toUpperCase()) {
    case "GET":    return { bg: "#dcfce7", text: "#15803d" }
    case "POST":   return { bg: "#dbeafe", text: "#1d4ed8" }
    case "PUT":    return { bg: "#fef9c3", text: "#a16207" }
    case "PATCH":  return { bg: "#f3e8ff", text: "#7e22ce" }
    case "DELETE": return { bg: "#fee2e2", text: "#b91c1c" }
    default:       return { bg: "#f1f5f9", text: "#475569" }
  }
}

export function humanizeBadge(edge: ServiceEdgeDto): { label: string; bg: string; text: string } {
  const p = edge.propertyName
  if (p === "shared-database") return { label: "Shared DB",     bg: "#f5f3ff", text: "#7c3aed" }
  if (p === "webhook")         return { label: "Webhook",       bg: "#fff7ed", text: "#ea580c" }
  if (p === "internal-rest")   return { label: "Internal REST", bg: "#fef9c3", text: "#ca8a04" }
  const match = p?.match(/^(\w+)\.api\.base-url$/)
  if (match) return { label: `${match[1]} API`, bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
  if (p)     return { label: p,                 bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
  return       { label: "HTTP REST",            bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
}

export function DependencyCardNode({ data }: NodeProps) {
  const edge     = data.edge     as ServiceEdgeDto
  const selected = data.selected as boolean | undefined
  const handles  = (data.handles ?? []) as HandleSpec[]
  const tgtHandle = handles.find(h => h.type === "target")
  const srcHandle = handles.find(h => h.type === "source")

  const isSharedDb = edge.propertyName === "shared-database"
  const { data: schema } = useDbSchema(isSharedDb ? edge.id : null)

  const badge        = humanizeBadge(edge)
  const calls        = edge.endpointCalls ?? []
  const visibleCalls = calls.slice(0, 5)
  const moreCalls    = calls.length - visibleCalls.length
  const tables       = schema ?? []
  const visibleTables = tables.slice(0, 7)
  const moreTables   = tables.length - visibleTables.length
  const hasContent   = isSharedDb ? tables.length > 0 : calls.length > 0

  return (
    <>
      <Handle type="target" position={Position.Left}
        {...(tgtHandle ? { id: tgtHandle.id } : {})}
        style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{
        background:  "var(--color-surface)",
        border:      `1.5px solid ${selected ? badge.text : `${badge.text}55`}`,
        borderRadius: 8,
        boxShadow:   selected
          ? `0 0 0 2px ${badge.text}33, 0 4px 12px rgba(0,0,0,0.12)`
          : "0 2px 8px rgba(0,0,0,0.08)",
        minWidth:   130,
        maxWidth:   210,
        overflow:   "hidden",
        cursor:     "pointer",
        transition: "box-shadow 0.15s",
      }}>
        {/* Header badge */}
        <div style={{
          padding:      "5px 9px",
          background:   badge.bg,
          borderBottom: hasContent ? "1px solid var(--color-border)" : undefined,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          gap: 6,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: badge.text, letterSpacing: "0.02em" }}>
            {badge.label}
          </span>
          {edge.stale && <span style={{ fontSize: 9, color: "#d97706", fontWeight: 600 }}>⚠</span>}
        </div>

        {/* SharedDB: table list */}
        {isSharedDb && tables.length > 0 && (
          <div style={{ padding: "4px 0" }}>
            {visibleTables.map(t => (
              <div key={t.tableName} style={{
                padding: "2px 9px", display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 6,
              }}>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--color-text-primary)" }}>
                  {t.tableName}
                </span>
                <span style={{ fontSize: 9, color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {t.columns.length}c
                </span>
              </div>
            ))}
            {moreTables > 0 && (
              <div style={{ padding: "2px 9px 4px", fontSize: 9, color: "var(--color-text-secondary)" }}>
                +{moreTables} more tables · <span style={{ color: badge.text }}>click for details</span>
              </div>
            )}
          </div>
        )}

        {/* REST / Webhook: endpoint call list */}
        {!isSharedDb && calls.length > 0 && (
          <div style={{ padding: "4px 0" }}>
            {visibleCalls.map((call, i) => {
              const c = methodColor(call.method)
              return (
                <div key={i} style={{ padding: "2px 9px", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                    padding: "1px 4px", borderRadius: 3,
                    background: c.bg, color: c.text,
                    flexShrink: 0, minWidth: 34, textAlign: "center" as const,
                  }}>
                    {call.method}
                  </span>
                  <span style={{
                    fontSize: 9, fontFamily: "monospace", color: "var(--color-text-secondary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {call.path}
                  </span>
                </div>
              )
            })}
            {moreCalls > 0 && (
              <div style={{ padding: "2px 9px 4px", fontSize: 9, color: "var(--color-text-secondary)" }}>
                +{moreCalls} more · <span style={{ color: badge.text }}>click for details</span>
              </div>
            )}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right}
        {...(srcHandle ? { id: srcHandle.id } : {})}
        style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  )
}
