import type { DiffGroupDto, SpecDiffDto } from "../../infrastructure/api/types"

function parseDetail(detail: string | null): string {
  if (!detail) return ""
  try {
    const obj = JSON.parse(detail) as Record<string, unknown>
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ")
  } catch {
    return detail
  }
}

function sortGroups(groups: DiffGroupDto[]): DiffGroupDto[] {
  return [...groups].sort((a, b) => {
    const aBreaking = a.changes.some(c => c.severity === "BREAKING")
    const bBreaking = b.changes.some(c => c.severity === "BREAKING")
    if (aBreaking && !bBreaking) return -1
    if (!aBreaking && bBreaking) return 1
    return 0
  })
}

interface SpecDiffViewerProps {
  diff: SpecDiffDto
}

export function SpecDiffViewer({ diff }: SpecDiffViewerProps) {
  const sorted = sortGroups(diff.groups)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm">
        <span className="font-semibold" style={{ color: "var(--color-breaking)" }}>
          {diff.totalBreaking} breaking
        </span>
        <span style={{ color: "var(--color-text-secondary)" }}>·</span>
        <span className="font-semibold" style={{ color: "var(--color-safe)" }}>
          {diff.totalSafe} safe
        </span>
        <span className="text-xs ml-auto" style={{ color: "var(--color-text-secondary)" }}>
          {new Date(diff.detectedAt).toLocaleString()}
        </span>
      </div>

      {sorted.map((group, gi) => {
        const hasBreaking = group.changes.some(c => c.severity === "BREAKING")
        return (
          <div
            key={gi}
            className="rounded-lg border-l-4 border pl-3 pr-3 py-2"
            style={{
              borderLeftColor: hasBreaking ? "var(--color-breaking)" : "var(--color-safe)",
              borderColor: "var(--color-border)",
              background: hasBreaking ? "var(--color-breaking-bg)" : "var(--color-safe-bg)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <code className="text-xs font-semibold">
                {group.httpMethod} {group.path}
              </code>
            </div>
            <div className="space-y-1">
              {group.changes.map((change, ci) => (
                <div key={ci} className="flex items-start gap-2 text-xs">
                  <span
                    className="px-1.5 py-0.5 rounded font-semibold shrink-0"
                    style={{
                      background: change.severity === "BREAKING" ? "var(--color-breaking-bg)" : "var(--color-safe-bg)",
                      color: change.severity === "BREAKING" ? "var(--color-breaking)" : "var(--color-safe)",
                      border: `1px solid ${change.severity === "BREAKING" ? "var(--color-breaking-border)" : "var(--color-safe-border)"}`,
                    }}
                  >
                    {change.severity}
                  </span>
                  <span style={{ color: "var(--color-text-secondary)" }}>{change.changeType}</span>
                  {change.detail && (
                    <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                      {parseDetail(change.detail)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {diff.groups.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--color-text-secondary)" }}>
          No changes in this diff.
        </p>
      )}
    </div>
  )
}
