import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  PinterestTokenPayload,
  PINTEREST_AUTH_COOKIE,
} from "@/lib/pinterest/auth"
import { ensureFreshPinterestToken, pinterestFetch } from "@/lib/pinterest/client"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const raw = cookieStore.get(PINTEREST_AUTH_COOKIE)?.value

  if (!raw) {
    return new Response("Pinterest is not connected", { status: 401 })
  }

  try {
    const parsed = JSON.parse(raw) as PinterestTokenPayload
    const token = await ensureFreshPinterestToken(parsed)

    if (
      token.access_token !== parsed.access_token ||
      token.expires_at !== parsed.expires_at
    ) {
      cookieStore.set(PINTEREST_AUTH_COOKIE, JSON.stringify(token), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      })
    }

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
      results.push({
        id: pin.id,
        ok: true,
        pinId: data.id,
        boardId: data.board_id || boardId,
        url: data.url || null,
      })
    }

    return NextResponse.json({ results })
  } catch (error: any) {
    return new Response(error?.message || "Failed to publish Pinterest pins", {
      status: 500,
    })
  }
}
