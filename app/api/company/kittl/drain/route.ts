import { drainKittlGenerations } from "@/lib/company/kittl-generation"
import { authorizedCompanyWorker, markCompanyWorkerAlive } from "@/lib/company/worker-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!authorizedCompanyWorker(request)) return new Response(null, { status: 403 })
  markCompanyWorkerAlive()
  const results = await drainKittlGenerations()
  return Response.json({ results })
}
