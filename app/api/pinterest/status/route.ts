import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import {
  PinterestTokenPayload,
  PINTEREST_AUTH_COOKIE,
} from "@/lib/pinterest/auth"
import {
  ensureFreshPinterestToken,
  getPinterestBoards,
  getPinterestUser,
} from "@/lib/pinterest/client"

export const runtime = "nodejs"

export async function GET() {
  const cookieStore = await cookies()
  const raw = cookieStore.get(PINTEREST_AUTH_COOKIE)?.value

  if (!raw) {
    return NextResponse.json({ connected: false })
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

    const user = await getPinterestUser(token)
    const boardsResponse = await getPinterestBoards(token)

    return NextResponse.json({
      connected: true,
      scopes: token.scope,
      expiresAt: token.expires_at,
      user: {
        username: user.username,
        account_type: user.account_type,
      },
      boards: Array.isArray(boardsResponse.items)
        ? boardsResponse.items.map((board: any) => ({
            id: board.id,
            name: board.name,
            privacy: board.privacy,
          }))
        : [],
    })
  } catch (error: any) {
    cookieStore.delete(PINTEREST_AUTH_COOKIE)
    return NextResponse.json(
      { connected: false, error: error?.message || "Invalid Pinterest session" },
      { status: 401 }
    )
  }
}
