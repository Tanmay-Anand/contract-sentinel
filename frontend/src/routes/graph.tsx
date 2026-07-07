import { createFileRoute } from "@tanstack/react-router"
import GraphPage from "@/domains/contract-sentinel/presentation/pages/graph-page"
export const Route = createFileRoute("/graph")({ component: GraphPage })
