import { requireOwnerApi } from "@/lib/auth/owner"
import { generateEtsySeo } from "@/lib/seo/etsySeo"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  try {
    const body = await req.json()
    const output = await generateEtsySeo(body)
    return new Response(JSON.stringify(output), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err: any) {
    console.error("API ERROR:", err)
    return new Response(err.message || "Server error", { status: 500 })
  }
}
