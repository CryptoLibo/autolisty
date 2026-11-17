import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { refreshSourceSlots } from "@/lib/automation/mediaRefresh"
import { readR2Object } from "@/lib/r2/readObject"
import type { ProductType } from "@/lib/products"
import { loadAssignedRefresh } from "../shared"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Fuente para volver a producir: la original de Kittl o, si no se guardó, el entregable más grande.
export async function GET(request: Request, context: { params: Promise<{ refreshId: string }> }) {
  const { refreshId } = await context.params
  const loaded = await loadAssignedRefresh(request, refreshId)
  if ("error" in loaded) return loaded.error
  const jobFiles = loaded.repository.listJobFiles(loaded.job.id)
  const file = refreshSourceSlots(loaded.job.productType as ProductType)
    .map((slot) => jobFiles.find((candidate) => candidate.slotKey === slot && candidate.r2Key && candidate.status !== "DELETED"))
    .find(Boolean)
  if (!file?.r2Key || file.status === "DELETED") {
    return NextResponse.json({ error: "The final design file is not available in R2." }, { status: 404 })
  }
  try {
    const object = await readR2Object(file.r2Key)
    const sha256 = crypto.createHash("sha256").update(object.fileBuffer).digest("hex")
    const filename = file.relativePath.split("/").pop() || "Design"
    return new Response(new Uint8Array(object.fileBuffer), {
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.fileBuffer.length),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Source-SHA256": sha256,
        "X-Source-Filename": filename,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("Unable to stream refresh source:", error)
    return NextResponse.json({ error: "Unable to download the final design." }, { status: 502 })
  }
}
