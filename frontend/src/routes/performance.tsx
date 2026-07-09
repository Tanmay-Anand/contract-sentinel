import { createFileRoute } from "@tanstack/react-router"
import PerformancePage from "@/domains/contract-sentinel/presentation/pages/performance-page"

export const Route = createFileRoute("/performance")({ component: PerformancePage })
