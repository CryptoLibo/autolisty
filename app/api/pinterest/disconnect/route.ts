import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import {
  PINTEREST_AUTH_COOKIE,
  PINTEREST_PKCE_COOKIE,
} from "@/lib/pinterest/auth"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const cookieStore = await cookies()
  cookieStore.delete(PINTEREST_AUTH_COOKIE)
  cookieStore.delete(PINTEREST_PKCE_COOKIE)

  return NextResponse.json({ ok: true })
}
