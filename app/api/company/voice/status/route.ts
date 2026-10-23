import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { voiceEnabled, voiceUsageToday } from "@/lib/company/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  return NextResponse.json({ enabled: voiceEnabled(), usage: voiceUsageToday() })
}
