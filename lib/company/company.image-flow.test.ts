import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  response: vi.fn(),
  kittl: vi.fn(),
}))

vi.mock("openai", () => ({ default: class { responses = { create: mocks.response } } }))
vi.mock("./kittl", () => ({ callKittlTool: mocks.kittl }))

import { openCompanyDatabase } from "./db"
import { CompanyRepository } from "./repository"
import { runCompanyStage } from "./runner"
import { generation, refreshKittlGeneration } from "./kittl-generation"
import { processKittlCallback } from "./telegram"

describe("Company image request through owner approval", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it("delegates research, design and one real-model Kittl job, then approves its Telegram photo", async () => {
    const previous = Object.fromEntries(["OPENAI_API_KEY", "ALURA_API_KEY", "COMPANY_RESEARCH_PROVIDER", "COMPANY_ALURA_RESEARCH_ENABLED", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_CHAT_ID"].map((key) => [key, process.env[key]]))
    Object.assign(process.env, { OPENAI_API_KEY: "test", ALURA_API_KEY: "test", COMPANY_RESEARCH_PROVIDER: "alura", COMPANY_ALURA_RESEARCH_ENABLED: "1", TELEGRAM_BOT_TOKEN: "test", TELEGRAM_ALLOWED_CHAT_ID: "123" })
    const db = openCompanyDatabase(":memory:")
    const state = globalThis as typeof globalThis & { __companyDb?: typeof db; __companyDbPath?: string }
    const oldDb = state.__companyDb
    const oldPath = state.__companyDbPath
    state.__companyDb = db
    state.__companyDbPath = process.env.COMPANY_DB_PATH || `${process.cwd()}\\data\\autolisty-company.sqlite`
    const assets = fs.mkdtempSync(path.join(os.tmpdir(), "company-image-flow-"))
    try {
      const repo = new CompanyRepository(db)
      const conversation = repo.createConversation()
      repo.linkTelegramConversation("123", conversation)
      const taskId = repo.addUserMessage(conversation, "Investiga wall art floral para maestras y crea una imagen en Kittl para que yo la apruebe por Telegram")
      db.prepare("INSERT INTO company_worker_heartbeat(id,seen_at) VALUES('main',?)").run(new Date().toISOString())

      const concept = { name: "Flores de lectura", visual_idea: "Flores y libros", prompt: "Create a finished portrait printable wall art illustration showing an open book surrounded by colorful spring flowers, balanced botanical details, crisp edges and warm daylight. Set the exact phrase \"READ AND GROW\" in bold serif lettering at the top as the large headline, with the book beneath it.", rationale: "Apto para aula", text_mode: "included", exact_text: "READ AND GROW", typography: "bold serif", hierarchy: "large headline at the top" }
      const incomplete = { ...concept, prompt: concept.prompt.replace(" at the top as the large headline", " as prominent lettering") }
      const outputs = [
        JSON.stringify({ action: "delegate_research_design_image", answer: "", research_question: "teacher floral wall art", design_brief: "Lámina digital vertical floral para maestras", specialist_agent_id: "", specialist_question: "" }),
        "Alura muestra ejemplos relacionados; las ventas son estimaciones, no hechos verificados.",
        JSON.stringify({ product: "Wall art digital", audience: "Maestras", use: "Aula", deliverables: ["PNG vertical"], constraints: ["Floral"], assumptions: [] }),
        JSON.stringify({ concepts: [incomplete] }),
        JSON.stringify({ concepts: [concept] }),
      ]
      mocks.response.mockImplementation(async () => ({ status: "completed", output_text: outputs.shift(), output: [], usage: { input_tokens: 100, output_tokens: 100, input_tokens_details: { cached_tokens: 0 } }, id: crypto.randomUUID() }))
      mocks.kittl.mockImplementation(async (name: string) => {
        if (name === "kittl-list-teams") return { teams: [{ id: "team" }] }
        if (name === "kittl-list-media-generation-models") return { message: `## Available AI Models
### Image Models
1. **GPT Image 2.5 Flare** [RECOMMENDED] (gpt-image-2-5-flare)
   Model ID: \`cmtx60zxn1l4h0j9fu5i05jyg\`
   baseTokenCostEstimate: 5 tokens per generation | Speed: ~25s
   Parameters: aspectRatio: 21:9 | 16:9 | 1:1 | 3:4 | 9:16, background: opaque | transparent
### Video Models` }
        if (name === "kittl-get-token-balance") return { balance: 100 }
        if (name === "kittl-generate-media") return { jobId: "job-1", creditCost: 5 }
        if (name === "kittl-get-media-generation-status") return { status: "COMPLETE", terminal: true, url: "https://cache.kittl.com/test.png" }
        throw new Error(`Unexpected tool ${name}`)
      })
      vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).endsWith("/usage")
        ? new Response(JSON.stringify({ credits: { remaining: 100 } }), { headers: { "Alura-Credits-Cost": "0" } })
        : new Response(JSON.stringify({ data: [{ id: "123", title: "Floral classroom print", sales: { est_monthly_avg: 4 }, as_of: "2026-10-01" }] }), { headers: { "Alura-Credits-Cost": "10", "Alura-Credits-Remaining": "90" } })))

      for (let step = 0; step < 5; step++) await runCompanyStage(repo, taskId)
      expect(repo.task(taskId)).toMatchObject({ status: "COMPLETED", image_requested: 1 })
      expect((repo.calls(taskId) as Array<{ agent_id: string }>).map((call) => call.agent_id)).toEqual(["ceo", "market_researcher", "product_planner", "visual_designer", "visual_designer"])
      expect(repo.events(taskId).some((event) => event.event_type === "design_quality_revision")).toBe(true)
      expect(repo.externalCredits("alura").used).toBe(10)
      const row = db.prepare("SELECT id,aspect_ratio FROM company_kittl_generations WHERE task_id=?").get(taskId) as { id: string; aspect_ratio: string }
      expect(row.aspect_ratio).toBe("3:4")
      expect(mocks.kittl.mock.calls.filter(([name]) => name === "kittl-generate-media")).toHaveLength(1)
      expect(mocks.kittl.mock.calls.find(([name]) => name === "kittl-generate-media")?.[1]).toMatchObject({ modelId: "cmtx60zxn1l4h0j9fu5i05jyg", aspectRatio: "3:4" })
      const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
      const send = vi.fn<typeof fetch>(async (url) => String(url).includes("sendPhoto")
        ? new Response('{"ok":true,"result":{"message_id":44}}')
        : String(url).includes("answerCallbackQuery") || String(url).includes("sendMessage")
          ? new Response('{"ok":true}')
          : new Response(png, { headers: { "content-type": "image/png" } }))
      expect((await refreshKittlGeneration(row.id, "test", "123", send, assets))?.status).toBe("SENT")
      expect(generation(row.id)?.image_path).toBeTruthy()
      expect(await processKittlCallback({ update_id: 10, callback_query: { id: "cb", data: `kg:a:${row.id}`, message: { chat: { id: 123, type: "private" } } } }, "123", "test", send)).toBe(true)
      expect(repo.designReviews(taskId)).toMatchObject([{ verdict: "approved" }])
      expect(repo.listConversations()).toHaveLength(1)
    } finally {
      db.close()
      state.__companyDb = oldDb
      state.__companyDbPath = oldPath
      fs.rmSync(assets, { recursive: true, force: true })
      for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  })
})
