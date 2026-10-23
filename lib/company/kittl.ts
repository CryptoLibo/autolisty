import crypto from "node:crypto"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js"
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js"
import { getCompanyDatabase } from "./db"

const SERVER = new URL("https://mcp.kittl.com/mcp")
const ID = "kittl"
type KittlState = {
  clientInformation?: OAuthClientInformationMixed
  tokens?: OAuthTokens
  codeVerifier?: string
  pendingState?: string
  pendingAt?: number
}

function key() {
  if (process.env.COMPANY_KITTL_KEY) {
    const secret = Buffer.from(process.env.COMPANY_KITTL_KEY, "base64")
    if (secret.length !== 32) throw new Error("COMPANY_KITTL_KEY must be a base64-encoded 32-byte key.")
    return secret
  }
  const authSecret = process.env.AUTH_SECRET
  if (!authSecret) throw new Error("AUTH_SECRET is required to encrypt the Kittl session.")
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(authSecret), Buffer.from("autolisty-company"), Buffer.from("kittl-oauth-v1"), 32))
}

function encrypt(value: KittlState) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv)
  cipher.setAAD(Buffer.from(ID))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".")
}

function decrypt(value: string): KittlState {
  const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"))
  if (!iv || !tag || !body) throw new Error("Invalid Kittl credential record.")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv)
  decipher.setAAD(Buffer.from(ID))
  decipher.setAuthTag(tag)
  return JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8")) as KittlState
}

function readState() {
  const row = getCompanyDatabase().prepare("SELECT encrypted_state FROM company_integrations WHERE id=?").get(ID) as { encrypted_state: string } | undefined
  return row ? decrypt(row.encrypted_state) : {} as KittlState
}

function writeState(value: KittlState) {
  getCompanyDatabase().prepare(`INSERT INTO company_integrations(id,encrypted_state,updated_at) VALUES(?,?,?)
    ON CONFLICT(id) DO UPDATE SET encrypted_state=excluded.encrypted_state,updated_at=excluded.updated_at`)
    .run(ID, encrypt(value), new Date().toISOString())
}

function callbackUrl() {
  const publicUrl = process.env.COMPANY_PUBLIC_URL?.replace(/\/+$/, "") || ""
  const base = new URL(publicUrl)
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") throw new Error("COMPANY_PUBLIC_URL must use HTTPS in production.")
  return `${base.origin}/api/company/kittl/callback`
}

class KittlAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | null = null
  constructor(private stateData: KittlState) {}
  get redirectUrl() { return callbackUrl() }
  get clientMetadata(): OAuthClientMetadata {
    return { redirect_uris: [this.redirectUrl], client_name: "Autolisty Company", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" }
  }
  state() { return this.stateData.pendingState || "" }
  clientInformation() { return this.stateData.clientInformation }
  saveClientInformation(value: OAuthClientInformationMixed) { this.stateData.clientInformation = value; writeState(this.stateData) }
  tokens() { return this.stateData.tokens }
  saveTokens(value: OAuthTokens) { this.stateData.tokens = value; writeState(this.stateData) }
  redirectToAuthorization(url: URL) { this.authorizationUrl = url }
  saveCodeVerifier(value: string) { this.stateData.codeVerifier = value; writeState(this.stateData) }
  codeVerifier() {
    if (!this.stateData.codeVerifier) throw new Error("Kittl authorization must be restarted.")
    return this.stateData.codeVerifier
  }
}

function clientWithProvider(state: KittlState) {
  const provider = new KittlAuthProvider(state)
  const client = new Client({ name: "autolisty-company", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(SERVER, { authProvider: provider })
  return { provider, client, transport }
}

export function kittlConnectionStatus() {
  if ((!process.env.COMPANY_KITTL_KEY && !process.env.AUTH_SECRET) || !process.env.COMPANY_PUBLIC_URL) return { configured: false, connected: false }
  return { configured: true, connected: !!readState().tokens }
}

export async function beginKittlAuthorization() {
  const state = readState()
  state.pendingState = crypto.randomBytes(24).toString("base64url")
  state.pendingAt = Date.now()
  state.codeVerifier = undefined
  writeState(state)
  const { provider, client, transport } = clientWithProvider(state)
  try {
    await client.connect(transport)
    return { connected: true, url: null }
  } catch (error) {
    if (!(error instanceof UnauthorizedError) || !provider.authorizationUrl) throw error
    return { connected: false, url: provider.authorizationUrl.toString() }
  } finally {
    await client.close().catch(() => {})
  }
}

export async function finishKittlAuthorization(code: string, stateParam: string) {
  const state = readState()
  if (!state.pendingState || !state.pendingAt || Date.now() - state.pendingAt > 10 * 60_000 ||
    state.pendingState.length !== stateParam.length ||
    !crypto.timingSafeEqual(Buffer.from(state.pendingState), Buffer.from(stateParam))) {
    throw new Error("Kittl authorization state is invalid or expired.")
  }
  const { client, transport } = clientWithProvider(state)
  try {
    await transport.finishAuth(code)
    await client.connect(new StreamableHTTPClientTransport(SERVER, { authProvider: new KittlAuthProvider(readState()) }))
    const tools = await client.listTools()
    const saved = readState()
    saved.pendingAt = undefined
    saved.pendingState = undefined
    saved.codeVerifier = undefined
    writeState(saved)
    return tools.tools.map((tool) => tool.name)
  } finally {
    await client.close().catch(() => {})
  }
}

export async function listKittlTools() {
  const state = readState()
  if (!state.tokens) throw new Error("Kittl is not connected.")
  const { client, transport } = clientWithProvider(state)
  try {
    await client.connect(transport)
    return (await client.listTools()).tools.map((tool) => ({ name: tool.name, description: tool.description || "", inputSchema: tool.inputSchema }))
  } finally {
    await client.close().catch(() => {})
  }
}

export async function callKittlTool(name: string, args: Record<string, unknown>) {
  if (!["kittl-list-teams", "kittl-get-token-balance", "kittl-list-media-generation-models", "kittl-generate-media", "kittl-get-media-generation-status"].includes(name)) throw new Error("Kittl tool is not permitted.")
  const state = readState()
  if (!state.tokens) throw new Error("Conecta primero la cuenta de Kittl.")
  const { client, transport } = clientWithProvider(state)
  try {
    await client.connect(transport)
    const result = await client.callTool({ name, arguments: args })
    if (result.isError) throw new Error(`Kittl rejected ${name}.`)
    const blocks = result.content as Array<{ type: string; text?: string }>
    if (result.structuredContent && Object.keys(result.structuredContent).length) {
      return { ...result.structuredContent, content: blocks }
    }
    const text = blocks.filter((block) => block.type === "text").map((block) => block.text || "").join("\n")
    try { return JSON.parse(text) as unknown } catch { return { message: text } }
  } finally {
    await client.close().catch(() => {})
  }
}
