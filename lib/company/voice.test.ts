import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { containsSensitiveCredential, failVoice, finishVoice, reserveVoice, speakableText, VOICE_DAILY_CAP_USD, voiceEnabled, voiceUsageToday } from "./voice"

describe("Company voice pilot limits", () => {
  const oldPath = process.env.COMPANY_DB_PATH
  const oldFlag = process.env.COMPANY_VOICE_ENABLED
  const oldKey = process.env.OPENAI_API_KEY
  const dirs: string[] = []

  afterEach(() => {
    if (oldPath === undefined) delete process.env.COMPANY_DB_PATH; else process.env.COMPANY_DB_PATH = oldPath
    if (oldFlag === undefined) delete process.env.COMPANY_VOICE_ENABLED; else process.env.COMPANY_VOICE_ENABLED = oldFlag
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey
    const state = globalThis as typeof globalThis & { __companyDb?: { close(): void }; __companyDbPath?: string }
    state.__companyDb?.close()
    delete state.__companyDb
    delete state.__companyDbPath
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("requires the feature flag and a server-side key", () => {
    process.env.COMPANY_VOICE_ENABLED = "0"
    process.env.OPENAI_API_KEY = "test"
    expect(voiceEnabled()).toBe(false)
    process.env.COMPANY_VOICE_ENABLED = "1"
    delete process.env.OPENAI_API_KEY
    expect(voiceEnabled()).toBe(false)
  })

  it("reserves a capped daily budget and retains uncertain charges", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "company-voice-"))
    dirs.push(dir)
    process.env.COMPANY_DB_PATH = path.join(dir, "company.sqlite")
    process.env.COMPANY_VOICE_ENABLED = "1"
    process.env.OPENAI_API_KEY = "test"
    const first = reserveVoice("transcribe", 0.003)
    finishVoice(first, 0.001, 10)
    const second = reserveVoice("speak", 0.04)
    failVoice(second)
    expect(voiceUsageToday()).toMatchObject({ calls: 2, estimatedUsd: 0.001, capUsd: 0.5 })
    expect(voiceUsageToday().reservedUsd).toBeCloseTo(0.043)
    expect(() => reserveVoice("speak", VOICE_DAILY_CAP_USD)).toThrow("límite diario")
  })

  it("limits spoken text and omits raw URLs", () => {
    expect(speakableText("**Mira** https://example.com/test")).toBe("Mira enlace disponible en pantalla")
    expect(speakableText("a".repeat(2000))).toHaveLength(1200)
  })

  it("keeps obvious credentials out of speech synthesis", () => {
    expect(containsSensitiveCredential("api_key: secret-value")).toBe(true)
    expect(containsSensitiveCredential("No hay trabajos pendientes.")).toBe(false)
  })
})
