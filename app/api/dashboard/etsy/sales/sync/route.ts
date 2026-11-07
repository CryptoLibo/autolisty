import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"
import { getPrimaryShop } from "@/lib/etsy/listings"
import { SalesSyncError, syncEtsySales } from "@/lib/dashboard/etsy-sales"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const parsed = await loadToken("etsy")
  if (!parsed) return Response.json({ error: "Conecta Etsy antes de sincronizar." }, { status: 401 })
  if (!Array.isArray(parsed.scope) || !["shops_r", "transactions_r"].every((scope) => parsed.scope.includes(scope))) {
    return Response.json({ error: "Falta el permiso de pedidos. Reautoriza Etsy explícitamente.", code: "missing_scope" }, { status: 403 })
  }
  try {
    const token = await getFreshToken("etsy")
    if (!token) throw new Error("Etsy is not connected.")
    const shop = await getPrimaryShop(token)
    const result = await syncEtsySales(getAutomationDatabase(), Number(shop.shop_id), token)
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = error instanceof SalesSyncError ? error.code : "connection_failed"
    return Response.json({ code, error: code === "sync_recent_or_running" ? "Ya hay una sincronización reciente o en curso." :
      code === "rate_limited" ? "Etsy limitó las solicitudes. Intenta más tarde." :
      code === "permission_denied" ? "Etsy denegó el permiso para consultar pedidos." :
      code === "authentication_expired" ? "La sesión de Etsy caducó. Vuelve a conectar." :
      "No se pudieron sincronizar los pedidos. Se conservan los últimos datos válidos." },
      { status: error instanceof SalesSyncError ? error.status : 502 })
  }
}
