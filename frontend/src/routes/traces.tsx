import { createFileRoute } from "@tanstack/react-router"
import TracesPage from "@/domains/contract-sentinel/presentation/pages/traces-page"

export const Route = createFileRoute("/traces")({ component: TracesPage })
