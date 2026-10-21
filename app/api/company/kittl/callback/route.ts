import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { finishKittlAuthorization } from "@/lib/company/kittl"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const url = new URL(request.url)
  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  if (!code || !state || code.length > 2000 || state.length > 200) {
    return NextResponse.redirect(new URL("/company/operations?kittl=invalid", request.url))
  }
  try {
    await finishKittlAuthorization(code, state)
    return NextResponse.redirect(new URL("/company/operations?kittl=connected", request.url))
  } catch {
    return NextResponse.redirect(new URL("/company/operations?kittl=failed", request.url))
  }
}
