import { createRootRoute, Link, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ShieldCheck, Activity, List } from "lucide-react"

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
        <div className="flex items-center gap-2 mr-4">
          <ShieldCheck className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          <span className="font-semibold text-sm tracking-tight">ContractSentinel</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" icon={<Activity className="w-4 h-4" />} label="Overview" />
          <NavLink to="/drift" icon={<List className="w-4 h-4" />} label="Drift Feed" />
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>
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
      activeProps={{
        style: {
          color: "var(--color-primary)",
          background: "var(--color-primary-bg)",
        },
      }}
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      {label}
    </Link>
  )
}
