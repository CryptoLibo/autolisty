import { createHash } from "node:crypto"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { generateCreativePrompts } from "@/lib/research/creativeEngine"
import { createOpenAICreativeProvider } from "@/lib/research/openaiCreativeProvider"
import { PromptRunRepository } from "@/lib/research/promptRuns"
import { PRODUCT_OPTIONS, type ProductType } from "@/lib/products"
import { researchSchemaGate } from "@/lib/research/schemaGate"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    const repo = new PromptRunRepository(getAutomationDatabase())
    const url = new URL(request.url)
    const versionId = url.searchParams.get("versionId")
    const runId = url.searchParams.get("runId")
    if (versionId) return Response.json({ result: repo.get(versionId) })
    if (runId) return Response.json({ versions: repo.versions(runId) })
    return Response.json({ runs: repo.list() })
  } catch { return Response.json({ error: "Prompt history is unavailable." }, { status: 500 }) }
}

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const schema = researchSchemaGate()
  if (schema) return schema
  try {
    const form = await request.formData()
    const text = (key: string) => String(form.get(key) || "").trim()
    const mode = text("mode")
    if (mode !== "variations" && mode !== "independent") throw new Error("Choose a generation mode.")
    const productType = text("productType")
    if (productType && !PRODUCT_OPTIONS.some((product) => product.value === productType)) throw new Error("Invalid product type.")
    const files = form.getAll("files").filter((file): file is File => file instanceof File)
    if (files.length > 3) throw new Error("At most three reference images are supported.")
    const referenceImages: string[] = [], referenceHashes: string[] = []
    for (const file of files) {
      if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 8 * 1024 * 1024) {
        throw new Error("References must be PNG, JPEG, WebP or GIF under 8 MB each.")
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      referenceHashes.push(createHash("sha256").update(bytes).digest("hex"))
      referenceImages.push(`data:${file.type};base64,${bytes.toString("base64")}`)
    }
    if (!referenceImages.length && !text("brief") && !text("investigationId")) throw new Error("Provide a brief, investigation, or reference.")
    const result = await generateCreativePrompts(getAutomationDatabase(), {
      brief: text("brief") || text("investigationId") || "Analyze the visual references and propose original commercial artwork.",
      mode, niche: text("niche"), productType: productType as ProductType || undefined,
      investigationId: text("investigationId") || undefined, opportunityId: text("opportunityId") || undefined,
      conceptId: text("conceptId") || undefined, referenceHashes, referenceImages,
      regenerate: text("regenerate") === "true",
      requiredTerms: text("requiredTerms").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 10),
    }, createOpenAICreativeProvider())
    return Response.json({ result })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Prompt generation failed." }, { status: 400 })
  }
}
