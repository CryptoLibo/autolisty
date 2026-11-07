import { requireOwnerApi } from "@/lib/auth/owner"
import { generatePinterestCopy } from "@/lib/seo/pinterestSeo"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    return Response.json(await generatePinterestCopy(body))
  } catch (error: any) {
    console.error("PINTEREST GENERATION ERROR:", error)
    return new Response(error?.message || "Server error", { status: 500 })
  }
}
