import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Toaster } from "sonner"
import { Activity, List, BookOpen, Server, Network, Radio } from "lucide-react"
import logo from "../assets/logo.png"
import { useCallCount } from "../domains/contract-sentinel/presentation/hooks/use-stats"

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

function CallCountBadge() {
  const { data } = useCallCount()

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

  const tooltipLines = rows
    .map(([label, n]) => `${label.padEnd(18)}${fmt(n).padStart(7)}`)
    .join("\n")
  const separator = "─".repeat(25)
  const totalLine  = `${"Total".padEnd(18)}${fmt(data.total).padStart(7)}`
  const tooltip = `${tooltipLines}\n${separator}\n${totalLine}`

  return (
    <div
      title={tooltip}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium select-none"
      style={{
        color: "var(--color-text-secondary)",
        border: "1px solid var(--color-border)",
        fontVariantNumeric: "tabular-nums",
        cursor: "default",
        whiteSpace: "nowrap",
      }}
    >
      <Radio className="w-3 h-3 shrink-0" />
      {fmt(data.total)} calls
    </div>
  )
}
