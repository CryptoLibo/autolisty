import crypto from "node:crypto"

const base = process.env.COMPANY_PUBLIC_URL?.replace(/\/+$/, "")
const authSecret = process.env.AUTH_SECRET
if (!base || !authSecret) throw new Error("COMPANY_PUBLIC_URL and AUTH_SECRET are required.")
const workerToken = crypto.createHmac("sha256", authSecret).update("company-kittl-worker-v1").digest("hex")

async function poll() {
  const response = await fetch(`${base}/api/company/kittl/drain`, {
    method: "POST", headers: { authorization: `Bearer ${workerToken}` }, signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`Kittl worker request failed (${response.status}).`)
  const body = await response.json()
  for (const item of body.results || []) {
    if (item.error) process.stderr.write(`Kittl job ${item.id}: ${item.status}: ${item.error}\n`)
  }
}

while (true) {
  try { await poll() } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`) }
  await new Promise((resolve) => setTimeout(resolve, 20_000))
}
