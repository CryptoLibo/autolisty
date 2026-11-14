import { AsyncLocalStorage } from "node:async_hooks"

// Consumo de OpenAI por listing (E3, V4): cada llamada suma sus tokens al trabajo en curso.
export type OpenAiUsage = { calls: number; inputTokens: number; outputTokens: number; costUsd: number }

// Precio por millón de tokens de gpt-5.4-mini; se puede ajustar sin tocar el código.
const PRICE_INPUT_PER_M = Number(process.env.OPENAI_PRICE_INPUT_PER_M || 0.75)
const PRICE_OUTPUT_PER_M = Number(process.env.OPENAI_PRICE_OUTPUT_PER_M || 4.5)

const storage = new AsyncLocalStorage<OpenAiUsage>()

export function emptyUsage(): OpenAiUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
}

export function costOf(inputTokens: number, outputTokens: number) {
  return (inputTokens * PRICE_INPUT_PER_M + outputTokens * PRICE_OUTPUT_PER_M) / 1_000_000
}

export function recordOpenAiUsage(usage: { input_tokens?: number; output_tokens?: number } | null | undefined) {
  const sink = storage.getStore()
  if (!sink) return
  const input = Number(usage?.input_tokens || 0)
  const output = Number(usage?.output_tokens || 0)
  sink.calls += 1
  sink.inputTokens += input
  sink.outputTokens += output
  sink.costUsd = costOf(sink.inputTokens, sink.outputTokens)
}

/** Ejecuta `fn` y devuelve su resultado con lo que gastó en OpenAI. */
export async function withOpenAiUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: OpenAiUsage }> {
  const usage = emptyUsage()
  const result = await storage.run(usage, fn)
  return { result, usage }
}
