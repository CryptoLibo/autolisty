import { describe, expect, it } from "vitest"
import { downloadSignature, signedDownloadUrl } from "./downloadSignature"
import { privateKeyFromPublicUrl } from "./privateKey"

const SECRET = "test-secret-with-at-least-32-characters!!"

describe("downloadSignature", () => {
  it("es determinista, de 22 caracteres y distinta por código", () => {
    const a = downloadSignature("LBCreaStudio-Q7ZZ9C", SECRET)
    expect(a).toHaveLength(22)
    expect(downloadSignature("LBCreaStudio-Q7ZZ9C", SECRET)).toBe(a)
    expect(downloadSignature("LBCreaStudio-DIWZRP", SECRET)).not.toBe(a)
  })

  it("coincide con la fórmula del Worker (HMAC-SHA256 base64url)", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const raw = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("LBCreaStudio-Q7ZZ9C")))
    const workerStyle = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "").slice(0, 22)
    expect(downloadSignature("LBCreaStudio-Q7ZZ9C", SECRET)).toBe(workerStyle)
  })

  it("añade ?k= al enlace", () => {
    const url = signedDownloadUrl("https://download.autolisty.com/printable/2-3/LBCreaStudio-Q7ZZ9C", "LBCreaStudio-Q7ZZ9C", SECRET)
    expect(url).toMatch(/^https:\/\/download\.autolisty\.com\/printable\/2-3\/LBCreaStudio-Q7ZZ9C\?k=[A-Za-z0-9_-]{22}$/)
  })
})

describe("privateKeyFromPublicUrl", () => {
  it("solo devuelve clave para prefijos privados", () => {
    expect(privateKeyFromPublicUrl("https://cdn.x.com/delivery-pdf/LBCreaStudio-A.pdf", "https://cdn.x.com")).toBe("delivery-pdf/LBCreaStudio-A.pdf")
    expect(privateKeyFromPublicUrl("https://cdn.x.com/mockups/LBCreaStudio-A/mockup-1.jpg", "https://cdn.x.com")).toBeNull()
    expect(privateKeyFromPublicUrl("https://other.com/delivery-pdf/a.pdf", "https://cdn.x.com")).toBeNull()
    // URL guardada con el dominio antiguo (r2.dev) tras pasar a dominio propio.
    expect(privateKeyFromPublicUrl("https://pub-1.r2.dev/delivery-pdf/LBCreaStudio-A.pdf", "https://files.x.com", "https://pub-1.r2.dev"))
      .toBe("delivery-pdf/LBCreaStudio-A.pdf")
  })
})
