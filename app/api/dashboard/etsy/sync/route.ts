import { requireOwnerApi } from "@/lib/auth/owner"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"
import { getPrimaryShop } from "@/lib/etsy/listings"
import { CatalogSyncError, syncEtsyCatalog } from "@/lib/dashboard/etsy-catalog"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const parsed = await loadToken("etsy")
  if (!parsed) return Response.json({ error: "Conecta Etsy antes de sincronizar." }, { status: 401 })
  if (!Array.isArray(parsed.scope) || !["shops_r", "listings_r"].every((scope) => parsed.scope.includes(scope))) {
    return Response.json({ error: "Faltan permisos de lectura de tienda o listings. Reautoriza Etsy.", code: "missing_scope" }, { status: 403 })
  }
  try {
    const token = await getFreshToken("etsy")
    if (!token) throw new Error("Etsy is not connected.")
    const shop = await getPrimaryShop(token)
    const result = await syncEtsyCatalog(getAutomationDatabase(), Number(shop.shop_id), token)
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const code = error instanceof CatalogSyncError ? error.code : "connection_failed"
    return Response.json({ error: code === "sync_recent_or_running" ? "Ya hay una sincronización reciente o en curso." :
      code === "rate_limited" ? "Etsy limitó las solicitudes. Intenta más tarde." :
      code === "permission_denied" ? "Etsy denegó el acceso. Comprueba los permisos." :
      code === "authentication_expired" ? "La sesión de Etsy ha caducado. Vuelve a conectar." :
      "No se pudo sincronizar Etsy. Los últimos datos válidos se conservan.", code },
      { status: error instanceof CatalogSyncError ? error.status : 502 })
  }
}
