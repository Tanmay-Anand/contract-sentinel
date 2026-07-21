import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState,
  type Node, type Edge,
  BackgroundVariant, MarkerType,
  Handle, Position, type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import ELK from "elkjs/lib/elk.bundled.js"
import { Search, X, RotateCcw, ChevronRight, ZoomIn, ZoomOut, Maximize2, ArrowLeft } from "lucide-react"
import { useDbGraph } from "../hooks/use-graph"
import type { DbSchemaGroupDto, ForeignKeyDto, TableSchemaDto, ColumnDto } from "../../infrastructure/api/types"

// ── Data types ────────────────────────────────────────────────────────────────

interface EnrichedFk extends ForeignKeyDto { fromService: string }
interface EnrichedTable extends TableSchemaDto { service: string }
interface FocusNode {
  tableName: string; service: string; isRoot: boolean; isCore: boolean
  canExpand: boolean; columns: ColumnDto[]
}
interface FocusEdge extends ForeignKeyDto { isCrossService: boolean }
interface FocusGraph { nodes: FocusNode[]; edges: FocusEdge[] }

interface PhysNode {
  id: string; service: string
  x: number; y: number; vx: number; vy: number
  isCrossService: boolean
}

// ── Data helpers ──────────────────────────────────────────────────────────────

function enrichData(groups: DbSchemaGroupDto[]) {
  const tableToService: Record<string, string> = {}
  const allTables: EnrichedTable[] = []
  const allFks: EnrichedFk[] = []
  for (const g of groups) {
    for (const t of g.tables) {
      tableToService[t.tableName] = g.serviceGroupName
      allTables.push({ ...t, service: g.serviceGroupName })
    }
    for (const fk of g.foreignKeys) allFks.push({ ...fk, fromService: g.serviceGroupName })
  }
  return { tableToService, allTables, allFks }
}

function isCrossServiceFk(fk: EnrichedFk, tableToService: Record<string, string>) {
  const toSvc = tableToService[fk.toTable]
  return toSvc != null && toSvc !== fk.fromService
}

function buildFocusGraph(
  root: string, expanded: Set<string>,
  allFks: EnrichedFk[], tableToService: Record<string, string>, allTables: EnrichedTable[],
): FocusGraph {
  const core    = new Set([root, ...expanded])
  const tableMap = Object.fromEntries(allTables.map(t => [t.tableName, t]))
  const visible  = new Set(core)
  for (const t of core) {
    for (const fk of allFks) {
      if (fk.fromTable === t && tableMap[fk.toTable])   visible.add(fk.toTable)
      if (fk.toTable   === t && tableMap[fk.fromTable]) visible.add(fk.fromTable)
    }
  }
  const nodes: FocusNode[] = Array.from(visible).map(name => ({
    tableName: name, service: tableToService[name] ?? "unknown",
    isRoot: name === root, isCore: core.has(name) && name !== root,
    canExpand: !core.has(name), columns: tableMap[name]?.columns ?? [],
  }))
  const edges: FocusEdge[] = allFks
    .filter(fk => visible.has(fk.fromTable) && visible.has(fk.toTable))
    .map(fk => ({ ...fk, isCrossService: tableToService[fk.fromTable] !== tableToService[fk.toTable] }))
  return { nodes, edges }
}

// ── ELK focused layout ────────────────────────────────────────────────────────

const focusElk = new ELK()

async function runFocusElk(
  nodes: { id: string }[],
  edges: { id: string; source: string; target: string }[],
): Promise<Record<string, { x: number; y: number }>> {
  const layout = await focusElk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm":                             "layered",
      "elk.direction":                             "RIGHT",
      "elk.spacing.nodeNode":                      "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy":        "BRANDES_KOEPF",
      "elk.edgeRouting":                           "ORTHOGONAL",
    },
    children: nodes.map(n => ({ id: n.id, width: 186, height: 56 })),
    edges:    edges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  })
  const pos: Record<string, { x: number; y: number }> = {}
  for (const child of layout.children ?? []) {
    if (child.x != null && child.y != null) pos[child.id] = { x: child.x, y: child.y }
  }
  return pos
}

// ── Focus table node (ELK view) ───────────────────────────────────────────────

function svcColor(service: string) {
  if (service.includes("service-a")) return "#1e3a8a"
  if (service.includes("service-b"))  return "#166534"
  return "#6366f1"
}

interface FocusNodeData extends FocusNode {
  onExpand:    (t: string) => void
  onSetFocus:  (t: string) => void
  onCardClick: (t: string) => void
}

