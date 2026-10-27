import type { ProductType } from "@/lib/products"

export type ResearchMode = "open" | "directed"

export type ResearchInvestigation = {
  id: string
  title: string
  mode: ResearchMode
  query: string
  suggestedProductType: ProductType | null
  status: "DRAFT" | "RUNNING" | "COMPLETED" | "PARTIAL" | "INSUFFICIENT" | "FAILED"
  createdAt: string
  updatedAt: string
}

export type CreativePrompt = {
  id: string
  revision: number
  creativeText: string
  origin: "reference" | "research" | "owner"
}

export type GenerationConfig = {
  designId: string
  productType: ProductType
  provider: string
  model: string | null
  aspectRatio: string | null
}

export type CreativeDesign = {
  id: string
  projectId: string
  collectionId: string | null
  promptId: string
  promptRevision: number
  status: "DRAFT" | "APPROVED" | "REJECTED"
}
