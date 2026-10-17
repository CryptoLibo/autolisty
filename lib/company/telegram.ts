import crypto from "node:crypto"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"

export type TelegramUpdate = {
  update_id: number
  message?: { chat?: { id?: number; type?: string }; text?: string }
}

export function authorizedTelegramRequest(secret: string | null, expected: string | undefined) {
  if (!expected || !secret || !/^[A-Za-z0-9_-]{1,256}$/.test(expected)) return false
  const left = Buffer.from(secret)
  const right = Buffer.from(expected)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function acceptTelegramUpdate(repository: CompanyRepository, update: TelegramUpdate, allowedChatId: string | undefined) {
  const chat = update.message?.chat
  if (!allowedChatId || !/^-?\d+$/.test(allowedChatId) || chat?.type !== "private" || String(chat.id) !== allowedChatId) return null
  if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) return null
  const text = update.message?.text?.trim()
  if (!text || text.length > 8000 || text.startsWith("/")) return null
  return repository.receiveTelegramUpdate(update.update_id, allowedChatId, text)
}

export async function processTelegramUpdate(
  repository: CompanyRepository,
  updateId: number,
  token: string,
  send: typeof fetch = fetch
) {
  const update = repository.telegramUpdate(updateId)
  if (!update?.task_id || !["PENDING", "REPLY_READY"].includes(update.status)) return
  if (update.status === "PENDING") {
    let task = repository.task(update.task_id)
    for (let step = 0; step < 3 && task && !["COMPLETED", "NEEDS_REVIEW"].includes(task.status); step++) {
      if (task.status === "RUNNING") break
      task = await runCompanyStage(repository, task.id)
    }
    if (!task || task.status === "RUNNING") return
    const answer = task.status === "COMPLETED"
      ? repository.messages(task.conversation_id).filter((message) => message.role === "assistant").at(-1)?.content
      : "La solicitud necesita revisión. No la repetiré automáticamente para evitar cargos duplicados."
    repository.telegramReplyReady(updateId, answer || "No se obtuvo una respuesta.")
  }
  const ready = repository.telegramUpdate(updateId)
  if (!ready?.reply_text || !repository.claimTelegramReply(updateId)) return
  const reply = ready.reply_text.length > 4096
    ? `${ready.reply_text.slice(0, 3900)}\n\n[Respuesta completa disponible en Autolisty Company]`
    : ready.reply_text
  const response = await send(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: ready.chat_id, text: reply }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Telegram delivery failed (${response.status}); delivery status is uncertain.`)
  const result = await response.json() as { ok?: boolean }
  if (!result.ok) throw new Error("Telegram delivery status is uncertain.")
  repository.telegramReplySent(updateId)
}
