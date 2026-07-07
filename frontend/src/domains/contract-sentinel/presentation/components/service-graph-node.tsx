import { Handle, Position, type NodeProps } from "@xyflow/react"
import { AlertTriangle, Wifi, WifiOff, Clock } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import type { ServiceNodeDto } from "../../infrastructure/api/types"
import type { HandleSpec } from "../pages/graph-page"

const NODE_WIDTH = 220

function statusColor(status: string): string {
  if (status === "FETCHED")     return "var(--color-healthy)"
  if (status === "UNREACHABLE") return "var(--color-unreachable)"
  if (status === "PARSE_FAILED") return "var(--color-drifted)"
  return "var(--color-text-secondary)"
}

function statusBg(status: string): string {
  if (status === "FETCHED")     return "var(--color-healthy-bg)"
  if (status === "UNREACHABLE") return "var(--color-unreachable-bg)"
  if (status === "PARSE_FAILED") return "var(--color-drifted-bg)"
  return "#f8f8f8"
}

function statusLabel(status: string): string {
  if (status === "FETCHED")      return "Healthy"
  if (status === "UNREACHABLE")  return "Unreachable"
  if (status === "PARSE_FAILED") return "Parse Failed"
  if (status === "NEVER_POLLED") return "Not polled"
  return status
}

function StatusIcon({ status }: { status: string }) {
  if (status === "FETCHED")     return <Wifi className="w-3 h-3" />
  if (status === "UNREACHABLE") return <WifiOff className="w-3 h-3" />
  return <Clock className="w-3 h-3" />
}

export function ServiceGraphNode({ data }: NodeProps) {
  const navigate = useNavigate()
  const node = data as ServiceNodeDto & { selected?: boolean; handles?: HandleSpec[] }
  const color = statusColor(node.status)
  const bg    = statusBg(node.status)
  const isSelected = node.selected
  const handles = node.handles ?? []
  const targetHandles = handles.filter(h => h.type === "target")
  const sourceHandles = handles.filter(h => h.type === "source")

  return (
    <div
      style={{
        width: NODE_WIDTH,
        background: "var(--color-surface)",
        border: `2px solid ${isSelected ? "var(--color-primary)" : color}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(57,155,134,0.25), 0 4px 12px rgba(0,0,0,0.12)"
          : "0 1px 4px rgba(0,0,0,0.08)",
        fontFamily: "DM Sans, system-ui, sans-serif",
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        userSelect: "none",
      }}
    >
      {targetHandles.length > 0
        ? targetHandles.map(h => (
            <Handle key={h.id} id={h.id} type="target" position={Position.Left}
              style={{ background: color, width: 8, height: 8, border: "2px solid white", top: `${h.pct}%` }} />
          ))
        : <Handle type="target" position={Position.Left}
            style={{ background: color, width: 8, height: 8, border: "2px solid white" }} />
      }

      {/* Status + breaking badge row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
          style={{ background: bg, color }}>
          <StatusIcon status={node.status} />
          <span>{statusLabel(node.status)}</span>
        </div>

        {node.breakingChanges > 0 && (
          <button
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold transition-opacity hover:opacity-80"
            style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}
            onClick={e => {
              e.stopPropagation()
              void navigate({ to: "/drift" })
            }}
            title="View breaking changes in Drift Feed"
          >
            <AlertTriangle className="w-3 h-3" />
            {node.breakingChanges}
          </button>
        )}
      </div>

      {/* Name */}
      <div className="font-semibold text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
        {node.name}
      </div>

      {/* Base URL */}
      <div className="text-xs truncate mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
        {node.baseUrl}
      </div>

      {/* Stale topology warning */}
      {node.hasStaleEdges && (
        <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: "#d97706" }}>
          <AlertTriangle className="w-3 h-3" />
          <span>Topology stale</span>
        </div>
      )}

      {sourceHandles.length > 0
        ? sourceHandles.map(h => (
            <Handle key={h.id} id={h.id} type="source" position={Position.Right}
              style={{ background: color, width: 8, height: 8, border: "2px solid white", top: `${h.pct}%` }} />
          ))
        : <Handle type="source" position={Position.Right}
            style={{ background: color, width: 8, height: 8, border: "2px solid white" }} />
      }
    </div>
  )
}
