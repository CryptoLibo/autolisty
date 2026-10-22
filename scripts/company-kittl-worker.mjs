const base = process.env.COMPANY_PUBLIC_URL?.replace(/\/+$/, "")
const secret = process.env.COMPANY_WORKER_SECRET
if (!base || !secret || secret.length < 32) throw new Error("COMPANY_PUBLIC_URL and a 32+ character COMPANY_WORKER_SECRET are required.")

async function poll() {
  const response = await fetch(`${base}/api/company/kittl/drain`, {
    method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(90_000),
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
