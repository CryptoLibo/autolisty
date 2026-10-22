import { describe, expect, it, vi } from "vitest"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { acceptTelegramUpdate, authorizedTelegramRequest, processTelegramUpdate } from "./telegram"

describe("Telegram Company adapter", () => {
  it("rejects unauthorized secrets and chats", () => {
    expect(authorizedTelegramRequest("secret", "secret")).toBe(true)
    expect(authorizedTelegramRequest("other", "secret")).toBe(false)
    const db = openCompanyDatabase(":memory:")
    try {
      const repo = new CompanyRepository(db)
      expect(acceptTelegramUpdate(repo, { update_id: 1, message: { chat: { id: 456, type: "private" }, text: "Hola" } }, "123")).toBeNull()
      expect(repo.listConversations()).toHaveLength(0)
    } finally { db.close() }
  })

  it("deduplicates updates and shares one durable CEO conversation", async () => {
    const db = openCompanyDatabase(":memory:")
    try {
      const repo = new CompanyRepository(db)
      const message = (update_id: number, text: string) => ({ update_id, message: { chat: { id: 123, type: "private" }, text } })
      const first = acceptTelegramUpdate(repo, message(1, "Hola"), "123")!
      expect(acceptTelegramUpdate(repo, message(1, "Hola"), "123")?.task_id).toBe(first.task_id)
      expect(repo.messages(repo.telegramConversation("123"))).toHaveLength(1)
      repo.complete(first.task_id!, "Respuesta del CEO")
      const send = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200 }))
      await processTelegramUpdate(repo, 1, "test-token", send)
      expect(repo.telegramUpdate(1)?.status).toBe("SENT")
      expect(JSON.parse(send.mock.calls[0][1]?.body as string).text).toBe("Respuesta del CEO")
      await processTelegramUpdate(repo, 1, "test-token", send)
      expect(send).toHaveBeenCalledTimes(1)
      acceptTelegramUpdate(repo, message(2, "Otra pregunta"), "123")
      expect(repo.listConversations()).toHaveLength(1)
      expect(repo.messages(repo.telegramConversation("123"))).toHaveLength(3)
    } finally { db.close() }
  })

  it("links the authorized chat to an existing web conversation", () => {
    const db = openCompanyDatabase(":memory:")
    try {
      const repo = new CompanyRepository(db)
      const webConversation = repo.createConversation()
      repo.linkTelegramConversation("123", webConversation)
      expect(repo.isTelegramConversation("123", webConversation)).toBe(true)
      expect(repo.telegramConversation("123")).toBe(webConversation)
      expect(repo.listConversations()).toHaveLength(1)
    } finally { db.close() }
  })

  it("sends a failed task's reason to the same Telegram chat", async () => {
    const db = openCompanyDatabase(":memory:")
    try {
      const repo = new CompanyRepository(db)
      const update = acceptTelegramUpdate(repo, { update_id: 7, message: { chat: { id: 123, type: "private" }, text: "Investiga este nicho" } }, "123")!
      repo.failTask(update.task_id!, "Researcher is not permitted to use Alura.")
      const send = vi.fn<typeof fetch>(async () => new Response('{"ok":true}', { status: 200 }))
      await processTelegramUpdate(repo, 7, "test-token", send)
      expect(repo.telegramUpdate(7)?.status).toBe("SENT")
      expect(JSON.parse(send.mock.calls[0][1]?.body as string)).toMatchObject({ chat_id: "123" })
      expect(JSON.parse(send.mock.calls[0][1]?.body as string).text).toContain("Alura")
    } finally { db.close() }
  })
})
