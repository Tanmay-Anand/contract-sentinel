import { useEffect } from "react"
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge,
  BackgroundVariant, MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { DbTableNode, DB_HEADER_H, DB_NODE_W } from "./db-table-node"
import { useDbGraph } from "../hooks/use-graph"
import type { DbSchemaGroupDto, ForeignKeyDto, TableSchemaDto } from "../../infrastructure/api/types"

const dbNodeTypes = { dbTableNode: DbTableNode }

const GROUP_COLORS = ["#1e1b4b", "#14532d", "#7c2d12", "#0c4a6e", "#581c87"]

// Horizontal gap between columns, vertical gap between rows (collapsed nodes)
const COL_GAP    = 80
const ROW_GAP    = 16
const GROUP_GAP  = 140   // extra gap between FK-depth groups

// Height of a collapsed node
const COLLAPSED_H = DB_HEADER_H + ROW_GAP  // 40 + 16 = 56 px per slot

// Max tables stacked vertically before starting a new sub-column
const ROWS_PER_SUBCOL = 10

function computeDbLayout(
  tables: TableSchemaDto[],
  foreignKeys: ForeignKeyDto[],
  xOffset: number,
): Record<string, { x: number; y: number }> {
  // ── 1. Topological depth via FK edges ─────────────────────────────────────
  // fromTable depends on toTable, so toTable (parent) gets lower depth (left),
  // fromTable (child with the FK column) gets higher depth (right).
  const depth = new Map<string, number>()
  for (const t of tables) depth.set(t.tableName, 0)

  for (let pass = 0; pass < tables.length; pass++) {
    let changed = false
    for (const fk of foreignKeys) {
      if (!depth.has(fk.fromTable)) continue
      const cur       = depth.get(fk.fromTable)!
      const candidate = (depth.get(fk.toTable) ?? 0) + 1
      if (candidate > cur) { depth.set(fk.fromTable, candidate); changed = true }
    }
    if (!changed) break
  }

  // ── 2. Group tables by depth ───────────────────────────────────────────────
  const byDepth = new Map<number, TableSchemaDto[]>()
  for (const t of tables) {
    const d = depth.get(t.tableName) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(t)
  }
  const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b)

  // ── 3. Position each depth group, left to right ───────────────────────────
  const positions: Record<string, { x: number; y: number }> = {}
  let curX = xOffset

  for (const d of sortedDepths) {
    const group = [...byDepth.get(d)!].sort((a, b) => a.tableName.localeCompare(b.tableName))

    // How many sub-columns to keep this group roughly square
    const numSubCols = d === 0
      ? Math.max(1, Math.ceil(Math.sqrt(group.length)))
      : Math.max(1, Math.ceil(group.length / ROWS_PER_SUBCOL))

    for (let i = 0; i < group.length; i++) {
      const subCol = Math.floor(i / ROWS_PER_SUBCOL)
      const row    = i % ROWS_PER_SUBCOL
      positions[group[i].tableName] = {
        x: curX + subCol * (DB_NODE_W + COL_GAP),
        y: row * COLLAPSED_H,
      }
    }

    curX += numSubCols * (DB_NODE_W + COL_GAP) + GROUP_GAP
  }

  return positions
}

function buildDbNodes(groups: DbSchemaGroupDto[]): Node[] {
  const nodes: Node[] = []
  let xOffset = 0

  for (let gi = 0; gi < groups.length; gi++) {
    const g     = groups[gi]
    const color = GROUP_COLORS[gi % GROUP_COLORS.length]
    const positions = computeDbLayout(g.tables, g.foreignKeys, 0)

    let maxX = 0
    for (const t of g.tables) {
      const pos = positions[t.tableName] ?? { x: 0, y: 0 }
      if (pos.x > maxX) maxX = pos.x
      nodes.push({
        id: `${g.serviceGroupName}::${t.tableName}`,
        type: "dbTableNode",
        position: { x: xOffset + pos.x, y: pos.y },
        data: { ...t, groupColor: color },
        draggable: true,
      })
    }

    xOffset += maxX + DB_NODE_W + 300
  }
  return nodes
}

function buildDbEdges(groups: DbSchemaGroupDto[]): Edge[] {
  const edges: Edge[] = []
  for (const g of groups) {
    for (const fk of g.foreignKeys) {
      edges.push({
        id: `${g.serviceGroupName}::${fk.fromTable}.${fk.fromColumn}->${fk.toTable}.${fk.toColumn}`,
        source: `${g.serviceGroupName}::${fk.fromTable}`,
        target: `${g.serviceGroupName}::${fk.toTable}`,
        // Use table-level catch-all handles so edges always render regardless of collapsed state.
        // When a table is expanded the user can see which column the FK is on via the FK badge.
        sourceHandle: "table-source",
        targetHandle: "table-target",
        label: `${fk.fromColumn} → ${fk.toColumn}`,
        labelStyle: { fontSize: 9, fill: "#6366f1", fontFamily: "monospace" },
        labelBgStyle: { fill: "var(--color-surface)", fillOpacity: 0.85 },
        labelBgPadding: [3, 4] as [number, number],
        animated: false,
        style: { stroke: "#6366f1", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6366f1", width: 12, height: 12 },
      })
    }
  }
  return edges
}

export function DbGraphView() {
  const { data: dbGroups, isLoading, error } = useDbGraph()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    if (!dbGroups) return
    setNodes(buildDbNodes(dbGroups))
    setEdges(buildDbEdges(dbGroups))
  }, [dbGroups])

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-sm"
      style={{ color: "var(--color-text-secondary)" }}>
      Loading database schema…
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-full text-sm"
      style={{ color: "var(--color-unreachable)" }}>
      Failed to load DB schema — ensure services are running with actuator/env exposed.
    </div>
  )

  const totalTables = dbGroups?.reduce((s, g) => s + g.tables.length, 0) ?? 0
  const totalFks    = dbGroups?.reduce((s, g) => s + g.foreignKeys.length, 0) ?? 0

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Group legend */}
      {dbGroups && dbGroups.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 border-b text-xs"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
          <span style={{ color: "var(--color-text-secondary)" }}>
            {totalTables} tables · {totalFks} foreign keys
          </span>
          {dbGroups.map((g, i) => (
            <span key={g.serviceGroupName} className="flex items-center gap-1.5">
              <span style={{
                display: "inline-block", width: 10, height: 10, borderRadius: 3,
                background: GROUP_COLORS[i % GROUP_COLORS.length],
              }} />
              <span style={{ color: "var(--color-text-secondary)" }}>{g.serviceGroupName}</span>
            </span>
          ))}
          <span style={{ color: "var(--color-text-secondary)" }}>
            · click a table to expand columns
          </span>
        </div>
      )}

      <div style={{ flex: 1, position: "relative" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={dbNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.05}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
          <Controls position="top-left" />
          <MiniMap
            nodeColor={n => (n.data as any)?.groupColor ?? "#6366f1"}
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          />
        </ReactFlow>

        {/* Legend */}
        <div className="absolute bottom-4 right-4 text-xs flex items-center gap-4 px-3 py-2 rounded-lg"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <span className="flex items-center gap-1.5">
            <span style={{ fontSize: 8, color: "#f59e0b", fontWeight: 700, fontFamily: "monospace" }}>PK</span>
            Primary key
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ fontSize: 8, color: "#6366f1", fontWeight: 700, fontFamily: "monospace" }}>FK</span>
            Foreign key
          </span>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 18, borderTop: "1.5px solid #6366f1", display: "inline-block" }} />
            FK relationship
          </span>
        </div>
      </div>
    </div>
  )
}
