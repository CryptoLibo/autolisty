import OpenAI from "openai"
import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { containsSensitiveCredential, failVoice, finishVoice, reserveVoice, speakableText, VOICE_SPEAK_RESERVE_USD, voiceEnabled } from "@/lib/company/voice"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  if (!voiceEnabled()) return NextResponse.json({ error: "Voz desactivada." }, { status: 503 })
  const body = await request.json().catch(() => null) as { conversationId?: string; messageId?: string } | null
  if (!body?.conversationId || !body.messageId) return NextResponse.json({ error: "Mensaje requerido." }, { status: 400 })
  const repository = new CompanyRepository()
  if (!repository.getConversation(body.conversationId)) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 })
  const message = repository.messages(body.conversationId).find((item) => item.id === body.messageId && item.role === "assistant")
  if (!message) return NextResponse.json({ error: "Respuesta no encontrada." }, { status: 404 })
  if (containsSensitiveCredential(message.content)) return NextResponse.json({ error: "Esta respuesta puede contener credenciales; se muestra solo en texto." }, { status: 422 })
  const input = speakableText(message.content)
  if (!input) return NextResponse.json({ error: "No hay texto para leer." }, { status: 400 })
  let usageId: string
  try { usageId = reserveVoice("speak", VOICE_SPEAK_RESERVE_USD) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Voz no disponible." }, { status: 429 }) }
  try {
    const response = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).audio.speech.create({ model: "gpt-4o-mini-tts", voice: "cedar", input, instructions: "Habla en español con tono natural y claro.", response_format: "mp3" })
    const bytes = await response.arrayBuffer()
    if (!bytes.byteLength || bytes.byteLength > 4_000_000) throw new Error("Invalid speech response")
    finishVoice(usageId, Math.min(VOICE_SPEAK_RESERVE_USD, input.length / 1200 * 0.025), undefined, input.length)
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } })
  } catch {
    failVoice(usageId)
    return NextResponse.json({ error: "No se pudo generar la voz; el cargo es incierto." }, { status: 502 })
  }
}
