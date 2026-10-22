import crypto from "node:crypto"
import { drainKittlGenerations } from "@/lib/company/kittl-generation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authSecret = process.env.AUTH_SECRET
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "")
  if (!authSecret || !supplied) return new Response(null, { status: 403 })
  const expected = crypto.createHmac("sha256", authSecret).update("company-kittl-worker-v1").digest("hex")
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response(null, { status: 403 })
  const results = await drainKittlGenerations()
  return Response.json({ results })
}
