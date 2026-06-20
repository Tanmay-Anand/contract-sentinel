import { MethodBadge } from "./method-badge"
import type { UsageEntryDto } from "../../infrastructure/api/types"

interface UsageHeatmapProps {
  data: UsageEntryDto[]
}

export function UsageHeatmap({ data }: UsageHeatmapProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-center py-4" style={{ color: "var(--color-text-secondary)" }}>
        No usage data collected yet.
      </p>
    )
  }

  const sorted = [...data].sort((a, b) => b.totalCount - a.totalCount)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ color: "var(--color-text-secondary)" }}>
            <th className="text-left pb-2 pr-3 font-medium">Endpoint</th>
            <th className="text-right pb-2 pr-3 font-medium">Total</th>
            <th className="text-right pb-2 font-medium">Delta</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry, i) => (
            <tr
              key={i}
              className="border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <td className="py-1.5 pr-3">
                <div className="flex items-center gap-2">
                  <MethodBadge method={entry.httpMethod} />
                  <code className="truncate max-w-xs" style={{ color: "var(--color-text-primary)" }}>
                    {entry.path}
                  </code>
                  {entry.dead && (
                    <span
                      className="px-1.5 py-0.5 rounded text-xs font-medium"
                      style={{ background: "var(--color-drifted-bg)", color: "var(--color-drifted)" }}
                    >
                      Dead
                    </span>
                  )}
                </div>
              </td>
              <td className="py-1.5 pr-3 text-right font-mono" style={{ color: "var(--color-text-primary)" }}>
                {entry.totalCount.toLocaleString()}
              </td>
              <td className="py-1.5 text-right font-mono" style={{
                color: entry.deltaCount > 0 ? "var(--color-healthy)" :
                       entry.deltaCount < 0 ? "var(--color-breaking)" : "var(--color-text-secondary)",
              }}>
                {entry.deltaCount > 0 ? `+${entry.deltaCount}` : entry.deltaCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
