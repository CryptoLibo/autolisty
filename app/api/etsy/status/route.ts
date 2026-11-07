import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getSelfShops, getSelfShopsDebug } from "@/lib/etsy/client"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"

export const runtime = "nodejs"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  if (!(await loadToken("etsy"))) {
    return NextResponse.json({ connected: false })
  }

  try {
    const token = await getFreshToken("etsy")
    if (!token) return NextResponse.json({ connected: false })

    let shops: Array<{ shop_id?: number; shop_name?: string }> = []
    let shopsError: string | null = null

    try {
      const results = await getSelfShops(token)
      shops = results.map((shop: any) => ({
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
      }))
    } catch (shopError: any) {
      shopsError = shopError?.message || "Unable to fetch Etsy shops"
    }

    let shopsDebug: {
      status?: number
      keys?: string[]
      preview?: string
    } | null = null

    if (!shops.length) {
      try {
        const debug = await getSelfShopsDebug(token)
        const parsedObject =
          debug.parsed && typeof debug.parsed === "object" && !Array.isArray(debug.parsed)
            ? (debug.parsed as Record<string, unknown>)
            : null

        shopsDebug = {
          status: debug.status,
          keys: parsedObject ? Object.keys(parsedObject).slice(0, 10) : [],
          preview: debug.rawText.slice(0, 400),
        }
      } catch (debugError: any) {
        shopsDebug = {
          preview: debugError?.message || "Unable to inspect Etsy shop response",
        }
      }
    }

    return NextResponse.json({
      connected: true,
      userId: token.user_id,
      scopes: token.scope,
      expiresAt: token.expires_at,
      shops,
      shopsError,
      shopsDebug,
    })
  } catch (error: any) {
    return NextResponse.json(
      { connected: true, error: error?.message || "No se pudo consultar Etsy; la conexión se conserva. Reautoriza si el token caducó." },
      { status: 503 }
    )
  }
}
