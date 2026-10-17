import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { processTelegramUpdate } from "@/lib/company/telegram"

export const runtime = "nodejs"

export async function POST() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!chatId || !token) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 })
  const repository = new CompanyRepository()
  const pending = repository.pendingTelegramUpdates(chatId)
  for (const item of pending) await processTelegramUpdate(repository, item.update_id, token)
  return NextResponse.json({ processed: pending.length })
}
