import { useState, useCallback, useEffect, useRef } from "react"
import ELK from "elkjs/lib/elk.bundled.js"
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeChange, type ReactFlowInstance,
  BackgroundVariant, MarkerType,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useNavigate } from "@tanstack/react-router"
import {
  RefreshCw, Plus, Trash2, GitBranch, AlertTriangle,
  X, ArrowRight, Database, ChevronRight, Zap, Code2,
} from "lucide-react"
import { ServiceGraphNode } from "../components/service-graph-node"
import { DependencyCardNode } from "../components/dependency-card-node"
import { DbSchemaExplorer } from "../components/db-schema-explorer"
import { QueryConsole } from "../components/query-console"
import { useGraph, useScanGraph, useBlastRadius, useAddManualEdge, useRemoveEdge, useDbSchema } from "../hooks/use-graph"
import { useServices } from "../hooks/use-services"
import { useDriftEvents } from "../hooks/use-drift"
import type { ServiceNodeDto, ServiceEdgeDto } from "../../infrastructure/api/types"

const nodeTypes = { serviceNode: ServiceGraphNode, dependencyCardNode: DependencyCardNode }

// Module-level: survive tab switches (component unmount/remount)
// Bump LAYOUT_VERSION whenever the default layout algorithm changes — forces a fresh layout.
const LAYOUT_VERSION = 8
const _savedVersion = (globalThis as any).__graphLayoutVersion
if (_savedVersion !== LAYOUT_VERSION) {
  (globalThis as any).__graphLayoutVersion = LAYOUT_VERSION
  ;(globalThis as any).__savedPositions = {}
  ;(globalThis as any).__graphInitialized = false
}
const savedPositions: Record<string, { x: number; y: number }> = (globalThis as any).__savedPositions
let graphInitialized: boolean = (globalThis as any).__graphInitialized

const elk = new ELK()

function detectCycles(edges: { source: string; target: string }[]): string[] {
  const adj = new Map<string, string[]>()
  edges.forEach(e => {
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  })
  const visited = new Set<string>()
  const stack   = new Set<string>()
  const cycles: string[] = []
  function dfs(node: string) {
    visited.add(node); stack.add(node)
    for (const nb of adj.get(node) ?? []) {
      if (!visited.has(nb)) dfs(nb)
      else if (stack.has(nb)) cycles.push(`${node} → ${nb}`)
    }
    stack.delete(node)
  }
  adj.forEach((_, n) => { if (!visited.has(n)) dfs(n) })
  return cycles
}

async function computeElkLayout(
  elkNodes: { id: string; width: number; height: number; ports?: { id: string; side: "WEST" | "EAST" }[] }[],
  elkEdges: { id: string; source: string; target: string; sourcePort: string; targetPort: string }[],
): Promise<Record<string, { x: number; y: number }>> {
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm":                             "layered",
      "elk.direction":                             "RIGHT",
      "elk.spacing.nodeNode":                      "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.spacing.edgeNode":                      "20",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy":        "BRANDES_KOEPF",
      "elk.edgeRouting":                           "ORTHOGONAL",
      "elk.layered.unnecessaryBendpoints":         "true",
      "elk.layered.cycleBreaking.strategy":        "GREEDY",
    },
    children: elkNodes.map(n => ({
      id: n.id, width: n.width, height: n.height,
      ports: (n.ports ?? []).map(p => ({ id: p.id, properties: { "port.side": p.side } })),
      properties: { "portConstraints": "FIXED_SIDE" },
    })),
    edges: elkEdges.map(e => ({
      id: e.id,
      sources: [e.sourcePort],
      targets: [e.targetPort],
    })),
  }

  const layout = await elk.layout(graph)
  const positions: Record<string, { x: number; y: number }> = {}
  for (const child of layout.children ?? []) {
    if (child.x != null && child.y != null) {
      positions[child.id] = { x: child.x, y: child.y }
    }
  }
  return positions
}

function estimateRelaySize(edge: ServiceEdgeDto): { width: number; height: number } {
  if (edge.propertyName === "shared-database") {
    return { width: 220, height: 210 }
  }
  const calls = edge.endpointCalls?.length ?? 0
  if (calls === 0) return { width: 200, height: 56 }
  const visible = Math.min(calls, 5)
  return { width: 240, height: 56 + visible * 22 + (calls > 5 ? 18 : 0) }
}

interface GraphElements { relayNodes: Node[]; allEdges: Edge[] }

