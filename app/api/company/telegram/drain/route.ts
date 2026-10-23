import { NextResponse } from "next/server"
import { CompanyRepository } from "@/lib/company/repository"
import { processTelegramUpdate } from "@/lib/company/telegram"
import { authorizedCompanyWorker } from "@/lib/company/worker-auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  if (!authorizedCompanyWorker(request)) return new Response(null, { status: 403 })
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!chatId || !token) return NextResponse.json({ error: "Telegram is not configured." }, { status: 503 })
  const repository = new CompanyRepository()
  repository.recoverInterrupted()
  const pending = repository.pendingTelegramUpdates(chatId)
  let processed = 0
  for (const item of pending) {
    const update = repository.telegramUpdate(item.update_id)
    const task = update?.task_id ? repository.task(update.task_id) : null
    if (update?.status !== "REPLY_READY" && task && !["COMPLETED", "NEEDS_REVIEW"].includes(task.status)) continue
    await processTelegramUpdate(repository, item.update_id, token)
    processed++
  }
  const next = repository.pendingTelegramUpdates(chatId).find((item) => {
    const update = repository.telegramUpdate(item.update_id)
    const task = update?.task_id ? repository.task(update.task_id) : null
    return update?.status === "PENDING" && task && !["COMPLETED", "NEEDS_REVIEW", "RUNNING"].includes(task.status)
  })
  if (next) { await processTelegramUpdate(repository, next.update_id, token); processed++ }
  return NextResponse.json({ processed })
}
