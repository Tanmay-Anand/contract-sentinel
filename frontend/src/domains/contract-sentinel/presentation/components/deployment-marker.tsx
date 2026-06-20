import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { DeploymentEventDto } from "../../infrastructure/api/types"

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

interface DeploymentMarkerProps {
  deployment: DeploymentEventDto
}

export function DeploymentMarker({ deployment }: DeploymentMarkerProps) {
  const [expanded, setExpanded] = useState(false)
  const label =
    deployment.buildVersion ??
    (deployment.gitCommit ? deployment.gitCommit.slice(0, 8) : "unknown")
  const branch = deployment.gitBranch ?? ""

  return (
    <div
      className="rounded-lg border-l-4 pl-3 pr-4 py-2.5 border"
      style={{
        borderLeftColor: "#d97706",
        borderColor: "var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      <button
        className="w-full text-left flex items-center gap-2"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xs font-semibold" style={{ color: "#b45309" }}>
          Deploy: {label}{branch ? ` · ${branch}` : ""}
        </span>
        <span className="text-xs ml-auto" style={{ color: "var(--color-text-secondary)" }}>
          {timeAgo(deployment.detectedAt)}
        </span>
        <span style={{ color: "var(--color-text-secondary)" }}>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {expanded && deployment.gitMessage && (
        <p className="mt-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
          {deployment.gitMessage}
        </p>
      )}
    </div>
  )
}
