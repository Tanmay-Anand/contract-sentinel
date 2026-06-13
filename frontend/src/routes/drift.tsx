import { createFileRoute } from "@tanstack/react-router"
import DriftFeedPage from "@/pages/DriftFeedPage"

export const Route = createFileRoute("/drift")({
  component: DriftFeedPage,
})
