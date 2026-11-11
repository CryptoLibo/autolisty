// Publicación de pines y búsqueda de tableros, sin depender de una petición del navegador.
import type { PinterestTokenPayload } from "./auth"
import { currentPublicUrl } from "../r2/privateKey"
import { pinterestFetch } from "./client"

export function normalizeBoardName(value: string) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/** Todos los tableros de la cuenta (paginado). */
export async function listAllPinterestBoards(token: PinterestTokenPayload) {
  const boards: Array<{ id: string; name: string }> = []
  let bookmark: string | null = null
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ page_size: "100" })
    if (bookmark) query.set("bookmark", bookmark)
    const response = await pinterestFetch(`/boards?${query}`, token)
    if (!response.ok) {
      throw new Error(`Pinterest boards request failed (HTTP ${response.status}): ${(await response.text()).slice(0, 200)}`)
    }
    const data = await response.json() as { items?: Array<{ id: string; name: string }>; bookmark?: string | null }
    boards.push(...(data.items || []).map((board) => ({ id: String(board.id), name: String(board.name || "") })))
    bookmark = data.bookmark || null
    if (!bookmark) break
  }
  return boards
}

/** El tablero cuyo nombre coincide con el del producto (sin distinguir mayúsculas ni signos). */
export async function findBoardByName(token: PinterestTokenPayload, name: string) {
  const wanted = normalizeBoardName(name)
  const boards = await listAllPinterestBoards(token)
  return boards.find((board) => normalizeBoardName(board.name) === wanted) || null
}

export async function publishPinterestPin(
  token: PinterestTokenPayload,
  input: { boardId: string; title: string; description: string; link: string; imageUrl: string; altText?: string }
) {
  const response = await pinterestFetch("/pins", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: input.boardId,
      title: input.title,
      description: input.description,
      link: input.link || undefined,
      alt_text: input.altText || undefined,
      media_source: { source_type: "image_url", url: currentPublicUrl(input.imageUrl) },
    }),
  })
  if (!response.ok) {
    throw new Error(`Pinterest pin request failed (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`)
  }
  const data = await response.json() as { id: string; board_id?: string }
  return { pinId: String(data.id), boardId: String(data.board_id || input.boardId) }
}
