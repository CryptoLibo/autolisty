import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ETSY_AUTH_COOKIE, EtsyTokenPayload } from "@/lib/etsy/auth";
import { ensureFreshToken } from "@/lib/etsy/client";
import { getPrimaryShop, getShopListing } from "@/lib/etsy/listings";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ETSY_AUTH_COOKIE)?.value;

  if (!raw) {
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

    const parsed = JSON.parse(raw) as EtsyTokenPayload;
    const token = await ensureFreshToken(parsed);
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
