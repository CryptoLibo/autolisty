import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { SeoLessonStore, type SeoLessonStatus } from "@/lib/automation/seoLessons"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  return NextResponse.json({ lessons: new SeoLessonStore().list() })
}

// { id, status: "ACTIVE" | "DISABLED" | "REJECTED" }
export async function PATCH(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const body = await request.json().catch(() => null) as { id?: number; status?: SeoLessonStatus } | null
  if (!body?.id || !body.status || !["ACTIVE", "DISABLED", "REJECTED"].includes(body.status)) {
    return NextResponse.json({ error: "Send a lesson id and a status (ACTIVE, DISABLED or REJECTED)." }, { status: 400 })
  }
  try {
    return NextResponse.json({ lesson: new SeoLessonStore().setStatus(Number(body.id), body.status) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update the lesson." }, { status: 400 })
  }
}
