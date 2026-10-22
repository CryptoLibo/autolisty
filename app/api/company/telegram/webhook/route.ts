import { after } from "next/server"
import { authorizedTelegramRequest, acceptTelegramUpdate, processTelegramUpdate, processKittlCallback, type TelegramUpdate } from "@/lib/company/telegram"
import { CompanyRepository } from "@/lib/company/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!authorizedTelegramRequest(request.headers.get("x-telegram-bot-api-secret-token"), process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response(null, { status: 403 })
  }
  const token = process.env.TELEGRAM_BOT_TOKEN
  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  if (!token || !allowedChatId) return new Response(null, { status: 503 })
  const update = await request.json().catch(() => null) as TelegramUpdate | null
  if (!update) return new Response(null, { status: 400 })
  const repository = new CompanyRepository()
  try {
    if (update.callback_query) {
      await processKittlCallback(update, allowedChatId, token)
      return new Response(null, { status: 200 })
    }
    const accepted = acceptTelegramUpdate(repository, update, allowedChatId)
    if (accepted) {
      after(async () => {
        for (const item of repository.pendingTelegramUpdates(allowedChatId)) {
          try { await processTelegramUpdate(repository, item.update_id, token) } catch { /* Keep uncertain deliveries for manual review. */ }
        }
      })
    }
    return new Response(null, { status: 200 })
  } catch {
    return new Response(null, { status: 409 })
  }
}
