import { after } from "next/server"
import { authorizedTelegramRequest, acceptTelegramUpdate, processTelegramUpdate, processKittlCallback, type TelegramUpdate } from "@/lib/company/telegram"
import { CompanyRepository } from "@/lib/company/repository"
import { saveKittlFeedback } from "@/lib/company/kittl-generation"
import { getCompanyDatabase } from "@/lib/company/db"

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
    if (update.message?.chat?.type === "private" && String(update.message.chat.id) === allowedChatId &&
      Number.isSafeInteger(update.update_id) && update.message.text?.trim() &&
      getCompanyDatabase().transaction(() => {
        if (repository.telegramUpdate(update.update_id)) return false
        if (!saveKittlFeedback(allowedChatId, update.message!.text!)) return false
        getCompanyDatabase().prepare("INSERT INTO company_telegram_updates(update_id,chat_id,status,created_at,updated_at) VALUES(?,?,'FEEDBACK',?,?)")
          .run(update.update_id, allowedChatId, new Date().toISOString(), new Date().toISOString())
        return true
      })()) {
      after(async () => {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ chat_id: allowedChatId, text: "Cambios guardados en Company. No generaré otra imagen ni gastaré créditos hasta que autorices una nueva versión." }),
        })
      })
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
