import { useState } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { TableSchemaDto } from "../../infrastructure/api/types"

export const DB_HEADER_H = 40
export const DB_ROW_H    = 24
export const DB_NODE_W   = 260

function nodeHeight(colCount: number, collapsed: boolean) {
  return collapsed ? DB_HEADER_H : DB_HEADER_H + colCount * DB_ROW_H
}

export function DbTableNode({ data }: NodeProps) {
  const table = data as TableSchemaDto & { groupColor: string }
  const headerBg = table.groupColor ?? "#1e1b4b"

  const [collapsed, setCollapsed] = useState(true)

  return (
    <div
      style={{
        width: DB_NODE_W,
        background: "var(--color-surface)",
        border: "1.5px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 2px 12px rgba(0,0,0,0.14)",
        userSelect: "none",
      }}
    >
      {/* Header — click to collapse/expand */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          height: DB_HEADER_H,
          background: headerBg,
          padding: "0 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <span style={{ color: "rgba(224,231,255,0.7)", flexShrink: 0, display: "flex" }}>
          {collapsed
            ? <ChevronRight className="w-3 h-3" />
            : <ChevronDown  className="w-3 h-3" />}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "monospace",
            color: "#e0e7ff",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {table.tableName}
        </span>
        <span style={{ fontSize: 10, color: "rgba(224,231,255,0.55)", flexShrink: 0 }}>
          {table.columns.length}c
        </span>
      </div>

      {/* Column rows */}
      {!collapsed && table.columns.map((col, i) => {
        const isPk = col.name === "id"
        const isFk = !isPk && col.name.endsWith("_id")

        return (
          <div
            key={col.name}
            style={{
              height: DB_ROW_H,
              display: "flex",
              alignItems: "center",
              padding: "0 10px 0 12px",
              gap: 6,
              background: i % 2 === 0
                ? "var(--color-surface)"
                : "var(--color-background)",
              borderTop: "1px solid var(--color-border)",
              position: "relative",
            }}
          >
            {/* Per-column handles */}
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-source`}
              style={{
                top: DB_HEADER_H + i * DB_ROW_H + DB_ROW_H / 2,
                width: 7, height: 7,
                background: "#6366f1",
                border: "1.5px solid #4f46e5",
                borderRadius: "50%",
              }}
            />
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-target`}
              style={{
                top: DB_HEADER_H + i * DB_ROW_H + DB_ROW_H / 2,
                width: 7, height: 7,
                background: "#6366f1",
                border: "1.5px solid #4f46e5",
                borderRadius: "50%",
              }}
            />

            {/* PK / FK badge */}
            {isPk && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#f59e0b",
                background: "#fef3c7", padding: "0 3px", borderRadius: 3, flexShrink: 0,
              }}>PK</span>
            )}
            {isFk && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: "#6366f1",
                background: "#eef2ff", padding: "0 3px", borderRadius: 3, flexShrink: 0,
              }}>FK</span>
            )}
            {!isPk && !isFk && (
              <span style={{ width: 18, flexShrink: 0 }} />
            )}

            {/* Column name */}
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: col.nullable
                  ? "var(--color-text-secondary)"
                  : "var(--color-text-primary)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {col.name}
            </span>

            {/* Data type */}
            <span
              style={{
                fontSize: 10,
                fontFamily: "monospace",
                color: "#6366f1",
                flexShrink: 0,
                maxWidth: 80,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.8,
              }}
            >
              {col.type}
            </span>
          </div>
        )
      })}

      {/* Collapsed placeholder handle at header mid-point */}
      <Handle
        type="target"
        position={Position.Left}
        id="table-target"
        style={{ top: DB_HEADER_H / 2, opacity: 0, pointerEvents: "none" }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="table-source"
        style={{ top: DB_HEADER_H / 2, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  )
}

export { nodeHeight as dbNodeHeight }
