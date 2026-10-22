import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { finishKittlAuthorization } from "@/lib/company/kittl"

export const runtime = "nodejs"

function operationsUrl(status: "invalid" | "connected" | "failed", requestUrl: string) {
  const base = new URL(process.env.COMPANY_PUBLIC_URL || requestUrl)
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new Error("COMPANY_PUBLIC_URL must use HTTPS in production.")
  }
  return new URL(`/company/operations?kittl=${status}`, base.origin)
}

export async function GET(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const url = new URL(request.url)
  const code = url.searchParams.get("code") || ""
  const state = url.searchParams.get("state") || ""
  if (!code || !state || code.length > 2000 || state.length > 200) {
    return NextResponse.redirect(operationsUrl("invalid", request.url))
  }
  try {
    await finishKittlAuthorization(code, state)
    return NextResponse.redirect(operationsUrl("connected", request.url))
  } catch {
    return NextResponse.redirect(operationsUrl("failed", request.url))
  }
}
