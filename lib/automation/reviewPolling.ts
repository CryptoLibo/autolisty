// ¿Ya publicaste el draft en Etsy? (E6): cada 5 minutos en tus horas habituales de revisión
// y cada 30 el resto del día. REVIEW_HOURS="14-24" (hora de Lisboa) cambia la franja.
const FAST_MS = 5 * 60_000
const SLOW_MS = 30 * 60_000

export function parseReviewHours(value = process.env.REVIEW_HOURS || "14-24") {
  const match = value.match(/^(\d{1,2})-(\d{1,2})$/)
  const start = match ? Number(match[1]) : 14
  const end = match ? Number(match[2]) : 24
  return { start: Math.min(Math.max(start, 0), 24), end: Math.min(Math.max(end, 0), 24) }
}

export function lisbonHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: process.env.OWNER_TIMEZONE || "Europe/Lisbon" }).format(now))
}

export function reviewPollDelayMs(now: Date, hours = parseReviewHours()) {
  const hour = lisbonHour(now)
  const inWindow = hours.start <= hours.end
    ? hour >= hours.start && hour < hours.end
    : hour >= hours.start || hour < hours.end
  return inWindow ? FAST_MS : SLOW_MS
}
