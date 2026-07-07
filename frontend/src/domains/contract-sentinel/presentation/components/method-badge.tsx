const METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  GET:    { bg: "#f0fdf9", color: "#0d9488" },
  POST:   { bg: "#f5f3ff", color: "#6d28d9" },
  PUT:    { bg: "#fffbeb", color: "#b45309" },
  DELETE: { bg: "#fef2f2", color: "#dc2626" },
  PATCH:  { bg: "#fff7ed", color: "#c2410c" },
}

interface MethodBadgeProps {
  method: string
}

export function MethodBadge({ method }: MethodBadgeProps) {
  const upper = method.toUpperCase()
  const colors = METHOD_COLORS[upper] ?? { bg: "#f1f5f9", color: "#475569" }

  return (
    <span
      className="inline-block font-mono text-xs font-semibold px-2 py-0.5 rounded"
      style={{ background: colors.bg, color: colors.color }}
    >
      {upper}
    </span>
  )
}
