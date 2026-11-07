import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth/owner";
import { getFreshToken } from "@/lib/integrations/tokenSession";
import { getPrimaryShop, getShopListing } from "@/lib/etsy/listings";
import {
  syncDraftFile,
  syncDraftImages,
  syncDraftText,
  wrapStepError,
} from "@/lib/etsy/draftSync";

export const runtime = "nodejs";

type SyncMockup = {
  url: string;
  altText?: string;
  rank: number;
};

type EtsyAttributeSelection = {
  propertyId?: number;
  displayName?: string;
  valueIds?: number[];
  values?: string[];
  scaleId?: number | null;
};

export async function POST(req: Request) {
  const unauthorized = await requireOwnerApi();
  if (unauthorized) return unauthorized;

  const connected = await getFreshToken("etsy").catch(() => null);

  if (!connected) {
    return NextResponse.json({ error: "Etsy is not connected." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      draftListingId?: string;
      title?: string;
      description?: string;
      tags?: string[];
      etsyAttributes?: EtsyAttributeSelection[];
      mockups?: SyncMockup[];
      deliveryPdfUrl?: string;
      deliveryPdfFilename?: string;
      deliveryFileUrl?: string;
      deliveryFilename?: string;
    };

    const draftListingId = String(body.draftListingId || "").trim();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const tags = Array.isArray(body.tags)
      ? body.tags.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const mockups = Array.isArray(body.mockups)
      ? body.mockups.filter((item) => item?.url)
      : [];
    const etsyAttributes = Array.isArray(body.etsyAttributes)
      ? body.etsyAttributes
          .map((attribute) => ({
            propertyId: Number(attribute.propertyId),
            valueIds: Array.isArray(attribute.valueIds)
              ? attribute.valueIds.map((valueId) => Number(valueId)).filter((valueId) => Number.isInteger(valueId) && valueId > 0)
              : [],
            values: Array.isArray(attribute.values)
              ? attribute.values.map((value) => String(value || "").trim()).filter(Boolean)
              : [],
            scaleId: attribute.scaleId ? Number(attribute.scaleId) : null,
          }))
          .filter(
            (attribute) =>
              Number.isInteger(attribute.propertyId) &&
              attribute.propertyId > 0 &&
              attribute.valueIds.length > 0 &&
              attribute.values.length > 0
          )
      : [];
    const deliveryFileUrl = String(body.deliveryFileUrl || body.deliveryPdfUrl || "").trim();
    const deliveryFilename =
      String(body.deliveryFilename || body.deliveryPdfFilename || "").trim() || "delivery.pdf";

    if (!draftListingId || !title || !description || tags.length === 0 || !deliveryFileUrl) {
      return NextResponse.json(
        { error: "Missing required Etsy sync data." },
        { status: 400 }
      );
    }

    if (!/^\d+$/.test(draftListingId)) {
      return NextResponse.json(
        {
          error: "The Etsy draft listing ID must be the numeric Etsy listing id.",
        },
        { status: 400 }
      );
    }

    const token = connected;

    const shop = await getPrimaryShop(token);
    const shopId = Number(shop.shop_id);

    let listing: any;

    try {
      listing = await getShopListing(token, shopId, draftListingId);
    } catch (error) {
      throw wrapStepError(
        `Unable to find draft listing ${draftListingId} in Etsy shop ${shopId}`,
        error
      );
    }

    const listingState = String(listing?.state || "");

    if (!["draft", "edit", "inactive"].includes(listingState)) {
      return NextResponse.json(
        {
          error: `Listing ${draftListingId} is not in a draft/editable state.`,
        },
        { status: 400 }
      );
    }

    const draft = { token, shopId, listingId: draftListingId };
    await syncDraftText(draft, { title, description, tags, attributes: etsyAttributes });
    await syncDraftImages(draft, mockups);
    await syncDraftFile(draft, { url: deliveryFileUrl, filename: deliveryFilename });

    let refreshedListing: any = null;

    try {
      refreshedListing = await getShopListing(token, shopId, draftListingId);
    } catch {
      refreshedListing = null;
    }

    return NextResponse.json({
      ok: true,
      shopId,
      listingId: draftListingId,
      listingUrl:
        refreshedListing?.url ||
        refreshedListing?.listing_url ||
        listing?.url ||
        listing?.listing_url ||
        null,
      updatedAttributes: etsyAttributes.length,
      uploadedImages: mockups.length,
      uploadedFiles: 1,
    });
  } catch (error: any) {
    console.error("Etsy sync error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to sync Etsy draft." },
      { status: 500 }
    );
  }
}
