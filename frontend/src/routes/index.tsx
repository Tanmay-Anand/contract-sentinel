import { createFileRoute } from "@tanstack/react-router"
import OverviewPage from "@/domains/contract-sentinel/presentation/pages/overview-page"

export const Route = createFileRoute("/")({
  component: OverviewPage,
})
