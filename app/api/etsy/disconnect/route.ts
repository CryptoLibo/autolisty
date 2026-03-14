import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { ETSY_AUTH_COOKIE, ETSY_PKCE_COOKIE } from "@/lib/etsy/auth"

export const runtime = "nodejs"

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete(ETSY_AUTH_COOKIE)
  cookieStore.delete(ETSY_PKCE_COOKIE)

  return NextResponse.json({ ok: true })
}
