import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowRight, RefreshCw, Zap } from "lucide-react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { sentinelApi } from "@/api/client"
import { StatusBadge } from "./StatusBadge"
import { ProfilerPanel } from "@/domains/contract-sentinel/presentation/components/profiler-panel"
import type { ServiceDto } from "@/api/types"

interface Props {
  service: ServiceDto
}

export function ServiceCard({ service }: Props) {
  const queryClient = useQueryClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const reachable = service.status !== "UNREACHABLE"

  const { mutate: poll, isPending } = useMutation({
    mutationFn: () => sentinelApi.poll.one(service.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services"] })
    },
  })

  const hasBreaking = service.breakingDriftCount > 0
  const fullUrl = `${service.baseUrl}${service.specPath}`

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3 h-full transition-shadow hover:shadow-md"
      style={{
        background: "var(--color-surface)",
        borderColor: hasBreaking ? "var(--color-breaking-border)" : "var(--color-border)",
      }}
    >
      {/* Top: name + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate mb-0.5">{service.name}</h3>
          <code
            className="text-xs block truncate"
            style={{ color: "var(--color-text-secondary)" }}
            title={fullUrl}
          >
            {fullUrl}
          </code>
        </div>
        <div className="shrink-0">
          <StatusBadge status={service.status} />
        </div>
      </div>

      {/* Breaking alert */}
      {hasBreaking && (
        <div
          className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{
            background: "var(--color-breaking-bg)",
            color: "var(--color-breaking)",
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            <strong>{service.breakingDriftCount}</strong> breaking change{service.breakingDriftCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Spacer to push footer down */}
      <div className="flex-1" />

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-3 border-t"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => poll()}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{
              color: "var(--color-text-secondary)",
              borderColor: "var(--color-border)",
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            Poll now
          </button>
          <button
            onClick={() => setProfileOpen(true)}
            disabled={!reachable}
            title={reachable ? "Profile CPU hotspots" : "Service unreachable"}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-slate-50 disabled:opacity-40"
            style={{ color: "var(--color-text-secondary)", borderColor: "var(--color-border)" }}
          >
            <Zap className="w-3.5 h-3.5" />
            Profile
          </button>
        </div>

        <Link
          to="/services/$serviceId"
          params={{ serviceId: service.id }}
          className="flex items-center gap-1 text-xs font-medium transition-colors"
          style={{ color: "var(--color-primary)" }}
        >
          View detail
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <ProfilerPanel serviceId={service.id} serviceName={service.name} open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  )
}