function DbFocusTableNode({ data }: NodeProps) {
  const d = data as FocusNodeData
  const color = svcColor(d.service)
  return (
    <>
      <Handle type="target" position={Position.Left}  style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        onClick={() => d.onCardClick(d.tableName)}
        style={{
          width: 186, background: d.isRoot ? color : "var(--color-surface)",
          border: `1.5px solid ${d.isRoot ? color : d.isCore ? color + "88" : "var(--color-border)"}`,
          borderRadius: 8, padding: "7px 10px", cursor: "pointer",
          boxShadow: d.isRoot ? `0 0 0 3px ${color}33, 0 4px 14px rgba(0,0,0,0.18)` : "0 2px 6px rgba(0,0,0,0.07)",
          userSelect: "none",
          transition: "box-shadow 0.12s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, fontFamily: "monospace",
              color: d.isRoot ? "#fff" : "var(--color-text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{d.tableName}</div>
            <div style={{ fontSize: 9, marginTop: 2, color: d.isRoot ? "rgba(255,255,255,0.65)" : "var(--color-text-secondary)" }}>
              {d.columns.length} cols · click for details
            </div>
          </div>
          {d.isRoot && (
            <span style={{ fontSize: 8, background: "rgba(255,255,255,0.2)", color: "#fff", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>root</span>
          )}
          {d.isCore && !d.isRoot && (
            <span style={{ fontSize: 8, background: color + "22", color, padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>pinned</span>
          )}
          {d.canExpand && (
            <button
              className="nodrag"
              title="Expand this table's relationships"
              onClick={e => { e.stopPropagation(); d.onExpand(d.tableName) }}
              style={{
                width: 20, height: 20, borderRadius: "50%", background: color, color: "#fff",
                border: "none", cursor: "pointer", flexShrink: 0, fontWeight: 700, fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
              }}
            >+</button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  )
}

const focusNodeTypes = { dbFocusTableNode: DbFocusTableNode }

// ── Focused ELK canvas ────────────────────────────────────────────────────────

function FocusedCanvas({
  graph, onExpand, onSetFocus, onCardClick,
}: {
  graph: FocusGraph; onExpand: (t: string) => void; onSetFocus: (t: string) => void; onCardClick: (t: string) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const rfRef = useRef<any>(null)

  useEffect(() => {
    const elkNodes = graph.nodes.map(n => ({ id: n.tableName }))
    const elkEdges = graph.edges.map(e => ({
      id: `${e.fromTable}::${e.fromColumn}→${e.toTable}::${e.toColumn}`,
      source: e.fromTable, target: e.toTable,
    }))
    runFocusElk(elkNodes, elkEdges).then(pos => {
      setNodes(graph.nodes.map(n => ({
        id: n.tableName, type: "dbFocusTableNode",
        position: pos[n.tableName] ?? { x: 0, y: 0 },
        data: { ...n, onExpand, onSetFocus, onCardClick } satisfies FocusNodeData,
      })))
      setEdges(graph.edges.map(e => {
        const edgeId = `${e.fromTable}::${e.fromColumn}→${e.toTable}::${e.toColumn}`
        const color  = e.isCrossService ? "#f59e0b" : "#6366f1"
        return {
          id: edgeId, source: e.fromTable, target: e.toTable, type: "smoothstep",
          label: `${e.fromColumn} → ${e.toColumn}`,
          labelStyle: { fontSize: 9, fill: color, fontFamily: "monospace" },
          labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.88 },
          labelBgPadding: [3, 4] as [number, number],
          style: { stroke: color, strokeWidth: e.isCrossService ? 2 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
          animated: e.isCrossService,
        }
      }))
      setTimeout(() => rfRef.current?.fitView({ padding: 0.18, duration: 350 }), 60)
    })
  }, [graph, onExpand, onSetFocus, onCardClick])

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={focusNodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        fitView fitViewOptions={{ padding: 0.18 }} minZoom={0.2} maxZoom={3}
        onInit={i => { rfRef.current = i }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
        <Controls position="top-left" />
      </ReactFlow>
    </div>
  )
}

// ── Table detail side panel ───────────────────────────────────────────────────

interface PanelTable { name: string; service: string; columns: ColumnDto[] }

function typeColor(type: string): { bg: string; text: string } {
  const t = type.toLowerCase()
  if (t.match(/bigint|integer|int|serial|smallint/)) return { bg: "#dbeafe", text: "#1d4ed8" }
  if (t.match(/varchar|text|char|string/))           return { bg: "#dcfce7", text: "#15803d" }
  if (t.match(/bool/))                               return { bg: "#fed7aa", text: "#c2410c" }
  if (t.match(/timestamp|date|time/))                return { bg: "#f3e8ff", text: "#7e22ce" }
  if (t.match(/numeric|decimal|money|float|double/)) return { bg: "#ccfbf1", text: "#0f766e" }
  if (t.match(/uuid/))                               return { bg: "#f1f5f9", text: "#475569" }
  if (t.match(/json/))                               return { bg: "#fef9c3", text: "#a16207" }
  return { bg: "var(--color-background)", text: "var(--color-text-secondary)" }
}

function TableDetailPanel({
  table, allFks, tableToService, onClose,
}: {
  table:          PanelTable
  allFks:         EnrichedFk[]
  tableToService: Record<string, string>
  onClose:        () => void
}) {
  const color       = svcColor(table.service)
  const outgoing    = allFks.filter(fk => fk.fromTable === table.name)
  const incoming    = allFks.filter(fk => fk.toTable   === table.name)
  const colFkMap    = Object.fromEntries(outgoing.map(fk => [fk.fromColumn, fk]))

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 300,
      background: "var(--color-surface)", borderLeft: "1px solid var(--color-border)",
      boxShadow: "-6px 0 24px rgba(0,0,0,0.09)", zIndex: 20,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "11px 14px 10px", borderBottom: "1px solid var(--color-border)",
        display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, fontFamily: "monospace",
            color: "var(--color-text-primary)", wordBreak: "break-all", lineHeight: 1.3,
          }}>{table.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 9, padding: "1px 7px", borderRadius: 10,
              background: color + "22", color, fontWeight: 700, letterSpacing: "0.03em",
            }}>{table.service.replace(/^crm-/, "").replace(/-api$/, "")}</span>
            <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
              {table.columns.length} columns
            </span>
            {outgoing.length > 0 && (
              <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
                {outgoing.length} FK{outgoing.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer", padding: 3, flexShrink: 0,
          color: "var(--color-text-secondary)", borderRadius: 4,
        }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* Columns */}
        <div style={{
          padding: "8px 14px 3px", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-secondary)",
        }}>Columns</div>

        {table.columns.map((col, i) => {
          const tc  = typeColor(col.type)
          const fk  = colFkMap[col.name]
          const isFk = !!fk
          return (
            <div key={i} style={{
              padding: "5px 14px", display: "flex", alignItems: "center", gap: 7,
              borderBottom: "1px solid var(--color-border)",
            }}>
              {/* Not-null / nullable dot */}
              <div title={col.nullable ? "nullable" : "not null"} style={{
                width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background:  col.nullable ? "transparent" : "#64748b",
                border:      col.nullable ? "1.5px solid #cbd5e1" : "none",
              }} />

              {/* Column name */}
              <span style={{
                flex: 1, fontSize: 11, fontFamily: "monospace",
                color: isFk ? color : "var(--color-text-primary)",
                fontWeight: isFk ? 600 : 400,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{col.name}</span>

              {/* FK target (abbreviated) */}
              {isFk && (
                <span
                  title={`→ ${fk.toTable}.${fk.toColumn}`}
                  style={{
                    fontSize: 9, color: color, flexShrink: 0,
                    maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >→ {fk.toTable}</span>
              )}

              {/* Type badge */}
              <span title={col.type} style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3, flexShrink: 0,
                background: tc.bg, color: tc.text, fontWeight: 600, fontFamily: "monospace",
                maxWidth: 82, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{col.type}</span>
            </div>
          )
        })}

        {/* Referenced by (incoming FKs) */}
        {incoming.length > 0 && (
          <>
            <div style={{
              padding: "10px 14px 3px", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-secondary)",
            }}>Referenced by</div>
            {incoming.map((fk, i) => {
              const cross = tableToService[fk.fromTable] !== table.service
              return (
                <div key={i} style={{
                  padding: "5px 14px", display: "flex", alignItems: "center", gap: 6,
                  borderBottom: "1px solid var(--color-border)", fontSize: 11,
                }}>
                  <span style={{ color: cross ? "#f59e0b" : "var(--color-text-secondary)", flexShrink: 0 }}>←</span>
                  <span style={{
                    fontFamily: "monospace", color: "var(--color-text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{fk.fromTable}</span>
                  <span style={{ color: "var(--color-text-secondary)", flexShrink: 0, fontSize: 10 }}>
                    .{fk.fromColumn}
                  </span>
                  {cross && (
                    <span style={{ fontSize: 8, color: "#f59e0b", fontWeight: 700, flexShrink: 0 }}>⬡</span>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* Legend at bottom */}
        <div style={{
          padding: "10px 14px", fontSize: 9, color: "var(--color-text-secondary)",
          display: "flex", gap: 12, flexWrap: "wrap",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#64748b", display: "inline-block" }} /> not null
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", border: "1.5px solid #cbd5e1", display: "inline-block" }} /> nullable
          </span>
          <span>→ foreign key</span>
        </div>
      </div>
    </div>
  )
}

// ── Full physics graph (canvas) ───────────────────────────────────────────────

type ServiceFilter = "both" | string | "cross-fk"

interface FullPhysicsProps {
  allTables:       EnrichedTable[]
  allFks:          EnrichedFk[]
  tableToService:  Record<string, string>
  crossFkTableSet: Set<string>
  crossFkCount:    number
  svcFilter:       ServiceFilter
  onTableClick:    (t: string) => void
  cachedPositions: Record<string, { x: number; y: number }> | null
  onPositionsSave: (p: Record<string, { x: number; y: number }>) => void
}

function FullPhysicsGraph({
  allTables, allFks, tableToService, crossFkTableSet, crossFkCount,
  svcFilter, onTableClick, cachedPositions, onPositionsSave,
}: FullPhysicsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)

  // All mutable simulation state lives here — no setState to avoid re-renders
  const sRef = useRef({
    nodes:   [] as PhysNode[],
    tick:    0,
    animId:  null as number | null,
    settled: false,
    panX: 0, panY: 0, zoom: 1,
    drag: { active: false, mx: 0, my: 0, px: 0, py: 0, moved: false },
  })

  // Mirror props into ref so rAF callbacks always see latest values
  const pRef = useRef({ allFks, tableToService, crossFkTableSet, svcFilter, onTableClick, onPositionsSave })
  pRef.current = { allFks, tableToService, crossFkTableSet, svcFilter, onTableClick, onPositionsSave }

  // ── Draw ──────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { nodes, panX, panY, zoom } = sRef.current
    const { allFks, tableToService, crossFkTableSet, svcFilter } = pRef.current
    const W = canvas.width, H = canvas.height

    // Background
    ctx.fillStyle = "#f8fafc"
    ctx.fillRect(0, 0, W, H)

    // Dot grid (screen-space — shifts with pan, doesn't scale)
    ctx.fillStyle = "#dde3ea"
    const spacing = 22
    const ox = ((panX + W / 2) % spacing + spacing) % spacing
    const oy = ((panY + H / 2) % spacing + spacing) % spacing
    for (let gx = ox - spacing; gx < W + spacing; gx += spacing)
      for (let gy = oy - spacing; gy < H + spacing; gy += spacing) {
        ctx.beginPath(); ctx.arc(gx, gy, 1, 0, Math.PI * 2); ctx.fill()
      }

    ctx.save()
    ctx.translate(W / 2 + panX, H / 2 + panY)
    ctx.scale(zoom, zoom)

    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    function getOpacity(id: string): number {
      if (svcFilter === "both") return 1
      if (svcFilter === "cross-fk") return crossFkTableSet.has(id) ? 1 : 0.15
      return (tableToService[id] ?? "") === svcFilter ? 1 : 0.15
    }

    // Edges
    for (const fk of allFks) {
      const a = nodeMap.get(fk.fromTable), b = nodeMap.get(fk.toTable)
      if (!a || !b) continue
      const op    = Math.min(getOpacity(a.id), getOpacity(b.id))
      const cross = tableToService[fk.fromTable] !== tableToService[fk.toTable]
      const hiCross = cross && svcFilter === "cross-fk"
      ctx.globalAlpha = op * (hiCross ? 0.9 : 0.35)
      ctx.strokeStyle = hiCross ? "#f59e0b" : "#94a3b8"
      ctx.lineWidth   = hiCross ? 1.8 : 0.8
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    // Nodes
    const R = 7
    for (const node of nodes) {
      const op    = getOpacity(node.id)
      const color = node.service.includes("service-a") ? "#1e3a8a"
                  : node.service.includes("service-b")  ? "#166534"
                  : "#6366f1"

      // Cross-service amber ring
      if (node.isCrossService) {
        ctx.globalAlpha = op * (svcFilter === "cross-fk" ? 0.95 : 0.35)
        ctx.beginPath()
        ctx.arc(node.x, node.y, R + 3.5, 0, Math.PI * 2)
        ctx.strokeStyle = "#f59e0b"
        ctx.lineWidth   = 1.5
        ctx.stroke()
      }

      ctx.globalAlpha = op
      ctx.beginPath()
      ctx.arc(node.x, node.y, R, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()

      // Label only when zoomed in past threshold
      if (zoom > 1.4) {
        ctx.globalAlpha = op * 0.9
        ctx.fillStyle   = color
        ctx.font        = `${Math.max(7, Math.round(10 / zoom))}px monospace`
        ctx.textAlign   = "center"
        ctx.fillText(node.id, node.x, node.y + R + 11 / zoom)
      }
    }

    ctx.globalAlpha = 1
    ctx.restore()
  }, [])

  // ── Fit to screen ─────────────────────────────────────────────────────────

  const fitScreen = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const nodes = sRef.current.nodes
    if (!nodes.length) return
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y)
    const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30
    const minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30
    const bW = maxX - minX, bH = maxY - minY
    const zoom = Math.min(canvas.width / bW, canvas.height / bH, 3) * 0.88
    sRef.current.zoom = zoom
    sRef.current.panX = -(minX + bW / 2) * zoom
    sRef.current.panY = -(minY + bH / 2) * zoom
    draw()
  }, [draw])

  // ── Physics tick ──────────────────────────────────────────────────────────

  const runTick = useCallback(() => {
    const s     = sRef.current
    const nodes = s.nodes
    const alpha = Math.max(0.03, 1 - s.tick / 200)

    nodes.forEach(n => { n.vx = 0; n.vy = 0 })

    // Repulsion O(n²) — fine for ≤200 nodes
    const REP = 2800
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const d2 = (dx * dx + dy * dy) || 0.01
        const d  = Math.sqrt(d2)
        const f  = (REP * alpha) / d2
        a.vx += f * dx / d; a.vy += f * dy / d
        b.vx -= f * dx / d; b.vy -= f * dy / d
      }
    }

    // FK edge attraction
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const K_ATTR = 0.055, REST = 95
    for (const fk of pRef.current.allFks) {
      const a = nodeMap.get(fk.fromTable), b = nodeMap.get(fk.toTable)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d  = Math.sqrt(dx * dx + dy * dy) || 1
      const f  = K_ATTR * (d - REST) * alpha / d
      a.vx += f * dx; a.vy += f * dy
      b.vx -= f * dx; b.vy -= f * dy
    }

    // Center gravity — keeps graph from drifting off canvas
    const G = 0.012
    nodes.forEach(n => {
      n.vx -= n.x * G * alpha
      n.vy -= n.y * G * alpha
    })

    // Integrate with damping
    const DAMP = 0.82
    nodes.forEach(n => {
      n.x += n.vx * DAMP
      n.y += n.vy * DAMP
    })
  }, [])

  // ── Simulation ────────────────────────────────────────────────────────────

  const startSim = useCallback(() => {
    const s = sRef.current
    if (s.animId) cancelAnimationFrame(s.animId)
    s.tick = 0; s.settled = false
    const MAX = 200

    const tick = () => {
      s.tick++
      runTick()
      draw()
      if (s.tick < MAX) {
        s.animId = requestAnimationFrame(tick)
      } else {
        s.settled = true; s.animId = null
        fitScreen()
        const pos: Record<string, { x: number; y: number }> = {}
        s.nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y } })
        pRef.current.onPositionsSave(pos)
      }
    }
    s.animId = requestAnimationFrame(tick)
  }, [runTick, draw, fitScreen])

  // ── Initialize + resize (single ResizeObserver-driven effect) ────────────
  // ResizeObserver always fires with the browser's settled layout dimensions,
  // avoiding the stale-offsetWidth problem that plagues useEffect + rAF.

  useEffect(() => {
    if (!allTables.length) return
    const s       = sRef.current
    const canvas  = canvasRef.current!
    const container = containerRef.current!

    // Mark nodes as uninitialised so the first observer callback inits them
    s.nodes   = []
    s.settled = false
    if (s.animId) { cancelAnimationFrame(s.animId); s.animId = null }

    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      const h = Math.round(entry.contentRect.height)
      if (!w || !h) return

      // Always keep canvas resolution in sync with container
      canvas.width  = w
      canvas.height = h

      if (s.nodes.length === 0) {
        // ── First callback with valid size: initialise nodes ──────────────
        const { cachedPositions: cp, crossFkTableSet: cks } = pRef.current

        if (cp && Object.keys(cp).length >= allTables.length * 0.8) {
          s.nodes = allTables.map(t => ({
            id: t.tableName, service: t.service,
            x: cp[t.tableName]?.x ?? (Math.random() - 0.5) * w * 0.4,
            y: cp[t.tableName]?.y ?? (Math.random() - 0.5) * h * 0.4,
            vx: 0, vy: 0,
            isCrossService: cks.has(t.tableName),
          }))
          s.settled = true
          fitScreen()
        } else {
          // Scatter across 75 % of full canvas so nodes fill edge-to-edge
          s.nodes = allTables.map(t => ({
            id: t.tableName, service: t.service,
            x: (Math.random() - 0.5) * w * 0.75,
            y: (Math.random() - 0.5) * h * 0.75,
            vx: 0, vy: 0,
            isCrossService: cks.has(t.tableName),
          }))
          startSim()
        }
      } else if (s.settled) {
        // ── Subsequent resize: just redraw ────────────────────────────────
        draw()
      }
    })

    ro.observe(container)

    return () => {
      ro.disconnect()
      if (s.animId) cancelAnimationFrame(s.animId)
    }
  }, [allTables, startSim, fitScreen, draw])

  // Redraw when filter changes (simulation may have settled)
  useEffect(() => {
    if (sRef.current.settled) draw()
  }, [svcFilter, draw])

  // ── Mouse / wheel events ──────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current!

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s   = sRef.current
      const factor  = e.deltaY < 0 ? 1.15 : 1 / 1.15
      const newZoom = Math.max(0.12, Math.min(8, s.zoom * factor))
      const rect = canvas.getBoundingClientRect()
      const mx   = e.clientX - rect.left
      const my   = e.clientY - rect.top
      const ratio = newZoom / s.zoom
      s.panX = (mx - canvas.width / 2) * (1 - ratio) + s.panX * ratio
      s.panY = (my - canvas.height / 2) * (1 - ratio) + s.panY * ratio
      s.zoom = newZoom
      draw()
    }

    const onMouseDown = (e: MouseEvent) => {
      const s = sRef.current
      s.drag = { active: true, mx: e.clientX, my: e.clientY, px: s.panX, py: s.panY, moved: false }
      canvas.style.cursor = "grabbing"
    }

    const onMouseMove = (e: MouseEvent) => {
      const s = sRef.current
      if (s.drag.active) {
        const dx = e.clientX - s.drag.mx, dy = e.clientY - s.drag.my
        if (!s.drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) s.drag.moved = true
        if (s.drag.moved) {
          s.panX = s.drag.px + dx
          s.panY = s.drag.py + dy
          draw()
        }
        return
      }
      // Hover cursor
      const rect = canvas.getBoundingClientRect()
      const wx = (e.clientX - rect.left  - canvas.width  / 2 - s.panX) / s.zoom
      const wy = (e.clientY - rect.top   - canvas.height / 2 - s.panY) / s.zoom
      const hit = s.nodes.some(n => Math.hypot(n.x - wx, n.y - wy) < 12)
      canvas.style.cursor = hit ? "pointer" : "grab"
    }

    const onMouseUp = (e: MouseEvent) => {
      const s = sRef.current
      if (s.drag.active && !s.drag.moved) {
        const rect = canvas.getBoundingClientRect()
        const wx = (e.clientX - rect.left  - canvas.width  / 2 - s.panX) / s.zoom
        const wy = (e.clientY - rect.top   - canvas.height / 2 - s.panY) / s.zoom
        const hit = s.nodes.find(n => Math.hypot(n.x - wx, n.y - wy) < 12)
        if (hit) {
          if (s.animId) { cancelAnimationFrame(s.animId); s.animId = null }
          const pos: Record<string, { x: number; y: number }> = {}
          s.nodes.forEach(n => { pos[n.id] = { x: n.x, y: n.y } })
          pRef.current.onPositionsSave(pos)
          pRef.current.onTableClick(hit.id)
        }
      }
      s.drag.active = false
      canvas.style.cursor = "grab"
    }

    canvas.addEventListener("wheel",     onWheel,     { passive: false })
    canvas.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup",   onMouseUp)
    return () => {
      canvas.removeEventListener("wheel",     onWheel)
      canvas.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup",   onMouseUp)
    }
  }, [draw])

  return (
    <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block", cursor: "grab" }} />

      {/* Zoom controls */}
      <div style={{
        position: "absolute", top: 12, left: 12, display: "flex", flexDirection: "column",
        background: "var(--color-surface)", border: "1px solid var(--color-border)",
        borderRadius: 6, overflow: "hidden",
      }}>
        {[
          { icon: <ZoomIn style={{ width: 13, height: 13 }} />,   action: () => { sRef.current.zoom = Math.min(8, sRef.current.zoom * 1.2); draw() } },
          { icon: <ZoomOut style={{ width: 13, height: 13 }} />,  action: () => { sRef.current.zoom = Math.max(0.12, sRef.current.zoom / 1.2); draw() } },
          { icon: <Maximize2 style={{ width: 12, height: 12 }} />, action: fitScreen },
        ].map((btn, i) => (
          <button key={i} onClick={btn.action} style={{
            width: 28, height: 28, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--color-text-secondary)",
            borderTop: i > 0 ? "1px solid var(--color-border)" : undefined,
          }}>{btn.icon}</button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: crossFkCount > 0 ? 52 : 12, right: 12, fontSize: 10,
        display: "flex", alignItems: "center", gap: 10, padding: "4px 9px",
        background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 6,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#1e3a8a", display: "inline-block" }} /> service-a
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#166534", display: "inline-block" }} /> service-b
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", border: "2px solid #f59e0b", display: "inline-block" }} /> cross-FK
        </span>
        <span style={{ color: "var(--color-text-secondary)", borderLeft: "1px solid var(--color-border)", paddingLeft: 8 }}>
          scroll to zoom · click node to explore
        </span>
      </div>

      {/* Cross-FK banner */}
      {crossFkCount > 0 && (
        <div style={{
          position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          fontSize: 11, padding: "5px 12px", borderRadius: 6, whiteSpace: "nowrap",
          background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e",
        }}>
          ⬡ {crossFkCount} cross-service FK{crossFkCount > 1 ? "s" : ""} detected — filter by "Cross-FK" to find them
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DbSchemaExplorer() {
  const { data: groups, isLoading, error } = useDbGraph()

  const [search,         setSearch]         = useState("")
  const [svcFilter,      setSvcFilter]      = useState<ServiceFilter>("both")
  const [view,           setView]           = useState<"full" | "focused">("full")
  const [focusedTable,   setFocusedTable]   = useState<string | null>(null)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [cachedPositions, setCachedPositions] = useState<Record<string, { x: number; y: number }> | null>(null)
  const [panelTable,      setPanelTable]      = useState<PanelTable | null>(null)

  const { tableToService, allTables, allFks, crossFkTableSet, crossFkCount, groupNames } = useMemo(() => {
    if (!groups) return { tableToService: {}, allTables: [], allFks: [], crossFkTableSet: new Set<string>(), crossFkCount: 0, groupNames: [] }
    const { tableToService, allTables, allFks } = enrichData(groups)
    const crossFks       = allFks.filter(fk => isCrossServiceFk(fk, tableToService))
    const crossFkTableSet = new Set(crossFks.flatMap(fk => [fk.fromTable, fk.toTable]))
    return { tableToService, allTables, allFks, crossFkTableSet, crossFkCount: crossFks.length, groupNames: groups.map(g => g.serviceGroupName) }
  }, [groups])

  const focusGraph = useMemo(() => {
    if (!focusedTable) return null
    return buildFocusGraph(focusedTable, expandedTables, allFks, tableToService, allTables)
  }, [focusedTable, expandedTables, allFks, tableToService, allTables])

  const handleTableClick = useCallback((t: string) => {
    setFocusedTable(t)
    setExpandedTables(new Set())
    setView("focused")
  }, [])

  const handleBack = useCallback(() => {
    setView("full")
    // keep focusedTable for left-panel highlight
  }, [])

  const handleExpand = useCallback((t: string) => {
    setExpandedTables(prev => new Set([...prev, t]))
  }, [])

  const handleSetFocus = useCallback((t: string) => {
    setFocusedTable(t)
    setExpandedTables(new Set())
  }, [])

  const handleCardClick = useCallback((t: string) => {
    if (!groups) return
    for (const g of groups) {
      const found = g.tables.find(tbl => tbl.tableName === t)
      if (found) { setPanelTable({ name: t, service: g.serviceGroupName, columns: found.columns }); return }
    }
  }, [groups])

  const totalTables = allTables.length
  const totalFks    = allFks.length

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--color-text-secondary)" }}>
      Loading database schema…
    </div>
  )
  if (error || !groups) return (
    <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--color-unreachable)" }}>
      Failed to load DB schema — ensure services are running with actuator/env exposed.
    </div>
  )

  function shortName(s: string) { return s.replace(/^crm-/, "").replace(/-api$/, "") }
  function dotColor(s: string) {
    if (s.includes("service-a")) return "#1e3a8a"
    if (s.includes("service-b"))  return "#166534"
    return "#6366f1"
  }

  const q = search.trim().toLowerCase()
  const filteredByGroup = Object.fromEntries(
    (groups ?? []).map(g => {
      const tables = g.tables.filter(t => {
        if (q && !t.tableName.includes(q)) return false
        if (svcFilter === "cross-fk" && !crossFkTableSet.has(t.tableName)) return false
        return true
      })
      return [g.serviceGroupName, tables]
    })
  )

  return (
    <div style={{ display: "flex", flex: 1, minWidth: 0, height: "100%", overflow: "hidden" }}>

      {/* ── LEFT: table list ──────────────────────────────────────────────── */}
      <div style={{
        width: 280, display: "flex", flexDirection: "column", flexShrink: 0,
        borderRight: "1px solid var(--color-border)", background: "var(--color-surface)",
      }}>
        {/* Search */}
        <div style={{ padding: "10px 10px 6px" }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "var(--color-text-secondary)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tables…"
              style={{
                width: "100%", paddingLeft: 28, paddingRight: search ? 28 : 10,
                paddingTop: 6, paddingBottom: 6, fontSize: 12,
                border: "1px solid var(--color-border)", borderRadius: 6,
                background: "var(--color-background)", color: "var(--color-text-primary)",
                outline: "none", boxSizing: "border-box",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}>
                <X style={{ width: 12, height: 12, color: "var(--color-text-secondary)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Filter buttons */}
        <div style={{ display: "flex", gap: 4, padding: "0 10px 8px", flexWrap: "wrap" }}>
          {[
            { key: "both", label: "Both" },
            ...groupNames.map(n => ({ key: n, label: shortName(n) })),
            { key: "cross-fk", label: `Cross-FK (${crossFkCount})` },
          ].map(btn => (
            <button key={btn.key} onClick={() => setSvcFilter(btn.key)} style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer", border: "1px solid",
              borderColor: svcFilter === btn.key ? "var(--color-primary)" : "var(--color-border)",
              background:  svcFilter === btn.key ? "var(--color-primary-bg)" : "transparent",
              color:       svcFilter === btn.key ? "var(--color-primary)" : "var(--color-text-secondary)",
              fontWeight:  svcFilter === btn.key ? 600 : 400,
            }}>{btn.label}</button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ padding: "0 12px 8px", fontSize: 10, color: "var(--color-text-secondary)" }}>
          {totalTables} tables · {totalFks} FKs · {crossFkCount} cross-service
        </div>

        {/* Table list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {(groups ?? [])
            .filter(g => svcFilter === "both" || svcFilter === "cross-fk" || svcFilter === g.serviceGroupName)
            .map(g => {
              const tables = filteredByGroup[g.serviceGroupName] ?? []
              if (!tables.length) return null
              const color = dotColor(g.serviceGroupName)
              return (
                <div key={g.serviceGroupName}>
                  <div style={{
                    padding: "5px 12px 4px", fontSize: 10, fontWeight: 700,
                    letterSpacing: "0.04em", textTransform: "uppercase",
                    color, display: "flex", alignItems: "center", gap: 6,
                    borderTop: "1px solid var(--color-border)", background: color + "12",
                    position: "sticky", top: 0, zIndex: 1,
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                    {shortName(g.serviceGroupName)}
                    <span style={{ fontWeight: 400, color: color + "aa", marginLeft: "auto" }}>{tables.length}</span>
                  </div>
                  {tables.map(t => {
                    const isActive = view === "focused" && focusedTable === t.tableName
                    const isCross  = crossFkTableSet.has(t.tableName)
                    return (
                      <div
                        key={t.tableName} onClick={() => handleTableClick(t.tableName)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "4px 12px 4px 20px", cursor: "pointer",
                          background: isActive ? color + "18" : "transparent",
                          borderLeft: isActive ? `2px solid ${color}` : "2px solid transparent",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--color-background)" }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                      >
                        <span style={{
                          fontSize: 11, fontFamily: "monospace", flex: 1,
                          color: isActive ? color : "var(--color-text-primary)",
                          fontWeight: isActive ? 600 : 400,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{t.tableName}</span>
                        {isCross && <span style={{ fontSize: 8, color: "#f59e0b", fontWeight: 700, flexShrink: 0 }} title="Cross-service FK">⬡</span>}
                        <span style={{ fontSize: 10, color: "var(--color-text-secondary)", flexShrink: 0 }}>{t.columns.length}c</span>
                        {isActive && <ChevronRight style={{ width: 10, height: 10, color, flexShrink: 0 }} />}
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </div>
      </div>

      {/* ── RIGHT: graph canvas ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {view === "focused" && focusedTable && focusGraph ? (
          <>
            {/* Breadcrumb bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", flexShrink: 0,
              borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)",
            }}>
              <button
                onClick={handleBack}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-text-secondary)",
                }}
              >
                <ArrowLeft style={{ width: 10, height: 10 }} /> Back to full graph
              </button>

              <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Exploring:</span>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: dotColor(tableToService[focusedTable] ?? "") }}>
                {focusedTable}
              </span>

              {expandedTables.size > 0 && (
                <>
                  <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>+</span>
                  {Array.from(expandedTables).map(t => (
                    <span key={t} style={{
                      display: "flex", alignItems: "center", gap: 3, fontSize: 10, fontFamily: "monospace",
                      background: "var(--color-background)", border: "1px solid var(--color-border)",
                      borderRadius: 4, padding: "1px 5px", color: "var(--color-text-secondary)",
                    }}>
                      {t}
                      <button
                        onClick={() => setExpandedTables(prev => { const n = new Set(prev); n.delete(t); return n })}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
                      >
                        <X style={{ width: 9, height: 9, color: "var(--color-text-secondary)" }} />
                      </button>
                    </span>
                  ))}
                </>
              )}

              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>
                {focusGraph.nodes.length} tables · {focusGraph.edges.length} FKs
                {focusGraph.edges.some(e => e.isCrossService) && (
                  <span style={{ color: "#f59e0b", marginLeft: 6 }}>⬡ cross-service</span>
                )}
              </span>
              <button
                onClick={() => { setFocusedTable(null); setExpandedTables(new Set()); setView("full") }}
                style={{
                  display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "3px 8px",
                  borderRadius: 4, cursor: "pointer", border: "1px solid var(--color-border)",
                  background: "transparent", color: "var(--color-text-secondary)",
                }}
              >
                <RotateCcw style={{ width: 10, height: 10 }} /> Reset
              </button>
            </div>

            <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
              <FocusedCanvas graph={focusGraph} onExpand={handleExpand} onSetFocus={handleSetFocus} onCardClick={handleCardClick} />
              {panelTable && (
                <TableDetailPanel
                  table={panelTable}
                  allFks={allFks}
                  tableToService={tableToService}
                  onClose={() => setPanelTable(null)}
                />
              )}

              {/* Focus legend */}
              <div style={{
                position: "absolute", bottom: 12, right: 12, fontSize: 10,
                display: "flex", alignItems: "center", gap: 12, padding: "5px 10px",
                borderRadius: 6, background: "var(--color-surface)", border: "1px solid var(--color-border)",
              }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, borderTop: "1.5px solid #6366f1", display: "inline-block" }} /> FK
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, borderTop: "2px solid #f59e0b", display: "inline-block" }} />
                  <span style={{ color: "#f59e0b" }}>cross-service FK</span>
                </span>
                <span style={{ color: "var(--color-text-secondary)" }}>
                  Click <strong>+</strong> to expand one hop
                </span>
              </div>
            </div>
          </>
        ) : (
          <FullPhysicsGraph
            allTables={allTables}
            allFks={allFks}
            tableToService={tableToService}
            crossFkTableSet={crossFkTableSet}
            crossFkCount={crossFkCount}
            svcFilter={svcFilter}
            onTableClick={handleTableClick}
            cachedPositions={cachedPositions}
            onPositionsSave={setCachedPositions}
          />
        )}
      </div>
    </div>
  )
}
