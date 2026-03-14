import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { ETSY_AUTH_COOKIE, EtsyTokenPayload } from "@/lib/etsy/auth"
import { ensureFreshToken, getSelfShops } from "@/lib/etsy/client"

export const runtime = "nodejs"

export async function GET() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(ETSY_AUTH_COOKIE)?.value

  if (!raw) {
    return NextResponse.json({ connected: false })
  }

  try {
    const parsed = JSON.parse(raw) as EtsyTokenPayload
    const token = await ensureFreshToken(parsed)

    if (token.access_token !== parsed.access_token || token.expires_at !== parsed.expires_at) {
      cookieStore.set(ETSY_AUTH_COOKIE, JSON.stringify(token), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      })
    }

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

    return NextResponse.json({
      connected: true,
      userId: token.user_id,
      scopes: token.scope,
      expiresAt: token.expires_at,
      shops,
      shopsError,
    })
  } catch (error: any) {
    cookieStore.delete(ETSY_AUTH_COOKIE)
    return NextResponse.json(
      { connected: false, error: error?.message || "Invalid Etsy session" },
      { status: 401 }
    )
  }
}
