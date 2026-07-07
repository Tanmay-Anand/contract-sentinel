import { AlertTriangle } from "lucide-react"
import { useContainers, useGatewayHealth } from "../hooks/use-infrastructure"
import { ContainerStatusCard } from "../components/container-status-card"

function statusBadge(status: string) {
  const up = status.toUpperCase()
  const isOk = up === "UP" || up === "HEALTHY" || up === "200"
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: isOk ? "var(--color-healthy-bg)" : "var(--color-unreachable-bg)",
        color: isOk ? "var(--color-healthy)" : "var(--color-unreachable)",
      }}
    >
      {status}
    </span>
  )
}

export default function InfrastructurePage() {
  const { data: containers, isLoading: containersLoading } = useContainers()
  const { data: gatewayHealth, isLoading: gatewayLoading } = useGatewayHealth()

  // Detect if all services have the same gateway failure — likely a known nginx routing issue,
  // not individual service problems.
  const allGatewayDown = gatewayHealth
    && gatewayHealth.length > 0
    && gatewayHealth.every(r => r.gatewayStatus === "DOWN" && r.directStatus === "UP")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>Infrastructure</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
          Docker container health and gateway routing status. Auto-refreshes every 30s.
        </p>
      </div>

      {/* Docker Containers */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Docker Containers
        </h2>

        {containersLoading && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        )}

        {!containersLoading && (!containers || containers.length === 0) && (
          <div className="rounded-xl border p-8 text-center text-sm space-y-1"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
              No Docker data available.
            </p>
            <p>Make sure Docker Desktop is running and the sentinel has access.</p>
          </div>
        )}

        {containers && containers.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {containers.map(c => (
              <ContainerStatusCard key={c.id} container={c} />
            ))}
          </div>
        )}
      </section>

      {/* Gateway Health */}
      <section>
        <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--color-text-primary)" }}>
          Gateway Health
        </h2>

        {/* Known-issue banner: all services down via gateway but up directly = nginx config issue */}
        {allGatewayDown && (
          <div className="flex gap-3 p-4 rounded-xl mb-4"
            style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#92400e" }}>
                Known issue: nginx is not routing actuator health endpoints
              </p>
              <p className="text-xs mt-1" style={{ color: "#b45309" }}>
                All services are reachable directly but unreachable via the gateway
                ({gatewayHealth![0].gatewayUrl?.replace(/\/[^/]+\/actuator\/health$/, "/*")} → DOWN).
                This typically means the nginx <code className="font-mono bg-yellow-100 px-1 rounded">location</code> blocks
                are missing the <code className="font-mono bg-yellow-100 px-1 rounded">/actuator</code> path,
                or a trailing-slash redirect is stripping the subpath.
                Services themselves are healthy — this is a gateway configuration gap, not a service outage.
              </p>
            </div>
          </div>
        )}

        {gatewayLoading && (
          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading...</p>
        )}

        {!gatewayLoading && (!gatewayHealth || gatewayHealth.length === 0) && (
          <div className="rounded-xl border p-8 text-center text-sm"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
            No gateway health data available.
          </div>
        )}

        {gatewayHealth && gatewayHealth.length > 0 && (
          <div className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--color-border)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs border-b"
                  style={{ background: "var(--color-background)", borderColor: "var(--color-border)", color: "var(--color-text-secondary)" }}>
                  <th className="text-left px-4 py-2.5 font-medium">Service</th>
                  <th className="text-left px-4 py-2.5 font-medium">Direct</th>
                  <th className="text-left px-4 py-2.5 font-medium">Gateway</th>
                  <th className="text-left px-4 py-2.5 font-medium">Diagnosis</th>
                </tr>
              </thead>
              <tbody>
                {gatewayHealth.map((row, i) => (
                  <tr key={row.serviceId} className="border-t"
                    style={{
                      borderColor: "var(--color-border)",
                      background: i % 2 === 0 ? "var(--color-surface)" : "var(--color-background)",
                    }}>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {row.serviceName}
                      </p>
                      <p className="text-xs truncate max-w-xs font-mono" style={{ color: "var(--color-text-secondary)" }}>
                        {row.directUrl}
                      </p>
                    </td>
                    <td className="px-4 py-3">{statusBadge(row.directStatus)}</td>
                    <td className="px-4 py-3">
                      {row.gatewayUrl
                        ? statusBadge(row.gatewayStatus)
                        : <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>N/A</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: allGatewayDown ? "#d97706" : "var(--color-text-secondary)" }}>
                      {allGatewayDown ? "⚠ Known nginx routing gap — see banner above" : row.diagnosis}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