// Converts each ServiceEdgeDto into:
//   • a relay node (the dependency card)
//   • an edge from source service → relay node
//   • an edge from relay node → target service
// This lets ELK position cards as proper intermediate nodes in the layered layout.
function buildGraphElements(apiEdges: ServiceEdgeDto[]): GraphElements {
  const relayNodes: Node[] = []
  const allEdges:   Edge[] = []

  for (const e of apiEdges) {
    const relayId   = `relay-${e.id}`
    const stale     = e.stale
    const isDb      = e.propertyName === "shared-database"
    const isWebhook = e.propertyName === "webhook" || e.propertyName === "internal-rest"
    const color     = stale ? "#aaaaaa" : isDb ? "#8b5cf6" : isWebhook ? "#ea580c" : "var(--color-primary)"
    const dash      = stale ? "5,5" : undefined

    relayNodes.push({
      id:       relayId,
      type:     "dependencyCardNode",
      position: { x: 0, y: 0 },
      data:     { edge: e },
    })

    allEdges.push({
      id: `${e.id}-in`,
      source: e.sourceId,
      target: relayId,
      type: "smoothstep",
      style: { stroke: color, strokeWidth: stale ? 1.5 : 2, strokeDasharray: dash },
    })

    allEdges.push({
      id: `${e.id}-out`,
      source: relayId,
      target: e.targetId,
      type: "smoothstep",
      style: { stroke: color, strokeWidth: stale ? 1.5 : 2, strokeDasharray: dash },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    })
  }

  return { relayNodes, allEdges }
}

export type HandleSpec = { id: string; type: "source" | "target"; pct: number }

interface HandleAssignments {
  nodeHandlesMap: Map<string, HandleSpec[]>
  // edge id → {sourceHandle, targetHandle} for React Flow + ELK
  edgeHandleIds:  Map<string, { src: string; tgt: string }>
}

function buildHandleAssignments(
  allNodeIds: string[],
  edges: Edge[],
): HandleAssignments {
  const nodeHandlesMap = new Map<string, HandleSpec[]>()
  allNodeIds.forEach(id => nodeHandlesMap.set(id, []))

  const edgeHandleIds = new Map<string, { src: string; tgt: string }>()

  edges.forEach(e => {
    const src = `${e.source!}-src-${e.id}`
    const tgt = `${e.target!}-tgt-${e.id}`
    edgeHandleIds.set(e.id, { src, tgt })
    nodeHandlesMap.get(e.source!)?.push({ id: src, type: "source", pct: 0 })
    nodeHandlesMap.get(e.target!)?.push({ id: tgt, type: "target", pct: 0 })
  })

  // Compute evenly-distributed % positions for each side
  nodeHandlesMap.forEach(handles => {
    const tgts = handles.filter(h => h.type === "target")
    const srcs = handles.filter(h => h.type === "source")
    tgts.forEach((h, i) => { h.pct = (i + 1) / (tgts.length + 1) * 100 })
    srcs.forEach((h, i) => { h.pct = (i + 1) / (srcs.length + 1) * 100 })
  })

  return { nodeHandlesMap, edgeHandleIds }
}

type SidebarMode =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edge: ServiceEdgeDto }
  | { kind: "impact"; impactedId: string; epicenterId: string }
  | null

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



// BFS: find the dependency chain from impactedId that reaches epicenterId
// edges go source→target meaning "source depends on target"
function findPath(edges: ServiceEdgeDto[], fromId: string, toId: string, nodes: ServiceNodeDto[]): ServiceNodeDto[] {
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]))
  const queue: string[][] = [[fromId]]
  const visited = new Set([fromId])
  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    if (current === toId) return path.map(id => nodeById[id]).filter(Boolean)
    for (const e of edges) {
      if (e.sourceId === current && !visited.has(e.targetId)) {
        visited.add(e.targetId)
        queue.push([...path, e.targetId])
      }
    }
  }
  return []
}

