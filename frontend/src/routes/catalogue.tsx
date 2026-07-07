import { createFileRoute } from "@tanstack/react-router"
import CataloguePage from "@/domains/contract-sentinel/presentation/pages/catalogue-page"

export const Route = createFileRoute("/catalogue")({ component: CataloguePage })
