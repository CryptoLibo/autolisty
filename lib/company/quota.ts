export const LOCAL_DAILY_TOKEN_LIMITS = {
  main: 250_000,
  economy: 2_500_000,
} as const

export function tokenGroup(model: string): keyof typeof LOCAL_DAILY_TOKEN_LIMITS | null {
  if (model === "gpt-5.4" || model.startsWith("gpt-5.4-2026-03-05")) return "main"
  if (model === "gpt-5.4-mini" || model.startsWith("gpt-5.4-mini-2026-03-17")) return "economy"
  return null
}

export function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10)
}
