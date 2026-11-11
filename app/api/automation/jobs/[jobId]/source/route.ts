import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { getAutomationSource } from "@/lib/r2/automationSources"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Vista previa ligera para móvil: ?w=900 devuelve un WebP de ese ancho máximo.
// Sin ?w se sirve el archivo original (para el zoom a resolución completa).
const PREVIEW_WIDTHS = new Set([480, 900, 1400])

async function resizePreview(bytes: Uint8Array, width: number) {
  try {
    const sharp = (await import("sharp")).default
    return await sharp(bytes).resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
  } catch (error) {
    console.error("Preview resize unavailable; serving original:", error)
    return null
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  const { jobId } = await context.params
  const repository = new AutomationRepository()
  const files = repository.listJobFiles(jobId)
  const original = files.find((file) => file.slotKey === "source:primary")
  // Cuando Automaty termina, el original se borra: la miniatura pasa a ser el primer mockup.
  const source = original?.r2Key && original.status !== "DELETED"
    ? original
    : files.find((file) => file.slotKey === "listing:1" && file.r2Key && file.status !== "DELETED")

  if (!source?.r2Key) {
    return NextResponse.json({ error: "Source design is not available." }, { status: 404 })
  }

  try {
    const object = await getAutomationSource(source.r2Key)
    if (!object.Body) {
      return NextResponse.json({ error: "Source design is empty." }, { status: 404 })
    }

    const bytes = await object.Body.transformToByteArray()
    const requestedWidth = Number(new URL(request.url).searchParams.get("w") || 0)
    if (PREVIEW_WIDTHS.has(requestedWidth)) {
      const preview = await resizePreview(bytes, requestedWidth)
      if (preview) {
        return new Response(new Uint8Array(preview), {
          headers: {
            "Content-Type": "image/webp",
            "Content-Length": String(preview.byteLength),
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        })
      }
    }
    const responseBody = new Uint8Array(bytes.byteLength)
    responseBody.set(bytes)
    return new Response(responseBody.buffer, {
      headers: {
        "Content-Type": source.contentType || object.ContentType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Unable to read automation source:", error)
    return NextResponse.json({ error: "Unable to load the source design." }, { status: 502 })
  }
}
