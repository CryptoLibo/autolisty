import crypto from "node:crypto"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"
import { reviewKittlGeneration, saveKittlFeedback } from "./kittl-generation"

export type TelegramUpdate = {
  update_id: number
  message?: { message_id?: number; chat?: { id?: number; type?: string }; text?: string }
  callback_query?: { id?: string; data?: string; message?: { chat?: { id?: number; type?: string } } }
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
  if (saveKittlFeedback(allowedChatId, text)) return null
  return repository.receiveTelegramUpdate(update.update_id, allowedChatId, text, update.message?.message_id)
}

export async function processKittlCallback(update: TelegramUpdate, allowedChatId: string | undefined, token: string, send: typeof fetch = fetch) {
  const query = update.callback_query
  const chat = query?.message?.chat
  if (!allowedChatId || chat?.type !== "private" || String(chat.id) !== allowedChatId || !query?.id) return false
  const match = /^kg:([ar]):([0-9a-f-]{36})$/.exec(query.data || "")
  if (!match) return false
  const verdict = match[1] === "a" ? "approved" : "revise"
  const changed = reviewKittlGeneration(match[2], verdict, allowedChatId)
  await send(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: query.id, text: changed ? verdict === "approved" ? "Diseño aprobado" : "Escribe los cambios que quieres hacer" : "Esta revisión ya fue registrada" }), cache: "no-store",
  })
  if (changed) await send(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ chat_id: allowedChatId, text: verdict === "approved"
      ? "Imagen aprobada y registrada en Company."
      : "Escribe en este chat qué quieres cambiar en la imagen. Guardaré tus indicaciones para la siguiente versión." }),
  })
  return true
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
    if (task && !["COMPLETED", "NEEDS_REVIEW", "RUNNING"].includes(task.status)) {
      task = await runCompanyStage(repository, task.id)
    }
    if (!task || !["COMPLETED", "NEEDS_REVIEW"].includes(task.status)) return
    const ownerRequest = repository.messages(task.conversation_id).find((message) => message.id === task.owner_message_id)?.content || ""
    const answer = task.status === "COMPLETED"
      ? repository.messages(task.conversation_id).filter((message) => message.role === "assistant").at(-1)?.content
      : `Encargo: ${ownerRequest.slice(0, 180)}\n\nLa solicitud necesita revisión: ${(task.last_error || "causa no identificada").slice(0, 300)}. No la repetiré automáticamente para evitar cargos duplicados.`
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
    body: JSON.stringify({ chat_id: ready.chat_id, text: reply, ...(ready.telegram_message_id ? { reply_parameters: { message_id: ready.telegram_message_id, allow_sending_without_reply: true } } : {}) }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Telegram delivery failed (${response.status}); delivery status is uncertain.`)
  const result = await response.json() as { ok?: boolean }
  if (!result.ok) throw new Error("Telegram delivery status is uncertain.")
  repository.telegramReplySent(updateId)
}
