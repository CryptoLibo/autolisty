import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { AutomationRepository } from "@/lib/automation/repository"
import { groupDraftsByTitle, listShopDrafts } from "@/lib/etsy/draftImport"
import { getPrimaryShop } from "@/lib/etsy/listings"
import { getFreshToken } from "@/lib/integrations/tokenSession"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Drafts de la tienda que aún no están en el pool ni asignados, agrupados por título.
export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  try {
    const token = await getFreshToken("etsy")
    if (!token) return NextResponse.json({ error: "Etsy is not connected." }, { status: 400 })
    const shopId = Number((await getPrimaryShop(token)).shop_id)
    const known = new AutomationRepository().knownEtsyListingIds()
    const drafts = (await listShopDrafts(token, shopId)).filter((draft) => !known.has(draft.listingId))
    return NextResponse.json({ groups: groupDraftsByTitle(drafts), total: drafts.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to read Etsy drafts." }, { status: 500 })
  }
}