export default function GraphPage() {
  const navigate = useNavigate()
  const { data: graphData, isLoading, error } = useGraph()
  const { data: allServices } = useServices()
  const { mutate: triggerScan, isPending: scanning } = useScanGraph()
  const { mutate: addManual } = useAddManualEdge()
  const { mutate: removeEdge } = useRemoveEdge()

  const [activeTab, setActiveTab] = useState<"service" | "database" | "query">("service")
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [sidebar, setSidebar] = useState<SidebarMode>(null)

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ sourceServiceId: "", targetServiceId: "", label: "" })

  // rfInstance is component-local (React Flow instance resets on remount anyway)
  const rfInstance = useRef<ReactFlowInstance | null>(null)
  // instanceInitialized tracks whether THIS mount has populated its nodes.
  // Unlike graphInitialized (globalThis), this resets to false on every remount,
  // which is exactly what fixes the blank-graph-on-navigation bug.
  const instanceInitialized = useRef(false)

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    changes.forEach((c: any) => {
      // Save position after drag ends (dragging === false means drop complete)
      if (c.type === "position" && c.dragging === false && c.position) {
        savedPositions[c.id] = c.position  // object ref shared with globalThis.__savedPositions
      }
    })
    onNodesChangeBase(changes)
  }, [onNodesChangeBase])

  useEffect(() => {
    if (!graphData) return

    const { relayNodes: baseRelayNodes, allEdges: baseEdges } = buildGraphElements(graphData.edges)

    // ── Assign per-edge handle IDs (once per data load) ───────────────────────
    const allNodeIds = [
      ...graphData.nodes.map(n => n.id),
      ...baseRelayNodes.map(n => n.id),
    ]
    const { nodeHandlesMap, edgeHandleIds } = buildHandleAssignments(allNodeIds, baseEdges)

    // Augment every React Flow edge with sourceHandle / targetHandle
    const allEdges = baseEdges.map(e => {
      const ids = edgeHandleIds.get(e.id)
      return ids ? { ...e, sourceHandle: ids.src, targetHandle: ids.tgt } : e
    })

    // Relay nodes: carry handles in data so the component renders the right Handle IDs
    const relayNodes = baseRelayNodes.map(n => ({
      ...n,
      data: { ...n.data, handles: nodeHandlesMap.get(n.id) ?? [] },
    }))

    if (!instanceInitialized.current) {
      instanceInitialized.current = true
      const hasSaved = graphData.nodes.some(n => savedPositions[n.id])
        || relayNodes.some(n => savedPositions[n.id])

      const makeServiceNodes = (posById: Record<string, { x: number; y: number }>) =>
        graphData.nodes.map(n => ({
          id: n.id, type: "serviceNode" as const,
          position: posById[n.id] ?? { x: 0, y: 0 },
          data: { ...n, handles: nodeHandlesMap.get(n.id) ?? [] },
        }))

      const makeRelayNodes = (posById: Record<string, { x: number; y: number }>) =>
        relayNodes.map(n => ({ ...n, position: posById[n.id] ?? { x: 0, y: 0 } }))

      if (hasSaved) {
        setNodes([...makeServiceNodes(savedPositions), ...makeRelayNodes(savedPositions)])
        setEdges(allEdges)
        graphInitialized = (globalThis as any).__graphInitialized = true
        setTimeout(() => rfInstance.current?.fitView({ padding: 0.12, duration: 0 }), 80)
      } else {
        // Seed at origin so React Flow can mount; ELK positions arrive in the next tick
        setNodes([...makeServiceNodes({}), ...relayNodes])
        setEdges(allEdges)

        const elkNodeSpecs = [
          ...graphData.nodes.map(n => {
            const h = nodeHandlesMap.get(n.id) ?? []
            const inC  = h.filter(x => x.type === "target").length
            const outC = h.filter(x => x.type === "source").length
            return {
              id: n.id, width: 240,
              height: Math.max(90, Math.max(inC, outC, 1) * 26 + 24),
              ports: h.map(x => ({ id: x.id, side: (x.type === "target" ? "WEST" : "EAST") as "WEST" | "EAST" })),
            }
          }),
          ...graphData.edges.map(e => {
            const relayId = `relay-${e.id}`
            const h = nodeHandlesMap.get(relayId) ?? []
            return {
              id: relayId, ...estimateRelaySize(e),
              ports: h.map(x => ({ id: x.id, side: (x.type === "target" ? "WEST" : "EAST") as "WEST" | "EAST" })),
            }
          }),
        ]

        const elkEdgeSpecs = allEdges.map(e => {
          const ids = edgeHandleIds.get(e.id)!
          return { id: e.id, source: e.source!, target: e.target!, sourcePort: ids.src, targetPort: ids.tgt }
        })

        const cycles = detectCycles(elkEdgeSpecs)
        if (cycles.length) console.warn("[ELK] cycles detected (GREEDY breaker active):", cycles)

        computeElkLayout(elkNodeSpecs, elkEdgeSpecs).then(pos => {
          setNodes(prev => prev.map(n => ({ ...n, position: pos[n.id] ?? n.position })))
          graphInitialized = (globalThis as any).__graphInitialized = true
          setTimeout(() => rfInstance.current?.fitView({ padding: 0.12, duration: 400 }), 80)
        })
      }
    } else {
      // Subsequent refetches: keep current positions, only update service node data
      setNodes(prev => {
        const posById  = Object.fromEntries(prev.map(n => [n.id, n.position]))
        const dataById = Object.fromEntries(graphData.nodes.map(n => [n.id, n]))
        return [
          ...graphData.nodes.map(n => ({
            id: n.id, type: "serviceNode" as const,
            position: posById[n.id] ?? { x: 0, y: 0 },
            data: { ...dataById[n.id] ?? n, handles: nodeHandlesMap.get(n.id) ?? [] },
          })),
          ...relayNodes.map(n => ({ ...n, position: posById[n.id] ?? { x: 0, y: 0 } })),
        ]
      })
      setEdges(allEdges)
    }
  }, [graphData])

  const selectedNodeId = sidebar?.kind === "node" ? sidebar.nodeId : null
  const selectedEdge   = sidebar?.kind === "edge" ? sidebar.edge : null
  const sharedDbEdgeId = selectedEdge?.propertyName === "shared-database" ? selectedEdge.id : null
  const { data: dbSchema, isLoading: schemaLoading } = useDbSchema(sharedDbEdgeId)

  const { data: blastRadius } = useBlastRadius(selectedNodeId)
  const { data: selectedDrift } = useDriftEvents(
    selectedNodeId ? { serviceId: selectedNodeId, size: 8 } : {}
  )

  const highlightedIds = blastRadius
    ? new Set([...(blastRadius.directlyImpactedIds ?? []), ...(blastRadius.transitivelyImpactedIds ?? [])])
    : new Set<string>()

  const selectedNode = selectedNodeId ? graphData?.nodes.find(n => n.id === selectedNodeId) : null

  if (isLoading) return (
    <div className="flex items-center justify-center h-96" style={{ color: "var(--color-text-secondary)" }}>
      Loading dependency graph…
    </div>
  )
  if (error) return (
    <div className="flex items-center justify-center h-96 text-sm" style={{ color: "var(--color-unreachable)" }}>
      Failed to load graph
    </div>
  )

  const staleCount     = graphData?.edges.filter(e => e.stale).length ?? 0
  const breakingEvents = selectedDrift?.content.filter(d => d.severity === "BREAKING") ?? []

  // Impact detail for clicking a blast radius card
  const impactState = sidebar?.kind === "impact" ? sidebar : null
  const impactPath  = impactState && graphData
    ? findPath(graphData.edges, impactState.impactedId, impactState.epicenterId, graphData.nodes)
    : []
  const impactEdges: ServiceEdgeDto[] = impactPath.length > 1
    ? impactPath.slice(0, -1).map((node, i) => {
        const nextId = impactPath[i + 1]?.id
        return graphData?.edges.find(e => e.sourceId === node.id && e.targetId === nextId)!
      }).filter(Boolean)
    : []

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
      <style>{`
        @keyframes blinkGreen {
          0%, 100% { outline-color: #16a34a; box-shadow: 0 0 6px rgba(22,163,74,0.5); }
          50%       { outline-color: transparent; box-shadow: none; }
        }
        .blast-radius-node {
          outline: 2px solid #16a34a !important;
          outline-offset: 3px;
          border-radius: 10px;
          animation: blinkGreen 1s ease-in-out infinite;
        }
      `}</style>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex rounded-md overflow-hidden border text-xs"
            style={{ borderColor: "var(--color-border)" }}>
            <button
              onClick={() => setActiveTab("service")}
              className="px-3 py-1.5 font-medium transition-colors"
              style={{
                background: activeTab === "service" ? "var(--color-primary)" : "var(--color-surface)",
                color: activeTab === "service" ? "#fff" : "var(--color-text-secondary)",
              }}>
              Service Dependencies
            </button>
            <button
              onClick={() => setActiveTab("database")}
              className="px-3 py-1.5 font-medium transition-colors border-l"
              style={{
                borderColor: "var(--color-border)",
                background: activeTab === "database" ? "var(--color-primary)" : "var(--color-surface)",
                color: activeTab === "database" ? "#fff" : "var(--color-text-secondary)",
              }}>
              Database Schema
            </button>
            <button
              onClick={() => setActiveTab("query")}
              className="px-3 py-1.5 font-medium transition-colors border-l"
              style={{
                borderColor: "var(--color-border)",
                background: activeTab === "query" ? "var(--color-primary)" : "var(--color-surface)",
                color: activeTab === "query" ? "#fff" : "var(--color-text-secondary)",
              }}>
              Query Console
            </button>
          </div>

          {activeTab === "service" && (
            <>
              <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                {graphData?.nodes.length ?? 0} services · {graphData?.edges.length ?? 0} dependencies
              </span>
              {staleCount > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                  style={{ background: "#fffbeb", color: "#d97706" }}>
                  <AlertTriangle className="w-3 h-3" />
                  {staleCount} stale {staleCount === 1 ? "edge" : "edges"}
                </span>
              )}
            </>
          )}
        </div>

        {activeTab === "service" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
              <Plus className="w-3.5 h-3.5" /> Add dependency
            </button>
            <button
              onClick={() => triggerScan()}
              disabled={scanning}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md"
              style={{ background: "var(--color-primary)", color: "#fff" }}>
              <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Scan now"}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Database Schema Graph */}
        {activeTab === "database" && <DbSchemaExplorer />}

        {/* Query Console */}
        {activeTab === "query" && <QueryConsole />}

        {/* Service Dependency Graph + sidebar */}
        {activeTab === "service" && <>
        <div style={{ flex: 1, position: "relative" }}>
          <ReactFlow
            nodes={nodes.map(n => {
              if (n.type === "dependencyCardNode") {
                const edge = (n.data as { edge: ServiceEdgeDto }).edge
                return { ...n, data: { ...n.data, selected: selectedEdge?.id === edge.id } }
              }
              return {
                ...n,
                data: { ...(n.data as ServiceNodeDto), selected: n.id === selectedNodeId },
                className: highlightedIds.has(n.id) ? "blast-radius-node" : undefined,
              }
            })}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => {
              if (node.type === "dependencyCardNode") {
                const edge = (node.data as { edge: ServiceEdgeDto }).edge
                setSidebar(prev =>
                  prev?.kind === "edge" && prev.edge.id === edge.id ? null : { kind: "edge", edge }
                )
              } else {
                setSidebar(prev =>
                  prev?.kind === "node" && prev.nodeId === node.id
                    ? null
                    : { kind: "node", nodeId: node.id }
                )
              }
            }}
            onPaneClick={() => setSidebar(null)}
            onInit={instance => { rfInstance.current = instance }}
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
            <Controls position="top-left" />
            <MiniMap
              nodeColor={n => {
                if (n.type === "dependencyCardNode") return "#e2e8f0"
                const status = (n.data as ServiceNodeDto)?.status
                if (status === "FETCHED")     return "#399b86"
                if (status === "UNREACHABLE") return "#ef4444"
                return "#d97706"
              }}
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            />
          </ReactFlow>

          {/* Legend */}
          <div className="absolute bottom-4 right-4 text-xs flex items-center gap-4 px-3 py-2 rounded-lg"
            style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#399b86", display: "inline-block" }} /> Healthy
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} /> Unreachable
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 22, borderTop: "2px solid var(--color-primary)", display: "inline-block" }} /> Active
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 22, borderTop: "2px dashed #aaa", display: "inline-block" }} /> Stale
            </span>
          </div>
        </div>

        {/* ── Sidebar ── */}
        {sidebar && (
          <div className="flex flex-col border-l"
            style={{ width: 320, background: "var(--color-surface)", borderColor: "var(--color-border)", overflowY: "auto" }}>

            {/* ── NODE sidebar ── */}
            {sidebar.kind === "node" && selectedNode && (
              <>
                <SidebarHeader
                  title={selectedNode.name}
                  subtitle={selectedNode.baseUrl}
                  onClose={() => setSidebar(null)}
                />
                <div className="p-4 space-y-5">
                  {selectedNode.hasStaleEdges && (
                    <AlertBanner color="amber">
                      Dependency topology may be outdated — service was unreachable during last scan
                    </AlertBanner>
                  )}

                  {selectedNode.breakingChanges > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <SectionLabel>Breaking Changes</SectionLabel>
                        <button onClick={() => void navigate({ to: "/drift" })}
                          className="flex items-center gap-1 text-xs font-medium"
                          style={{ color: "var(--color-primary)" }}>
                          View all <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {breakingEvents.slice(0, 5).map(d => (
                          <div key={d.id} className="rounded-lg p-2.5 text-xs"
                            style={{ background: "#fef2f2", border: "1px solid #fecaca" }}>
                            <div className="font-semibold mb-0.5" style={{ color: "#dc2626" }}>
                              {d.changeType.replace(/_/g, " ")}
                            </div>
                            {d.apiPath && (
                              <div className="font-mono truncate" style={{ color: "#991b1b" }}>
                                {d.httpMethod && <span className="mr-1">{d.httpMethod}</span>}
                                {d.apiPath}
                              </div>
                            )}
                            {d.detail && <div className="mt-0.5" style={{ color: "#b91c1c" }}>{d.detail}</div>}
                            <div className="mt-1" style={{ color: "#d97706" }}>
                              {new Date(d.detectedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        ))}
                        {selectedNode.breakingChanges > 5 && (
                          <button onClick={() => void navigate({ to: "/drift" })}
                            className="w-full text-xs py-1.5 rounded-lg text-center"
                            style={{ color: "var(--color-primary)", background: "var(--color-primary-muted)" }}>
                            +{selectedNode.breakingChanges - 5} more in Drift Feed
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Blast radius */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <GitBranch className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                      <SectionLabel>Blast Radius</SectionLabel>
                    </div>
                    {!blastRadius && <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading…</p>}
                    {blastRadius?.totalImpacted === 0 && (
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No other services depend on this one.</p>
                    )}
                    {blastRadius && blastRadius.totalImpacted > 0 && (
                      <div className="space-y-3">
                        <div className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                          style={{ background: "var(--color-surface-muted)", color: "var(--color-text-primary)" }}>
                          {blastRadius.totalImpacted} service{blastRadius.totalImpacted !== 1 ? "s" : ""} affected if this goes down
                        </div>

                        {blastRadius.directlyImpactedIds.length > 0 && (
                          <div>
                            <p className="text-xs mb-1.5 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                              Direct ({blastRadius.directlyImpactedIds.length})
                            </p>
                            {blastRadius.directlyImpactedIds.map(id => {
                              const svc = graphData?.nodes.find(n => n.id === id)
                              return (
                                <button key={id}
                                  className="flex items-center justify-between w-full text-xs px-2.5 py-1.5 rounded-lg mb-1 text-left transition-opacity hover:opacity-80"
                                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
                                  onClick={() => setSidebar({ kind: "impact", impactedId: id, epicenterId: selectedNode.id })}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#dc2626" }} />
                                    {svc?.name ?? id}
                                  </span>
                                  <ChevronRight className="w-3 h-3 shrink-0" />
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {blastRadius.transitivelyImpactedIds.length > 0 && (
                          <div>
                            <p className="text-xs mb-1.5 font-medium" style={{ color: "var(--color-text-secondary)" }}>
                              Transitive ({blastRadius.transitivelyImpactedIds.length})
                            </p>
                            {blastRadius.transitivelyImpactedIds.map(id => {
                              const svc = graphData?.nodes.find(n => n.id === id)
                              return (
                                <button key={id}
                                  className="flex items-center justify-between w-full text-xs px-2.5 py-1.5 rounded-lg mb-1 text-left transition-opacity hover:opacity-80"
                                  style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}
                                  onClick={() => setSidebar({ kind: "impact", impactedId: id, epicenterId: selectedNode.id })}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#d97706" }} />
                                    {svc?.name ?? id}
                                  </span>
                                  <ChevronRight className="w-3 h-3 shrink-0" />
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Outgoing deps */}
                  <div>
                    <SectionLabel className="mb-2">Calls</SectionLabel>
                    {graphData?.edges.filter(e => e.sourceId === selectedNodeId).length === 0 ? (
                      <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>No known outgoing dependencies.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {graphData?.edges.filter(e => e.sourceId === selectedNodeId).map(e => {
                          const isDb = e.propertyName === "shared-database"
                          return (
                            <div key={e.id}
                              className="flex items-center justify-between p-2.5 rounded-lg text-xs"
                              style={{ background: "var(--color-background)", border: "1px solid var(--color-border)" }}>
                              <div className="flex items-center gap-2 min-w-0">
                                {isDb
                                  ? <Database className="w-3 h-3 shrink-0" style={{ color: "#8b5cf6" }} />
                                  : <ArrowRight className="w-3 h-3 shrink-0" style={{ color: "var(--color-primary)" }} />
                                }
                                <div className="min-w-0">
                                  <div className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{e.targetName}</div>
                                  <div className="truncate" style={{ color: isDb ? "#8b5cf6" : "var(--color-text-secondary)" }}>
                                    {isDb ? "Shared PostgreSQL database" : (e.propertyName ?? e.detectionMethod)}
                                  </div>
                                  {e.stale && <div style={{ color: "#d97706" }}>⚠ stale</div>}
                                </div>
                              </div>
                              {e.detectionMethod === "MANUAL" && (
                                <button onClick={() => removeEdge(e.id)} className="shrink-0 ml-2">
                                  <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--color-unreachable)" }} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── EDGE sidebar ── */}
            {sidebar.kind === "edge" && (
              <>
                <SidebarHeader
                  title="Dependency Detail"
                  subtitle={`${selectedEdge!.sourceName} → ${selectedEdge!.targetName}`}
                  onClose={() => setSidebar(null)}
                />
                <div className="p-4 space-y-4">
                  {selectedEdge!.stale && (
                    <AlertBanner color="amber">
                      This edge is stale — {selectedEdge!.sourceName} was unreachable during the last scan.
                    </AlertBanner>
                  )}

                  {/* Type */}
                  <div>
                    <SectionLabel className="mb-2">Type</SectionLabel>
                    {selectedEdge!.propertyName === "shared-database" ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg"
                        style={{ background: "#f5f3ff", border: "1px solid #ddd6fe" }}>
                        <Database className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#7c3aed" }} />
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "#6d28d9" }}>Shared Database</div>
                          <div className="text-xs mt-1" style={{ color: "#7c3aed" }}>
                            Both services connect to the same PostgreSQL schema. Schema changes in{" "}
                            <strong>{selectedEdge!.targetName}</strong> can silently break{" "}
                            <strong>{selectedEdge!.sourceName}</strong>.
                          </div>
                        </div>
                      </div>
                    ) : selectedEdge!.propertyName === "webhook" ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg"
                        style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                        <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ea580c" }} />
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "#c2410c" }}>Webhook / Push</div>
                          <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                            <strong>{selectedEdge!.sourceName}</strong> pushes events to{" "}
                            <strong>{selectedEdge!.targetName}</strong> via HTTP callback.
                          </div>
                        </div>
                      </div>
                    ) : selectedEdge!.propertyName === "internal-rest" ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg"
                        style={{ background: "#fef9c3", border: "1px solid #fde68a" }}>
                        <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ca8a04" }} />
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "#92400e" }}>Internal REST + Webhook</div>
                          <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                            <strong>{selectedEdge!.sourceName}</strong> calls{" "}
                            <strong>{selectedEdge!.targetName}</strong> via signed internal RestClient and also pushes webhook events.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg"
                        style={{ background: "var(--color-primary-muted)", border: "1px solid var(--color-primary-border, #b2dfdb)" }}>
                        <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--color-primary)" }} />
                        <div>
                          <div className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>HTTP REST API</div>
                          <div className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                            <strong>{selectedEdge!.sourceName}</strong> makes HTTP calls to{" "}
                            <strong>{selectedEdge!.targetName}</strong> using a configured base URL.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Property */}
                  <div>
                    <SectionLabel className="mb-1.5">Spring Property</SectionLabel>
                    <div className="font-mono text-xs px-2.5 py-2 rounded-lg"
                      style={{ background: "var(--color-background)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}>
                      {selectedEdge!.propertyName ?? "—"}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--color-text-secondary)" }}>
                      {selectedEdge!.detectionMethod === "ACTUATOR_ENV"
                        ? `Auto-detected via /actuator/env`
                        : "Manually configured"}
                    </p>
                  </div>

                  {/* All endpoint calls */}
                  {selectedEdge!.endpointCalls?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Code2 className="w-3.5 h-3.5" style={{ color: "var(--color-text-secondary)" }} />
                        <SectionLabel>HTTP Calls ({selectedEdge!.endpointCalls.length})</SectionLabel>
                      </div>
                      <div className="space-y-1.5">
                        {selectedEdge!.endpointCalls.map((call, i) => (
                          <div key={i} className="rounded-lg overflow-hidden"
                            style={{ border: "1px solid var(--color-border)" }}>
                            <div className="flex items-center gap-2 px-2.5 py-1.5"
                              style={{ background: "var(--color-background)" }}>
                              <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded"
                                style={{
                                  background: methodColor(call.method).bg,
                                  color: methodColor(call.method).text,
                                  minWidth: 38, textAlign: "center",
                                }}>
                                {call.method}
                              </span>
                              <span className="text-xs font-mono truncate" style={{ color: "var(--color-text-primary)" }}>
                                {call.path}
                              </span>
                            </div>
                            {call.description && (
                              <div className="px-2.5 py-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                                {call.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Full DB schema */}
                  {selectedEdge!.propertyName === "shared-database" && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Database className="w-3.5 h-3.5" style={{ color: "#7c3aed" }} />
                        <SectionLabel>Database Schema ({dbSchema?.length ?? 0} tables)</SectionLabel>
                      </div>
                      {schemaLoading ? (
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Loading schema…</p>
                      ) : dbSchema && dbSchema.length > 0 ? (
                        <div className="space-y-1.5">
                          {dbSchema.map(table => (
                            <details key={table.tableName} className="rounded-lg overflow-hidden"
                              style={{ border: "1px solid var(--color-border)" }}>
                              <summary className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium cursor-pointer select-none"
                                style={{ background: "var(--color-background)", color: "var(--color-text-primary)" }}>
                                <span className="font-mono">{table.tableName}</span>
                                <span className="ml-auto" style={{ color: "var(--color-text-secondary)" }}>
                                  {table.columns.length} cols
                                </span>
                              </summary>
                              <div style={{ background: "var(--color-surface)" }}>
                                {table.columns.map(col => (
                                  <div key={col.name} className="flex items-center gap-2 px-2.5 py-0.5 text-xs"
                                    style={{ borderTop: "1px solid var(--color-border)" }}>
                                    <span className="font-mono font-medium" style={{ color: "var(--color-text-primary)" }}>{col.name}</span>
                                    <span className="font-mono" style={{ color: "#7c3aed" }}>{col.type}</span>
                                    {col.nullable && <span className="ml-auto text-xs" style={{ color: "var(--color-text-secondary)" }}>null</span>}
                                  </div>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          Could not load schema — ensure service is running with actuator/env exposed.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div>
                    <SectionLabel className="mb-1.5">Status</SectionLabel>
                    <div className="space-y-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                      <div className="flex justify-between">
                        <span>Last verified</span>
                        <span style={{ color: "var(--color-text-primary)" }}>
                          {selectedEdge!.verifiedAt
                            ? new Date(selectedEdge!.verifiedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Confidence</span>
                        <span style={{ color: "var(--color-text-primary)" }}>{selectedEdge!.confidence}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── IMPACT sidebar ── */}
            {sidebar.kind === "impact" && impactState && (() => {
              const impactedNode = graphData?.nodes.find(n => n.id === impactState.impactedId)
              const epicenterNode = graphData?.nodes.find(n => n.id === impactState.epicenterId)
              return (
                <>
                  <div className="flex items-center gap-2 px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border)" }}>
                    <button onClick={() => setSidebar({ kind: "node", nodeId: impactState.epicenterId })}
                      className="text-xs" style={{ color: "var(--color-primary)" }}>
                      ← Back
                    </button>
                    <span className="text-xs font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
                      Why is {impactedNode?.name ?? "this service"} affected?
                    </span>
                    <button onClick={() => setSidebar(null)} className="ml-auto shrink-0">
                      <X className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    <AlertBanner color="red">
                      If <strong>{epicenterNode?.name}</strong> goes down or has a breaking API change,
                      <strong> {impactedNode?.name}</strong> will be directly affected.
                    </AlertBanner>

                    <div>
                      <SectionLabel className="mb-2">Dependency Path</SectionLabel>
                      {impactPath.length === 0 ? (
                        <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>Could not trace path.</p>
                      ) : (
                        <div className="space-y-1">
                          {impactPath.map((node, idx) => (
                            <div key={node.id}>
                              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs"
                                style={{
                                  background: idx === 0 ? "#fef2f2" : idx === impactPath.length - 1 ? "var(--color-primary-muted)" : "var(--color-background)",
                                  border: "1px solid var(--color-border)",
                                  color: "var(--color-text-primary)",
                                  fontWeight: (idx === 0 || idx === impactPath.length - 1) ? 600 : 400,
                                }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                                  background: idx === 0 ? "#dc2626" : idx === impactPath.length - 1 ? "var(--color-primary)" : "#94a3b8"
                                }} />
                                {node.name}
                                {idx === 0 && <span className="ml-auto text-xs font-normal" style={{ color: "#dc2626" }}>affected</span>}
                                {idx === impactPath.length - 1 && <span className="ml-auto text-xs font-normal" style={{ color: "var(--color-primary)" }}>epicenter</span>}
                              </div>
                              {idx < impactPath.length - 1 && impactEdges[idx] && (
                                <div className="flex items-center gap-1.5 ml-4 my-1 text-xs"
                                  style={{ color: "var(--color-text-secondary)" }}>
                                  <div style={{ width: 1, height: 12, background: "var(--color-border)", marginLeft: -1 }} />
                                  <span className="font-mono" style={{ fontSize: 10 }}>
                                    {impactEdges[idx].propertyName === "shared-database"
                                      ? "via shared database"
                                      : `via ${impactEdges[idx].propertyName ?? "HTTP"}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Show the direct edge details */}
                    {impactEdges[0] && (
                      <div>
                        <SectionLabel className="mb-2">Direct Dependency</SectionLabel>
                        <div className="p-2.5 rounded-lg text-xs space-y-1"
                          style={{ background: "var(--color-background)", border: "1px solid var(--color-border)" }}>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--color-text-secondary)" }}>Property</span>
                            <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                              {impactEdges[0].propertyName ?? "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--color-text-secondary)" }}>Detection</span>
                            <span style={{ color: "var(--color-text-primary)" }}>{impactEdges[0].detectionMethod}</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: "var(--color-text-secondary)" }}>Confidence</span>
                            <span style={{ color: "var(--color-text-primary)" }}>{impactEdges[0].confidence}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}
        </>}
      </div>

      {/* Add manual dependency modal */}
      {showAddForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="rounded-xl p-6 space-y-4" style={{ background: "var(--color-surface)", width: 360, border: "1px solid var(--color-border)" }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm" style={{ color: "var(--color-text-primary)" }}>Add Manual Dependency</h2>
              <button onClick={() => setShowAddForm(false)}><X className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Source service (calls)</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}
                  value={addForm.sourceServiceId}
                  onChange={e => setAddForm(f => ({ ...f, sourceServiceId: e.target.value }))}>
                  <option value="">Select…</option>
                  {allServices?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Target service (is called)</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}
                  value={addForm.targetServiceId}
                  onChange={e => setAddForm(f => ({ ...f, targetServiceId: e.target.value }))}>
                  <option value="">Select…</option>
                  {allServices?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--color-text-secondary)" }}>Label (optional)</label>
                <input className="w-full border rounded-md px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)" }}
                  placeholder="e.g. shared-database"
                  value={addForm.label}
                  onChange={e => setAddForm(f => ({ ...f, label: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button className="flex-1 py-2 rounded-md text-sm" style={{ background: "var(--color-primary)", color: "#fff" }}
                onClick={() => {
                  if (!addForm.sourceServiceId || !addForm.targetServiceId) return
                  addManual({ sourceServiceId: addForm.sourceServiceId, targetServiceId: addForm.targetServiceId, label: addForm.label || undefined })
                  setShowAddForm(false)
                  setAddForm({ sourceServiceId: "", targetServiceId: "", label: "" })
                }}>
                Add
              </button>
              <button className="flex-1 py-2 rounded-md text-sm border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}
                onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Small reusable pieces ──────────────────────────────────────────────────

function SidebarHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 border-b"
      style={{ borderColor: "var(--color-border)" }}>
      <div className="flex-1 min-w-0 pr-2">
        <div className="font-semibold text-sm truncate" style={{ color: "var(--color-text-primary)" }}>{title}</div>
        <div className="text-xs font-mono mt-0.5 truncate" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</div>
      </div>
      <button onClick={onClose} className="shrink-0 mt-0.5">
        <X className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
      </button>
    </div>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-xs font-semibold uppercase tracking-wide ${className ?? ""}`}
      style={{ color: "var(--color-text-secondary)" }}>
      {children}
    </div>
  )
}

function AlertBanner({ children, color }: { children: React.ReactNode; color: "amber" | "red" }) {
  const styles = color === "amber"
    ? { bg: "#fffbeb", border: "#fde68a", text: "#92400e" }
    : { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" }
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg text-xs"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.text }}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}
