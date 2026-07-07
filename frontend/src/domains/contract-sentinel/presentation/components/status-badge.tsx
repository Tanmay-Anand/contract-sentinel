import type { ServiceDto } from "../../infrastructure/api/types"

const config: Record<ServiceDto["status"], { label: string; bg: string; border: string; text: string; dot: string }> = {
  HEALTHY: {
    label: "Healthy",
    bg:     "var(--color-healthy-bg)",
    border: "var(--color-healthy-border)",
    text:   "#15803d",
    dot:    "var(--color-healthy)",
  },
  DRIFTED: {
    label: "Drifted",
    bg:     "var(--color-drifted-bg)",
    border: "var(--color-drifted-border)",
    text:   "#b45309",
    dot:    "var(--color-drifted)",
  },
  UNREACHABLE: {
    label: "Unreachable",
    bg:     "var(--color-unreachable-bg)",
    border: "var(--color-unreachable-border)",
    text:   "#dc2626",
    dot:    "var(--color-unreachable)",
  },
  PARSE_FAILED: {
    label: "Parse Failed",
    bg:     "var(--color-parse-failed-bg)",
    border: "var(--color-parse-failed-border)",
    text:   "#7c3aed",
    dot:    "var(--color-parse-failed)",
  },
  UNKNOWN: {
    label: "Unknown",
    bg:     "var(--color-unknown-bg)",
    border: "var(--color-unknown-border)",
    text:   "var(--color-unknown)",
    dot:    "var(--color-unknown)",
  },
}

export function StatusBadge({ status }: { status: ServiceDto["status"] }) {
  const { label, bg, border, text, dot } = config[status] ?? config["UNKNOWN"]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border"
      style={{ background: bg, borderColor: border, color: text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot }} />
      {label}
    </span>
  )
}
