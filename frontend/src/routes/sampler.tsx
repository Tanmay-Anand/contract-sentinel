import { createFileRoute } from "@tanstack/react-router"
import SamplerPage from "@/domains/contract-sentinel/presentation/pages/sampler-page"

export const Route = createFileRoute("/sampler")({ component: SamplerPage })
