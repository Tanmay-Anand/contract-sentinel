import type { Severity } from "@/api/types"

interface Props {
  severity: Severity
}

export function SeverityBadge({ severity }: Props) {
  const isBreaking = severity === "BREAKING"
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
      style={
        isBreaking
          ? {
              background: "var(--color-breaking-bg)",
              color: "var(--color-breaking)",
              border: "1px solid var(--color-breaking-border)",
            }
          : {
              background: "var(--color-safe-bg)",
              color: "var(--color-safe)",
              border: "1px solid var(--color-safe-border)",
            }
      }
    >
      {isBreaking ? "BREAKING" : "SAFE"}
    </span>
  )
}
