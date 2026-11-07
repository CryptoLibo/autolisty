import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { pinterestFetch } from "@/lib/pinterest/client"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"
import { getAutomationDatabase } from "@/lib/automation/db/database"
import { recordPublishedPin } from "@/lib/dashboard/pinterest-analytics"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  if (!(await loadToken("pinterest"))) {
    return new Response("Pinterest is not connected", { status: 401 })
  }

  try {
    const token = await getFreshToken("pinterest")
    if (!token) return new Response("Pinterest is not connected", { status: 401 })

    const body = await req.json()
    const { boardId, destinationLink, pins = [] } = body

    if (!boardId) {
      return new Response("Missing Pinterest board ID", { status: 400 })
    }

    if (!Array.isArray(pins) || pins.length === 0) {
      return new Response("No Pinterest pins to publish", { status: 400 })
    }

    const results = []

    for (const pin of pins) {
      const payload = {
        board_id: boardId,
        title: pin.title,
        description: pin.description,
        link: destinationLink || undefined,
        alt_text: pin.altText || undefined,
        media_source: {
          source_type: "image_url",
          url: pin.imageUrl,
        },
      }

      const response = await pinterestFetch("/pins", token, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const message = await response.text()
        results.push({
          id: pin.id,
          ok: false,
          error: message || `HTTP ${response.status}`,
        })
        continue
      }

      const data = await response.json()
      let trackingWarning: string | undefined
      try {
        recordPublishedPin(getAutomationDatabase(),{
          pinId:String(data.id),boardId:String(data.board_id || boardId),title:pin.title,
          destinationUrl:destinationLink,imageUrl:pin.imageUrl,
        })
      } catch {
        trackingWarning = "Pin publicado, pero no se pudo guardar su vínculo analítico. No lo publiques de nuevo."
      }
      results.push({
        id: pin.id,
        ok: true,
        pinId: data.id,
        boardId: data.board_id || boardId,
        url: data.url || null,
        trackingWarning,
      })
    }

    return NextResponse.json({ results })
  } catch {
    return new Response("Failed to publish Pinterest pins", {
      status: 500,
    })
  }
}
