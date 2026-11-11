import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { loadToken } from "@/lib/integrations/tokenSession"
import { getSalesSnapshot } from "@/lib/dashboard/etsy-sales"
import { isDashboardPeriod } from "@/lib/dashboard/overview"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const period = new URL(request.url).searchParams.get("period") || "30d"
  if (!isDashboardPeriod(period)) return Response.json({ error: "Periodo no válido." }, { status: 400 })
  try {
    const token = await loadToken("etsy")
    const authorized = Boolean(token?.scope?.includes("transactions_r"))
    const db = getAutomationDatabase()
    const snapshot = getSalesSnapshot(db, period, Boolean(token), authorized)
    // Cada producto con su título y, si lo creó Automation, su miniatura.
    const title = db.prepare("SELECT title FROM dashboard_etsy_listings WHERE listing_id = ? LIMIT 1")
    const job = db.prepare("SELECT id FROM automation_jobs WHERE etsy_draft_id = ? ORDER BY created_at DESC LIMIT 1")
    const products = snapshot.products.map((item) => item.listingId == null ? { ...item, title: null, jobId: null } : {
      ...item,
      title: (title.get(item.listingId) as { title: string } | undefined)?.title ?? null,
      jobId: (job.get(String(item.listingId)) as { id: string } | undefined)?.id ?? null,
    })
    return Response.json({ ...snapshot, products }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return Response.json({ error: "No se pudo leer la caché de ventas." }, { status: 503 })
  }
}
