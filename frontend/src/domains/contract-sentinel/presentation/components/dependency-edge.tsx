import { useRef } from "react"
import { BaseEdge, EdgeLabelRenderer, getBezierPath, Position, useReactFlow, type EdgeProps } from "@xyflow/react"
import { useDbSchema } from "../hooks/use-graph"
import type { ServiceEdgeDto } from "../../infrastructure/api/types"

// Build a two-segment bezier path that routes through (midX, midY).
// When offset is {dx:0, dy:0} and midX/midY is the true bezier midpoint this
// looks identical to the default single bezier.
function pathThroughPoint(
  sourceX: number, sourceY: number, sourcePosition: Position,
  targetX: number, targetY: number, targetPosition: Position,
  midX: number, midY: number,
): string {
  const [seg1] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX: midX, targetY: midY,
    targetPosition: Position.Left,
  })
  const [seg2] = getBezierPath({
    sourceX: midX, sourceY: midY, sourcePosition: Position.Right,
    targetX, targetY, targetPosition,
  })
  return `${seg1} ${seg2}`
}

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

function humanizeBadge(edge: ServiceEdgeDto): { label: string; bg: string; text: string } {
  const p = edge.propertyName
  if (p === "shared-database") return { label: "Shared DB",     bg: "#f5f3ff", text: "#7c3aed" }
  if (p === "webhook")         return { label: "Webhook",       bg: "#fff7ed", text: "#ea580c" }
  if (p === "internal-rest")   return { label: "Internal REST", bg: "#fef9c3", text: "#ca8a04" }
  const match = p?.match(/^(\w+)\.api\.base-url$/)
  if (match) return { label: `${match[1]} API`, bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
  if (p)     return { label: p,                 bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
  return       { label: "HTTP REST",            bg: "var(--color-primary-muted)", text: "var(--color-primary)" }
}

export function DependencyEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, style, markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow()
  const isDragging = useRef(false)

  const edge = data?.edge as ServiceEdgeDto | undefined
  const onCardClick = data?.onCardClick as ((edge: ServiceEdgeDto) => void) | undefined
  const offset = (data?.labelOffset as { dx: number; dy: number } | undefined) ?? { dx: 0, dy: 0 }

  const isSharedDb = edge?.propertyName === "shared-database"
  const { data: schema } = useDbSchema(isSharedDb && edge ? edge.id : null)

  const [, labelX, labelY] = getBezierPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  })

  if (!edge) {
    const [fallbackPath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    return <BaseEdge id={id} path={fallbackPath} style={style} markerEnd={markerEnd} />
  }

  const badge = humanizeBadge(edge)
  const calls = edge.endpointCalls ?? []
  const visibleCalls = calls.slice(0, 5)
  const moreCalls = calls.length - visibleCalls.length

  const tables = schema ?? []
  const visibleTables = tables.slice(0, 7)
  const moreTables = tables.length - visibleTables.length

  const hasContent = isSharedDb ? tables.length > 0 : calls.length > 0

  function handlePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startDx = offset.dx
    const startDy = offset.dy
    isDragging.current = false

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        isDragging.current = true
      }
      if (isDragging.current) {
        setEdges(edges => edges.map(edge =>
          edge.id === id
            ? { ...edge, data: { ...edge.data, labelOffset: { dx: startDx + dx, dy: startDy + dy } } }
            : edge
        ))
      }
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
    }

    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
  }

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isDragging.current) {
      onCardClick?.(edge)
    }
  }

  const posX = labelX + offset.dx
  const posY = labelY + offset.dy

  const edgePath = pathThroughPoint(
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    posX, posY,
  )

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${posX}px,${posY}px)`,
            pointerEvents: "all",
            zIndex: 10,
            cursor: isDragging.current ? "grabbing" : "grab",
            userSelect: "none",
          }}
        >
          <div style={{
            background: "var(--color-surface)",
            border: `1.5px solid ${badge.text}33`,
            borderRadius: 8,
            boxShadow: "0 2px 10px rgba(0,0,0,0.10)",
            minWidth: 130,
            maxWidth: 210,
            overflow: "hidden",
          }}>
            {/* Header badge */}
            <div style={{
              padding: "5px 9px",
              background: badge.bg,
              borderBottom: hasContent ? "1px solid var(--color-border)" : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: badge.text, letterSpacing: "0.02em" }}>
                {badge.label}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {edge.stale && (
                  <span style={{ fontSize: 9, color: "#d97706", fontWeight: 600 }}>⚠</span>
                )}
                {/* Drag grip dots */}
                <span style={{ fontSize: 9, color: badge.text, opacity: 0.5, letterSpacing: "-1px" }}>⠿</span>
              </span>
            </div>

            {/* Shared DB: table list */}
            {isSharedDb && tables.length > 0 && (
              <div style={{ padding: "4px 0" }}>
                {visibleTables.map(t => (
                  <div key={t.tableName} style={{
                    padding: "2px 9px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
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

            {/* REST / Webhook / Internal REST: endpoint call list */}
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
                        flexShrink: 0, minWidth: 34, textAlign: "center",
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
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
