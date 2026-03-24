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

function wrapStepError(step: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown Etsy integration error.";
  return new Error(`${step}: ${message}`);
}

function isMissingEtsySubresource(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /resource not found/i.test(error.message);
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

    if (!/^\d+$/.test(draftListingId)) {
      return NextResponse.json(
        {
          error: "The Etsy draft listing ID must be the numeric Etsy listing id.",
        },
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

    try {
      await updateShopListingText({
        token,
        shopId,
        listingId: draftListingId,
        title,
        description,
        tags,
      });
    } catch (error) {
      throw wrapStepError("Failed while updating Etsy listing text", error);
    }

    let existingImages = [];
    try {
      existingImages = await listListingImages(token, shopId, draftListingId);
    } catch (error) {
      if (!isMissingEtsySubresource(error)) {
        throw wrapStepError("Failed while reading existing Etsy listing images", error);
      }
    }

    for (const image of existingImages) {
      if (image.listing_image_id) {
        try {
          await deleteListingImage(token, shopId, draftListingId, image.listing_image_id);
        } catch (error) {
          throw wrapStepError("Failed while deleting an existing Etsy listing image", error);
        }
      }
    }

    for (const mockup of mockups) {
      try {
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
      } catch (error) {
        throw wrapStepError(
          `Failed while uploading Etsy mockup image at position ${mockup.rank}`,
          error
        );
      }
    }

    let existingFiles = [];
    try {
      existingFiles = await listListingFiles(token, shopId, draftListingId);
    } catch (error) {
      if (!isMissingEtsySubresource(error)) {
        throw wrapStepError("Failed while reading existing Etsy digital files", error);
      }
    }

    for (const file of existingFiles) {
      if (file.listing_file_id) {
        try {
          await deleteListingFile(token, shopId, draftListingId, file.listing_file_id);
        } catch (error) {
          throw wrapStepError("Failed while deleting an existing Etsy digital file", error);
        }
      }
    }

    try {
      const deliveryPdf = await fetchAsset(deliveryPdfUrl);
      await uploadListingFile({
        token,
        shopId,
        listingId: draftListingId,
        fileBuffer: deliveryPdf.fileBuffer,
        contentType: deliveryPdf.contentType,
        filename: deliveryPdfFilename,
      });
    } catch (error) {
      throw wrapStepError("Failed while uploading the Etsy digital file", error);
    }

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
