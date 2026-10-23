import OpenAI from "openai"
import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { failVoice, finishVoice, reserveVoice, VOICE_TRANSCRIBE_RESERVE_USD, VOICE_TURN_MAX_MS, voiceEnabled } from "@/lib/company/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  if (!voiceEnabled()) return NextResponse.json({ error: "Voz desactivada." }, { status: 503 })
  const form = await request.formData().catch(() => null)
  const file = form?.get("audio")
  const durationMs = Number(form?.get("durationMs"))
  if (!(file instanceof File) || !["audio/webm", "audio/mp4"].includes(file.type) || file.size < 100 || file.size > 2_000_000 || !Number.isFinite(durationMs) || durationMs < 300 || durationMs > VOICE_TURN_MAX_MS + 1000) {
    return NextResponse.json({ error: "Audio inválido o demasiado largo." }, { status: 400 })
  }
  let usageId: string
  try { usageId = reserveVoice("transcribe", VOICE_TRANSCRIBE_RESERVE_USD) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Voz no disponible." }, { status: 429 }) }
  try {
    const result = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).audio.transcriptions.create({ model: "gpt-transcribe", file, language: "es" })
    const text = result.text?.trim().slice(0, 12000) || ""
    finishVoice(usageId, durationMs / 60_000 * 0.0045, durationMs / 1000)
    return NextResponse.json({ text })
  } catch {
    failVoice(usageId)
    return NextResponse.json({ error: "No se pudo transcribir el audio; el cargo es incierto." }, { status: 502 })
  }
}
