import { createFileRoute } from "@tanstack/react-router"
import DriftFeedPage from "@/domains/contract-sentinel/presentation/pages/drift-feed-page"

export const Route = createFileRoute("/drift")({
  component: DriftFeedPage,
})
