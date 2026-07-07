import { createFileRoute } from "@tanstack/react-router"
import AlertsPage from "@/domains/contract-sentinel/presentation/pages/alerts-page"

export const Route = createFileRoute("/alerts")({ component: AlertsPage })
