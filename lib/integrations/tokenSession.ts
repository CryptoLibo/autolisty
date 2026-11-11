// Punto único para obtener el token de Etsy o Pinterest, con o sin navegador.
//
// La bóveda del servidor es la fuente de verdad. Etsy rota el refresh token en
// cada uso (el anterior deja de valer), así que dos copias que se refrescan por
// separado acabarían rompiéndose: por eso toda la app pasa por aquí.
// Los tokens ya NO se guardan en cookies del navegador: si queda una cookie antigua
// se importa una vez a la bóveda (si está vacía) y se borra.
import { cookies } from "next/headers"
import { ETSY_AUTH_COOKIE, ETSY_PKCE_COOKIE, type EtsyTokenPayload, refreshEtsyToken } from "../etsy/auth"
import {
  PINTEREST_AUTH_COOKIE,
  PINTEREST_PKCE_COOKIE,
  type PinterestTokenPayload,
  refreshPinterestToken,
} from "../pinterest/auth"
import { type CredentialProvider, deleteCredential, readCredential, writeCredential } from "./credentialVault"

type TokenByProvider = { etsy: EtsyTokenPayload; pinterest: PinterestTokenPayload }

const COOKIE: Record<CredentialProvider, { name: string; pkce: string }> = {
  etsy: { name: ETSY_AUTH_COOKIE, pkce: ETSY_PKCE_COOKIE },
  pinterest: { name: PINTEREST_AUTH_COOKIE, pkce: PINTEREST_PKCE_COOKIE },
}

// Margen para refrescar antes de que caduque.
const REFRESH_MARGIN_MS = 5 * 60_000

async function cookieJar() {
  try {
    return await cookies()
  } catch {
    return null // Fuera de una petición (worker del servidor).
  }
}

function isValidToken(provider: CredentialProvider, value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const token = value as Record<string, unknown>
  if (typeof token.access_token !== "string" || !token.access_token) return false
  if (provider === "etsy" && (typeof token.refresh_token !== "string" || !token.refresh_token)) return false
  return Array.isArray(token.scope)
}

/** Borra la cookie antigua del token (y la de PKCE al desconectar). */
async function dropCookie(provider: CredentialProvider, includePkce = false) {
  const jar = await cookieJar()
  if (!jar?.get(COOKIE[provider].name) && !includePkce) return
  try {
    jar?.delete(COOKIE[provider].name)
    if (includePkce) jar?.delete(COOKIE[provider].pkce)
  } catch {
    // En Server Components no se pueden borrar cookies; se hará en la próxima ruta.
  }
}

/** Token guardado (sin refrescar). Importa la cookie a la bóveda si hace falta. */
export async function loadToken<P extends CredentialProvider>(provider: P): Promise<TokenByProvider[P] | null> {
  const stored = readCredential<TokenByProvider[P]>(provider)
  if (stored && isValidToken(provider, stored)) return stored

  const jar = await cookieJar()
  const raw = jar?.get(COOKIE[provider].name)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as TokenByProvider[P]
    if (!isValidToken(provider, parsed)) return null
    writeCredential(provider, parsed)
    await dropCookie(provider)
    return parsed
  } catch {
    return null
  }
}

/** Guarda un token nuevo (conexión o refresco) en la bóveda. */
export async function saveToken<P extends CredentialProvider>(provider: P, token: TokenByProvider[P]) {
  writeCredential(provider, token)
  await dropCookie(provider)
}

/** Desconecta: borra bóveda y cookies. */
export async function clearToken(provider: CredentialProvider) {
  deleteCredential(provider)
  await dropCookie(provider, true)
}

const inflight = new Map<CredentialProvider, Promise<unknown>>()

async function refresh<P extends CredentialProvider>(provider: P, token: TokenByProvider[P]): Promise<TokenByProvider[P]> {
  if (provider === "etsy") {
    return (await refreshEtsyToken((token as EtsyTokenPayload).refresh_token)) as TokenByProvider[P]
  }
  const current = token as PinterestTokenPayload
  const next = await refreshPinterestToken(current.refresh_token!)
  // Pinterest puede no devolver un refresh token nuevo: se conserva el actual.
  return { ...next, refresh_token: next.refresh_token || current.refresh_token } as TokenByProvider[P]
}

/** Token listo para usar: refresca si caduca pronto y guarda el resultado. */
export async function getFreshToken<P extends CredentialProvider>(provider: P): Promise<TokenByProvider[P] | null> {
  const token = await loadToken(provider)
  if (!token) return null
  const canRefresh = provider === "etsy" || Boolean((token as PinterestTokenPayload).refresh_token)
  if (!canRefresh || token.expires_at - Date.now() > REFRESH_MARGIN_MS) return token

  // Un solo refresco a la vez: con Etsy, dos refrescos simultáneos invalidarían el token.
  let pending = inflight.get(provider) as Promise<TokenByProvider[P]> | undefined
  if (!pending) {
    pending = (async () => {
      const latest = (await loadToken(provider)) || token
      if (latest.expires_at - Date.now() > REFRESH_MARGIN_MS) return latest
      const next = await refresh(provider, latest)
      writeCredential(provider, next)
      return next
    })()
    inflight.set(provider, pending)
    pending.finally(() => inflight.delete(provider)).catch(() => {})
  }
  const next = await pending
  await dropCookie(provider)
  return next
}
