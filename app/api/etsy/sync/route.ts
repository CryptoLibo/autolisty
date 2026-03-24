import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ETSY_AUTH_COOKIE, EtsyTokenPayload } from "@/lib/etsy/auth";
import { ensureFreshToken } from "@/lib/etsy/client";
import {
  deleteListingFile,
  deleteListingImage,
  getPrimaryShop,
  getShopListing,
  listListingFiles,
  listListingImages,
  updateShopListingText,
  uploadListingFile,
  uploadListingImage,
} from "@/lib/etsy/listings";

export const runtime = "nodejs";

type SyncMockup = {
  url: string;
  altText?: string;
  rank: number;
};

function getFilenameFromUrl(url: string, fallback: string) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(last || fallback);
  } catch {
    return fallback;
  }
}

async function fetchAsset(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch asset from ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";

  return {
    fileBuffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ETSY_AUTH_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json({ error: "Etsy is not connected." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      draftListingId?: string;
      title?: string;
      description?: string;
      tags?: string[];
      mockups?: SyncMockup[];
      deliveryPdfUrl?: string;
      deliveryPdfFilename?: string;
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
    const deliveryPdfUrl = String(body.deliveryPdfUrl || "").trim();
    const deliveryPdfFilename = String(body.deliveryPdfFilename || "").trim() || "delivery.pdf";

    if (!draftListingId || !title || !description || tags.length === 0 || !deliveryPdfUrl) {
      return NextResponse.json(
        { error: "Missing required Etsy sync data." },
        { status: 400 }
      );
    }

    const parsed = JSON.parse(raw) as EtsyTokenPayload;
    const token = await ensureFreshToken(parsed);

    if (token.access_token !== parsed.access_token || token.expires_at !== parsed.expires_at) {
      cookieStore.set(ETSY_AUTH_COOKIE, JSON.stringify(token), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 90,
      });
    }

    const shop = await getPrimaryShop(token);
    const shopId = Number(shop.shop_id);

    const listing = await getShopListing(token, shopId, draftListingId);
    const listingState = String(listing?.state || "");

    if (!["draft", "edit", "inactive"].includes(listingState)) {
      return NextResponse.json(
        {
          error: `Listing ${draftListingId} is not in a draft/editable state.`,
        },
        { status: 400 }
      );
    }

    await updateShopListingText({
      token,
      shopId,
      listingId: draftListingId,
      title,
      description,
      tags,
    });

    const existingImages = await listListingImages(token, shopId, draftListingId);
    for (const image of existingImages) {
      if (image.listing_image_id) {
        await deleteListingImage(token, shopId, draftListingId, image.listing_image_id);
      }
    }

    for (const mockup of mockups) {
      const asset = await fetchAsset(mockup.url);
      await uploadListingImage({
        token,
        shopId,
        listingId: draftListingId,
        fileBuffer: asset.fileBuffer,
        contentType: asset.contentType,
        filename: getFilenameFromUrl(mockup.url, `mockup-${mockup.rank}.jpg`),
        rank: mockup.rank,
        altText: mockup.altText,
      });
    }

    const existingFiles = await listListingFiles(token, shopId, draftListingId);
    for (const file of existingFiles) {
      if (file.listing_file_id) {
        await deleteListingFile(token, shopId, draftListingId, file.listing_file_id);
      }
    }

    const deliveryPdf = await fetchAsset(deliveryPdfUrl);
    await uploadListingFile({
      token,
      shopId,
      listingId: draftListingId,
      fileBuffer: deliveryPdf.fileBuffer,
      contentType: deliveryPdf.contentType,
      filename: deliveryPdfFilename,
    });

    return NextResponse.json({
      ok: true,
      shopId,
      listingId: draftListingId,
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
