import crypto from "node:crypto"

const base = process.env.COMPANY_PUBLIC_URL?.replace(/\/+$/, "")
const authSecret = process.env.AUTH_SECRET
if (!base || !authSecret) throw new Error("COMPANY_PUBLIC_URL and AUTH_SECRET are required.")
const workerToken = crypto.createHmac("sha256", authSecret).update("company-kittl-worker-v1").digest("hex")

async function drain(path) {
  const response = await fetch(`${base}${path}`, {
    method: "POST", headers: { authorization: `Bearer ${workerToken}` }, signal: AbortSignal.timeout(240_000),
  })
  if (!response.ok) throw new Error(`Company worker ${path} failed (${response.status}).`)
  const body = await response.json()
  for (const item of body.results || []) {
    if (item.error) process.stderr.write(`Kittl job ${item.id}: ${item.status}: ${item.error}\n`)
  }
  return Number(body.processed || 0)
}

while (true) {
  let processed = 0
  for (const path of ["/api/company/telegram/drain", "/api/company/kittl/drain"]) {
    try { processed += await drain(path) } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`) }
  }
  await new Promise((resolve) => setTimeout(resolve, processed ? 2_000 : 10_000))
}
