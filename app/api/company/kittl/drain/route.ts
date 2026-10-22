import crypto from "node:crypto"
import { drainKittlGenerations } from "@/lib/company/kittl-generation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const configured = process.env.COMPANY_WORKER_SECRET
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "")
  if (!configured || !supplied || configured.length < 32 || supplied.length !== configured.length ||
    !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(configured))) return new Response(null, { status: 403 })
  const results = await drainKittlGenerations()
  return Response.json({ results })
}
