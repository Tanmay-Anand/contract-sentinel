import { useCallback, useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import * as monaco from "monaco-editor"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useDbGraph } from "../hooks/use-graph"
import { useServices } from "../hooks/use-services"
import { useDbQuery } from "../hooks/use-query-console"
import type { DbQueryResponse, DbSchemaGroupDto } from "../../infrastructure/api/types"

// ── Service / column color helpers ────────────────────────────────────────────

function serviceGroupColor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes("service-a") && !n.includes("report")) return "#1d4ed8"
  if (n.includes("service-b") && !n.includes("report")) return "#15803d"
  if (n.includes("platform")) return "#7c3aed"
  if (n.includes("report")) return "#d97706"
  return "#64748b"
}

function columnColor(colName: string, groups: DbSchemaGroupDto[]): string {
  for (const g of groups) {
    for (const t of g.tables) {
      if (t.columns.some(c => c.name === colName)) return serviceGroupColor(g.serviceGroupName)
    }
  }
  return "#64748b"
}

// ── FK pair detection ─────────────────────────────────────────────────────────

function detectFkPairs(cols: string[], groups: DbSchemaGroupDto[]): [number, number][] {
  const allFks = groups.flatMap(g => g.foreignKeys)
  const pairs: [number, number][] = []
  const seen = new Set<string>()
  for (const fk of allFks) {
    const i = cols.indexOf(fk.fromColumn)
    const j = cols.indexOf(fk.toColumn)
    if (i !== -1 && j !== -1) {
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`
      if (!seen.has(key)) { seen.add(key); pairs.push([i, j]) }
    }
  }
  return pairs
}

// ── Graph node type (defined outside component for stable reference) ──────────

function QueryGraphNode({ data }: NodeProps) {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          background: data.color as string,
          border: "2px solid rgba(255,255,255,0.8)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          flexShrink: 0,
        }} />
        <div style={{
          fontSize: 9, color: "var(--color-text-primary)",
          whiteSpace: "nowrap", maxWidth: 88,
          overflow: "hidden", textOverflow: "ellipsis", textAlign: "center",
          lineHeight: 1.2,
        }}>
          {String(data.label)}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, pointerEvents: "none" }} />
    </>
  )
}

const GRAPH_NODE_TYPES = { queryGraphNode: QueryGraphNode }

// ── Graph results view ────────────────────────────────────────────────────────

function GraphResultsView({ result, groups }: { result: DbQueryResponse; groups: DbSchemaGroupDto[] }) {
  const { columns, rows } = result

  // Build unique nodes per (columnIndex, value) — cap at 200
  const nodeEntries: { id: string; colIdx: number; value: string }[] = []
  const nodeSet = new Set<string>()
  let capped = false

  outer: for (const row of rows) {
    for (let ci = 0; ci < columns.length; ci++) {
      const id = `c${ci}__${String(row[ci])}`
      if (!nodeSet.has(id)) {
        if (nodeSet.size >= 200) { capped = true; break outer }
        nodeSet.add(id)
        nodeEntries.push({ id, colIdx: ci, value: String(row[ci]) })
      }
    }
  }

  const fkPairs = detectFkPairs(columns, groups)
  const noRelationships = fkPairs.length === 0

  // Build edges (deduplicated FK links between row values)
  const edgeSet = new Set<string>()
  const initEdges: Edge[] = []
  for (const row of rows) {
    for (const [ci, cj] of fkPairs) {
      const src = `c${ci}__${String(row[ci])}`
      const tgt = `c${cj}__${String(row[cj])}`
      if (!nodeSet.has(src) || !nodeSet.has(tgt)) continue
      const key = `${src}→${tgt}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        initEdges.push({
          id: key, source: src, target: tgt, type: "straight",
          label: `${columns[ci]} → ${columns[cj]}`,
          labelStyle: { fontSize: 8, fill: "#94a3b8", opacity: 0 },
          labelShowBg: false,
          style: { stroke: "#94a3b8", strokeWidth: 1 },
        })
      }
    }
  }

  const colColors = columns.map(col => columnColor(col, groups))
  const W = 640, H = 440

  const initNodes: Node[] = nodeEntries.map(n => ({
    id: n.id, type: "queryGraphNode",
    position: { x: 60 + Math.random() * (W - 120), y: 60 + Math.random() * (H - 120) },
    data: { label: n.value, color: colColors[n.colIdx] },
    draggable: true,
  }))

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes)
  const [edges, , onEdgesChange] = useEdgesState(initEdges)
  const rfRef = useRef<ReactFlowInstance | null>(null)

  // Physics simulation — runs once on mount
  useEffect(() => {
    if (nodeEntries.length === 0) return

    const pos = nodeEntries.map((_, i) => ({ id: initNodes[i].id, x: initNodes[i].position.x, y: initNodes[i].position.y }))
    const vel = pos.map(() => ({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 }))
    const idxOf: Record<string, number> = {}
    pos.forEach((p, i) => { idxOf[p.id] = i })

    const springs = initEdges
      .map(e => ({ si: idxOf[e.source], ti: idxOf[e.target] }))
      .filter(s => s.si !== undefined && s.ti !== undefined)

    const CX = W / 2, CY = H / 2
    let tick = 0
    let rafId: number

    const step = () => {
      // Repulsion between all nodes
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dx = pos[j].x - pos[i].x
          const dy = pos[j].y - pos[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
          const f = 2600 / (dist * dist)
          vel[i].x -= (dx / dist) * f;  vel[i].y -= (dy / dist) * f
          vel[j].x += (dx / dist) * f;  vel[j].y += (dy / dist) * f
        }
      }
      // Spring attraction for FK edges
      for (const { si, ti } of springs) {
        const dx = pos[ti].x - pos[si].x
        const dy = pos[ti].y - pos[si].y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1
        const f = 0.042 * (dist - 120)
        vel[si].x += (dx / dist) * f;  vel[si].y += (dy / dist) * f
        vel[ti].x -= (dx / dist) * f;  vel[ti].y -= (dy / dist) * f
      }
      // Gravity toward center
      for (let i = 0; i < pos.length; i++) {
        vel[i].x += (CX - pos[i].x) * 0.011
        vel[i].y += (CY - pos[i].y) * 0.011
        vel[i].x *= 0.87
        vel[i].y *= 0.87
        pos[i].x += vel[i].x
        pos[i].y += vel[i].y
      }

      tick++
      if (tick % 6 === 0) {
        const pm: Record<string, { x: number; y: number }> = {}
        pos.forEach(p => { pm[p.id] = { x: p.x, y: p.y } })
        setNodes(nds => nds.map(n => ({ ...n, position: pm[n.id] ?? n.position })))
      }
      if (tick < 240) {
        rafId = requestAnimationFrame(step)
      } else {
        const pm: Record<string, { x: number; y: number }> = {}
        pos.forEach(p => { pm[p.id] = { x: p.x, y: p.y } })
        setNodes(nds => nds.map(n => ({ ...n, position: pm[n.id] ?? n.position })))
        setTimeout(() => rfRef.current?.fitView({ padding: 0.15, duration: 400 }), 80)
      }
    }

    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (nodeEntries.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-secondary)", fontSize: 13 }}>
        No data to visualize
      </div>
    )
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={GRAPH_NODE_TYPES}
        onInit={inst => { rfRef.current = inst }}
        fitView minZoom={0.05}
      >
        <Background />
        <Controls />
        <MiniMap nodeColor={n => String(n.data?.color ?? "#64748b")} style={{ bottom: 8, right: 8 }} />
      </ReactFlow>
      {capped && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "#92400e" }}>
          Showing first 200 nodes
        </div>
      )}
      {noRelationships && (
        <div style={{ position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)", zIndex: 10, fontSize: 11, color: "var(--color-text-secondary)", background: "var(--color-surface)", padding: "4px 12px", borderRadius: 4, border: "1px solid var(--color-border)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          No relationships detected — showing values as nodes
        </div>
      )}
    </div>
  )
}

