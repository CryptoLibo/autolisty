const action = process.argv[2]
const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing.")

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Telegram ${method} failed (${response.status}).`)
  const result = await response.json()
  if (!result.ok) throw new Error(`Telegram ${method} was rejected.`)
  return result.result
}

if (action === "chat-id") {
  const updates = await call("getUpdates", { limit: 100, timeout: 0, allowed_updates: ["message"] })
  const chats = [...new Set(updates.filter((update) => update.message?.chat?.type === "private")
    .map((update) => String(update.message.chat.id)))]
  if (chats.length !== 1) throw new Error("Expected exactly one private chat. Send /start to the bot and retry.")
  console.log(`Private chat ID: ${chats[0]}`)
} else if (action === "webhook") {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID
  const baseUrl = process.env.COMPANY_PUBLIC_URL
  if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret) || !/^-?\d+$/.test(chatId || "") || !baseUrl?.startsWith("https://")) {
    throw new Error("Set TELEGRAM_WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_ID and HTTPS COMPANY_PUBLIC_URL.")
  }
  const url = new URL("/api/company/telegram/webhook", baseUrl)
  const result = await call("setWebhook", { url: url.toString(), secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false })
  console.log(result ? "Telegram webhook registered." : "Telegram webhook was not registered.")
} else {
  throw new Error("Use chat-id or webhook.")
}
