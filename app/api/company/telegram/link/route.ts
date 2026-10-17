import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  if (!chatId || !/^-?\d+$/.test(chatId)) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 })
  const body = await request.json().catch(() => null) as { conversationId?: unknown } | null
  if (typeof body?.conversationId !== "string") return NextResponse.json({ error: "Conversation is required." }, { status: 400 })
  const repository = new CompanyRepository()
  try {
    repository.linkTelegramConversation(chatId, body.conversationId)
    return NextResponse.json({ linked: true })
  } catch {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 })
  }
}
