import { createFileRoute } from "@tanstack/react-router"
import InfrastructurePage from "@/domains/contract-sentinel/presentation/pages/infrastructure-page"

export const Route = createFileRoute("/infrastructure")({ component: InfrastructurePage })