// ── Data results (table grid) ─────────────────────────────────────────────────

function DataResultsView({ result }: { result: DbQueryResponse }) {
  return (
    <div style={{ flex: 1, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead>
          <tr>
            {result.columns.map(col => (
              <th key={col} style={{ position: "sticky", top: 0, background: "var(--color-surface)", borderBottom: "2px solid var(--color-border)", padding: "5px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "var(--color-surface)" : "var(--color-background)" }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: "4px 10px", borderBottom: "1px solid var(--color-border)", fontSize: 11, fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "nowrap", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {cell === null || cell === undefined
                    ? <span style={{ color: "var(--color-text-secondary)", fontStyle: "italic" }}>null</span>
                    : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Results panel (tabs + content) ────────────────────────────────────────────

function ResultsPanel({ result, isLoading, error, groups, graphKey }: {
  result: DbQueryResponse | null
  isLoading: boolean
  error: Error | null
  groups: DbSchemaGroupDto[]
  graphKey: number
}) {
  const [tab, setTab] = useState<"data" | "graph">("data")

  const copyAsJson = useCallback(() => {
    if (!result) return
    const json = JSON.stringify(
      result.rows.map(row => Object.fromEntries(result.columns.map((c, i) => [c, row[i]]))),
      null, 2
    )
    void navigator.clipboard.writeText(json)
  }, [result])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header — always visible regardless of state */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)", flexShrink: 0 }}>
        <div style={{ display: "flex", borderRadius: 5, overflow: "hidden", border: "1px solid var(--color-border)" }}>
          {(["data", "graph"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "3px 10px", fontSize: 11, border: "none", background: tab === t ? "var(--color-primary)" : "var(--color-surface)", color: tab === t ? "#fff" : "var(--color-text-secondary)", cursor: "pointer", fontWeight: tab === t ? 600 : 400 }}>
              {t === "data" ? "Data results" : "Graph results"}
            </button>
          ))}
        </div>
        {result && (
          <>
            <span style={{ fontSize: 11, fontWeight: 600, background: "var(--color-primary-muted)", color: "var(--color-primary)", padding: "2px 7px", borderRadius: 10 }}>
              {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{result.executionMs}ms</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        {result && (
          <button onClick={copyAsJson} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer" }}>
            Copy as JSON
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--color-primary)", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Running query…</span>
          </div>
        )}
        {!isLoading && error && (
          <div style={{ padding: "12px 16px" }}>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "10px 14px", color: "#991b1b", fontSize: 13 }}>
              {error.message}
            </div>
          </div>
        )}
        {!isLoading && !error && !result && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--color-text-secondary)", fontSize: 13 }}>
            Run a query to see results
          </div>
        )}
        {!isLoading && !error && result && tab === "data" && <DataResultsView result={result} />}
        {!isLoading && !error && result && tab === "graph" && (
          <GraphResultsView key={graphKey} result={result} groups={groups} />
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function QueryConsole() {
  const { data: allServices } = useServices()
  const { data: dbGraph } = useDbGraph()
  const { mutate: runQuery, data: result, isPending, error } = useDbQuery()

  const [selectedServiceId, setSelectedServiceId] = useState<string>("")
  const [sql, setSql] = useState<string>("SELECT * FROM ")
  const [resultsHeight, setResultsHeight] = useState(280)
  const [graphKey, setGraphKey] = useState(0)

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const handleRunRef = useRef<() => void>(() => {})
  const resultsHeightRef = useRef(resultsHeight)
  resultsHeightRef.current = resultsHeight

  // Default to first active service
  useEffect(() => {
    if (!selectedServiceId && allServices?.length) {
      setSelectedServiceId((allServices.find(s => s.active) ?? allServices[0]).id)
    }
  }, [allServices, selectedServiceId])

  // Bump graph key on each new result so GraphResultsView remounts + re-sims
  useEffect(() => {
    if (result) setGraphKey(k => k + 1)
  }, [result])

  const selectedService = allServices?.find(s => s.id === selectedServiceId)
  const groups = dbGraph ?? []

  const handleRun = useCallback(() => {
    if (!selectedServiceId || !sql.trim()) return
    runQuery({ serviceId: selectedServiceId, sql })
  }, [selectedServiceId, sql, runQuery])

  // Keep ref in sync so Monaco's command always calls the latest version
  handleRunRef.current = handleRun

  const handleEditorMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handleRunRef.current())
  }, []) // stable — uses ref

  // Draggable divider: capture start height on mousedown, compute delta on mousemove
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = resultsHeightRef.current

    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY  // drag up = taller results panel
      setResultsHeight(Math.max(120, Math.min(600, startH + delta)))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, []) // stable — reads via ref

  const handleTableClick = useCallback((tableName: string) => {
    setSql(`SELECT * FROM ${tableName} LIMIT 50`)
    editorRef.current?.focus()
  }, [])

  const handleColumnClick = useCallback((columnName: string) => {
    setSql(prev => {
      if (/^SELECT\s+\*\s+FROM\b/i.test(prev)) return prev.replace(/^(SELECT\s+)\*(\s+FROM\b)/i, `$1${columnName}$2`)
      if (/^SELECT\s+.+\s+FROM\b/i.test(prev)) return prev.replace(/^(SELECT\s+)(.+?)(\s+FROM\b)/i, `$1$2, ${columnName}$3`)
      return prev
    })
    editorRef.current?.focus()
  }, [])

  const activeServices = allServices?.filter(s => s.active) ?? []

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "var(--color-background)" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)", flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 600, whiteSpace: "nowrap" }}>Target DB:</span>
        <select value={selectedServiceId} onChange={e => setSelectedServiceId(e.target.value)} style={{ fontSize: 12, padding: "4px 8px", borderRadius: 5, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-primary)", cursor: "pointer" }}>
          {activeServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {selectedService && <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{selectedService.baseUrl}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Ctrl+Enter to run</span>
        <button onClick={handleRun} disabled={!selectedServiceId || isPending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 5, border: "none", background: selectedServiceId ? "var(--color-primary)" : "var(--color-border)", color: selectedServiceId ? "#fff" : "var(--color-text-secondary)", fontSize: 12, fontWeight: 600, cursor: selectedServiceId ? "pointer" : "not-allowed" }}>
          ▶ Run
        </button>
      </div>

      {/* Main body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left panel: table browser */}
        <div style={{ width: 260, flexShrink: 0, borderRight: "1px solid var(--color-border)", overflowY: "auto", background: "var(--color-surface)" }}>
          {groups.length > 0 ? groups.map(group => {
            const isActive = group.serviceGroupName === selectedService?.name
            return (
              <div key={group.serviceGroupName} style={{ opacity: isActive ? 1 : 0.45 }}>
                <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", borderLeft: isActive ? "3px solid var(--color-primary)" : "3px solid transparent", background: isActive ? "var(--color-primary-bg)" : undefined }}>
                  {group.serviceGroupName}
                </div>
                {group.tables.map(table => (
                  <div key={table.tableName}>
                    <div onClick={() => handleTableClick(table.tableName)} style={{ padding: "4px 10px 4px 14px", fontSize: 11, fontFamily: "monospace", color: "var(--color-text-primary)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--color-primary-muted)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      <span>{table.tableName}</span>
                      <span style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>{table.columns.length}c</span>
                    </div>
                    {isActive && table.columns.map(col => (
                      <div key={col.name} onClick={() => handleColumnClick(col.name)} style={{ padding: "2px 10px 2px 24px", fontSize: 10, fontFamily: "monospace", color: "var(--color-text-secondary)", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--color-primary-muted)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "")}>
                        <span>{col.name}</span>
                        <span style={{ fontSize: 9 }}>{col.type}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )
          }) : (
            <div style={{ padding: 16, fontSize: 12, color: "var(--color-text-secondary)" }}>No shared databases found</div>
          )}
        </div>

        {/* Center column: editor + divider + results */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Monaco editor */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <Editor height="100%" language="sql" value={sql} onChange={val => setSql(val ?? "")} theme="vs"
              options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", wordWrap: "on", scrollBeyondLastLine: false, renderLineHighlight: "line", padding: { top: 8 } }}
              onMount={handleEditorMount}
            />
          </div>

          {/* Draggable divider */}
          <div
            onMouseDown={handleDividerMouseDown}
            style={{ height: 6, background: "var(--color-border)", cursor: "ns-resize", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--color-primary)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--color-border)")}
          >
            <div style={{ width: 28, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.5)" }} />
          </div>

          {/* Results panel */}
          <div style={{ height: resultsHeight, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ResultsPanel result={result ?? null} isLoading={isPending} error={error} groups={groups} graphKey={graphKey} />
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
