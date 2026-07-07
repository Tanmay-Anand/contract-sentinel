import type { ContainerDto } from "../../infrastructure/api/types"

function healthColor(health: string): { bg: string; color: string } {
  const h = health.toLowerCase()
  if (h === "healthy")   return { bg: "var(--color-healthy-bg)", color: "var(--color-healthy)" }
  if (h === "unhealthy") return { bg: "var(--color-unreachable-bg)", color: "var(--color-unreachable)" }
  return { bg: "var(--color-background)", color: "var(--color-text-secondary)" }
}

interface ContainerStatusCardProps {
  container: ContainerDto
}

export function ContainerStatusCard({ container }: ContainerStatusCardProps) {
  const hc = healthColor(container.health)

  return (
    <div
      className="rounded-xl border p-4 space-y-2"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: container.running ? "var(--color-healthy)" : "var(--color-unreachable)" }}
          />
          <p className="font-semibold text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
            {container.name}
          </p>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
          style={{ background: hc.bg, color: hc.color }}
        >
          {container.health || "none"}
        </span>
      </div>

      <p className="text-xs truncate" style={{ color: "var(--color-text-secondary)" }}>
        {container.image}
      </p>

      {container.ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {container.ports.map(port => (
            <span
              key={port}
              className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--color-background)", color: "var(--color-text-secondary)" }}
            >
              {port}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
