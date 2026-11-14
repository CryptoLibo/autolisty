// Limitador de intentos por IP en memoria (S4). Un solo proceso en el servidor: suficiente
// para frenar abusos en el inicio de sesión, el MCP y el formulario de contacto.
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
let lastSweep = 0

export function clientIp(request: Request) {
  const headers = request.headers
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

/** true si la petición entra en el límite; false si hay que rechazarla. */
export function allowRequest(key: string, max: number, windowMs: number, now = Date.now()) {
  if (now - lastSweep > 60_000) {
    for (const [name, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(name)
    lastSweep = now
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= max
}

export function rateLimited(request: Request, scope: string, max: number, windowMs: number) {
  if (allowRequest(`${scope}:${clientIp(request)}`, max, windowMs)) return null
  return Response.json({ error: "Demasiados intentos. Espera un momento y vuelve a probar." }, {
    status: 429,
    headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
  })
}

export function resetRateLimits() {
  buckets.clear()
}
