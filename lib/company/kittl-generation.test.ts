import { afterEach, describe, expect, it, vi } from "vitest"
import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { acceptTelegramUpdate, processKittlCallback } from "./telegram"
import { drainKittlGenerations, refreshKittlGeneration } from "./kittl-generation"

describe("Kittl review in the existing Telegram chat", () => {
  const previousChat = process.env.TELEGRAM_ALLOWED_CHAT_ID
  afterEach(() => { process.env.TELEGRAM_ALLOWED_CHAT_ID = previousChat })

  function setup() {
    const db = openCompanyDatabase(":memory:")
    const state = globalThis as typeof globalThis & { __companyDb?: typeof db; __companyDbPath?: string }
    const oldDb = state.__companyDb
    const oldPath = state.__companyDbPath
    state.__companyDb = db
    state.__companyDbPath = process.env.COMPANY_DB_PATH || `${process.cwd()}\\data\\autolisty-company.sqlite`
    process.env.TELEGRAM_ALLOWED_CHAT_ID = "123"
    const repo = new CompanyRepository(db)
    const conversation = repo.createConversation()
    repo.linkTelegramConversation("123", conversation)
    const taskId = repo.addUserMessage(conversation, "Diseña una colección")
    repo.complete(taskId, "Diseño listo")
    db.prepare("INSERT INTO company_artifacts(id,task_id,kind,content,data_json,created_at) VALUES(?,?,?,?,?,?)")
      .run("artifact", taskId, "design_concepts", "Conceptos", JSON.stringify({ concepts: [{ name: "Flor", prompt: "A floral print" }] }), new Date().toISOString())
    const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
    db.prepare("INSERT INTO company_kittl_generations(id,task_id,concept_index,prompt,model_id,workspace_id,job_id,status,image_url,telegram_message_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, taskId, 0, "A floral print", "model", "team", "job", "SENT", "https://cache.kittl.com/test.png", 44, new Date().toISOString(), new Date().toISOString())
    return { db, repo, id, taskId, conversation, close: () => { state.__companyDb = oldDb; state.__companyDbPath = oldPath; db.close() } }
  }

  it("approves once, persists the review and rejects other chats", async () => {
    const fixture = setup()
    try {
      const send = vi.fn<typeof fetch>(async () => new Response('{"ok":true}'))
      const update = { update_id: 1, callback_query: { id: "callback", data: `kg:a:${fixture.id}`, message: { chat: { id: 123, type: "private" } } } }
      expect(await processKittlCallback(update, "123", "test", send)).toBe(true)
      expect(fixture.repo.designReviews(fixture.taskId)).toMatchObject([{ verdict: "approved", kittl_url: "https://cache.kittl.com/test.png" }])
      expect(fixture.db.prepare("SELECT review_status FROM company_kittl_generations WHERE id=?").get(fixture.id)).toMatchObject({ review_status: "APPROVED" })
      expect(await processKittlCallback(update, "123", "test", send)).toBe(true)
      expect(await processKittlCallback({ ...update, callback_query: { ...update.callback_query, message: { chat: { id: 999, type: "private" } } } }, "123", "test", send)).toBe(false)
      expect(fixture.repo.listConversations()).toHaveLength(1)
    } finally { fixture.close() }
  })

  it("saves requested changes without creating a CEO task", async () => {
    const fixture = setup()
    try {
      const send = vi.fn<typeof fetch>(async () => new Response('{"ok":true}'))
      await processKittlCallback({ update_id: 2, callback_query: { id: "callback", data: `kg:r:${fixture.id}`, message: { chat: { id: 123, type: "private" } } } }, "123", "test", send)
      const before = fixture.repo.messages(fixture.conversation).length
      expect(acceptTelegramUpdate(fixture.repo, { update_id: 3, message: { chat: { id: 123, type: "private" }, text: "Más contraste y sin borde" } }, "123")).toBeNull()
      expect(fixture.repo.messages(fixture.conversation)).toHaveLength(before)
      expect(fixture.db.prepare("SELECT review_status,feedback FROM company_kittl_generations WHERE id=?").get(fixture.id)).toMatchObject({ review_status: "REVISION_REQUESTED", feedback: "Más contraste y sin borde" })
    } finally { fixture.close() }
  })

  it("uploads the PNG once with inline review buttons", async () => {
    const fixture = setup()
    try {
      fixture.db.prepare("UPDATE company_kittl_generations SET status='READY',telegram_message_id=NULL WHERE id=?").run(fixture.id)
      const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
      const send = vi.fn<typeof fetch>(async (input) => String(input).includes("sendPhoto")
        ? new Response('{"ok":true,"result":{"message_id":44}}', { status: 200 })
        : new Response(png, { status: 200, headers: { "content-type": "image/png" } }))
      expect((await refreshKittlGeneration(fixture.id, "token", "123", send))?.status).toBe("SENT")
      expect(send).toHaveBeenCalledTimes(2)
      const form = send.mock.calls[1][1]?.body as FormData
      expect(form.get("chat_id")).toBe("123")
      expect(JSON.parse(String(form.get("reply_markup"))).inline_keyboard[0][0].text).toBe("Aprobar")
      await refreshKittlGeneration(fixture.id, "token", "123", send)
      expect(send).toHaveBeenCalledTimes(2)
    } finally { fixture.close() }
  })

  it("keeps a ready image retryable if download fails before Telegram is called", async () => {
    const fixture = setup()
    try {
      fixture.db.prepare("UPDATE company_kittl_generations SET status='READY',telegram_message_id=NULL WHERE id=?").run(fixture.id)
      const send = vi.fn<typeof fetch>(async () => new Response("Not found", { status: 404 }))
      await expect(refreshKittlGeneration(fixture.id, "token", "123", send)).rejects.toThrow()
      expect(fixture.db.prepare("SELECT status FROM company_kittl_generations WHERE id=?").get(fixture.id)).toMatchObject({ status: "READY" })
      expect(send).toHaveBeenCalledTimes(1)
    } finally { fixture.close() }
  })

  it("does not revisit images already sent by the background drain", async () => {
    const fixture = setup()
    try { expect(await drainKittlGenerations()).toEqual([]) }
    finally { fixture.close() }
  })
})
