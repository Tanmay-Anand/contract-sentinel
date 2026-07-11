import { useState } from "react"
import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Toaster } from "sonner"
import { Activity, List, BookOpen, Server, Network, Gauge, Waypoints } from "lucide-react"
import logo from "../assets/logo.png"
import { useCallCount } from "../domains/contract-sentinel/presentation/hooks/use-stats"
import { useConnectionState } from "../domains/contract-sentinel/presentation/hooks/use-event-subscription"

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--color-background)" }}>
      <header
        className="border-b px-6 py-3 flex items-center gap-6 sticky top-0 z-10"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="flex items-center mr-4">
          <img src={logo} alt="ContractSentinel" style={{ height: 35, width: "auto" }} />
        </div>
        <nav className="flex items-center gap-1 flex-wrap">
          <NavLink to="/"              icon={<Activity      className="w-4 h-4" />} label="Overview"       />
          <NavLink to="/drift"          icon={<List    className="w-4 h-4" />} label="Contract Changes" />
          <NavLink to="/catalogue"     icon={<BookOpen className="w-4 h-4" />} label="Catalogue"        />
          <NavLink to="/performance"    icon={<Gauge   className="w-4 h-4" />} label="Performance"      />
          <NavLink to="/traces"         icon={<Waypoints className="w-4 h-4" />} label="Traces"         />
          <NavLink to="/infrastructure" icon={<Server  className="w-4 h-4" />} label="Infrastructure"   />
          <NavLink to="/graph"          icon={<Network      className="w-4 h-4" />} label="Graph"          />
        </nav>
        <div className="ml-auto">
          <CallCountBadge />
        </div>
      </header>
      <main className="flex-1 p-6 w-full">
        <Outlet />
      </main>
      <Toaster richColors position="bottom-right" />
      <TanStackRouterDevtools />
    </div>
  )
}

function NavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
      style={{ color: "var(--color-text-secondary)" }}
      activeProps={{ style: { color: "var(--color-primary)", background: "var(--color-primary-bg)" } }}
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      {label}
    </Link>
  )
}

const DOT_COLOR: Record<string, string> = {
  open:       "#16a34a",
  connecting: "#f59e0b",
  closed:     "#94a3b8",
}

function CallCountBadge() {
  const { data } = useCallCount()
  const [open, setOpen] = useState(false)
  const wsState = useConnectionState()

  if (!data) return null

  const fmt = (n: number) => n.toLocaleString()

  const rows: [string, number][] = [
    ["Spec polls",       data.specPolls],
    ["Actuator info",    data.actuatorInfo],
    ["Actuator env",     data.actuatorEnv],
    ["Outbound scans",   data.outboundScans],
    ["Sampler runs",     data.samplerRuns],
    ["Actuator metrics", data.actuatorMetrics],
  ]
  const max = Math.max(1, ...rows.map(([, n]) => n))

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium select-none"
        style={{
          color: "var(--color-text-secondary)",
          border: `1px solid ${open ? "var(--color-primary)" : "var(--color-border)"}`,
          background: open ? "var(--color-primary-bg)" : "transparent",
          fontVariantNumeric: "tabular-nums",
          cursor: "default",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <span style={{ color: DOT_COLOR[wsState] ?? "#94a3b8", fontSize: 8, lineHeight: 1 }}>â—</span>
        <span style={{ color: "var(--color-text-primary)" }}>Live</span>
        <span style={{ color: "var(--color-text-secondary)" }}>Â· {fmt(data.total)} out Â· {fmt(data.ingestRequests)} recv</span>
      </div>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-xl border p-3 z-20"
          style={{
            top: "100%",
            width: 260,
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
            boxShadow: "0 8px 24px rgba(15, 15, 38, 0.12)",
          }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Outbound API calls
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>
              since startup
            </span>
          </div>

          <div className="space-y-1.5">
            {rows.map(([label, n]) => (
              <div key={label} className="flex items-center gap-2">
                <span className="text-xs w-28 shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                  {label}
                </span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-background)" }}>
                  <div className="h-1.5 rounded-full"
                    style={{ width: `${(n / max) * 100}%`, background: "var(--color-primary)", opacity: n === 0 ? 0 : 1 }} />
                </div>
                <span className="text-xs w-10 text-right tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                  {fmt(n)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t"
            style={{ borderColor: "var(--color-border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>Total</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--color-primary)" }}>
              {fmt(data.total)}
            </span>
          </div>

          <div className="mt-2.5 pt-2.5 border-t" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Inbound trace calls
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--color-primary-bg)", color: "var(--color-primary)" }}>
                since startup
              </span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: "Dev (batch-size:1)", value: data.ingestRequests, color: "#f59e0b" },
                { label: "Prod equivalent (~50/b)", value: data.prodEquivalentRequests, color: "#16a34a" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs w-36 shrink-0" style={{ color: "var(--color-text-secondary)" }}>
                    {label}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--color-background)" }}>
                    <div className="h-1.5 rounded-full"
                      style={{
                        width: `${data.ingestRequests === 0 ? 0 : (value / data.ingestRequests) * 100}%`,
                        background: color,
                        opacity: value === 0 ? 0 : 1,
                      }} />
                  </div>
                  <span className="text-xs w-10 text-right tabular-nums" style={{ color: "var(--color-text-primary)" }}>
                    {fmt(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
