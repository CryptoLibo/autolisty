import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth/owner";
import { getFreshToken } from "@/lib/integrations/tokenSession";
import { getPrimaryShop, getShopListing } from "@/lib/etsy/listings";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi();
  if (unauthorized) return unauthorized;

  const connected = await getFreshToken("etsy").catch(() => null);

  if (!connected) {
    return NextResponse.json({ error: "Etsy is not connected." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { listingId?: string };
    const listingId = String(body.listingId || "").trim();

    if (!/^\d+$/.test(listingId)) {
      return NextResponse.json(
        { error: "The Etsy listing ID must be numeric." },
        { status: 400 }
      );
    }

    const token = connected;
    const shop = await getPrimaryShop(token);
    const shopId = Number(shop.shop_id);
    const listing = await getShopListing(token, shopId, listingId);
    const state = String(listing?.state || "");
    const listingUrl = String(listing?.url || listing?.listing_url || "").trim();

    if (state !== "active") {
      return NextResponse.json(
        { error: "This Etsy listing is not published yet.", state, listingId },
        { status: 400 }
      );
    }

    if (!listingUrl) {
      return NextResponse.json(
        { error: "Etsy did not return a public listing URL yet.", state, listingId },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      listingId,
      state,
      listingUrl,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to fetch Etsy listing URL." },
      { status: 500 }
    );
  }
}
