import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { getFreshToken, loadToken } from "@/lib/integrations/tokenSession"
import {
  getPinterestBoards,
  getPinterestUser,
} from "@/lib/pinterest/client"

export const runtime = "nodejs"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized

  if (!(await loadToken("pinterest"))) {
    return NextResponse.json({ connected: false })
  }

  try {
    const token = await getFreshToken("pinterest")
    if (!token) return NextResponse.json({ connected: false })

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
        ? boardsResponse.items.map((board: { id: string; name: string; privacy?: string }) => ({
            id: board.id,
            name: board.name,
            privacy: board.privacy,
          }))
        : [],
    })
  } catch {
    return NextResponse.json(
      { connected: true, error: "No se pudo consultar Pinterest; la conexión se conserva. Reautoriza si el token caducó." },
      { status: 503 }
    )
  }
}
