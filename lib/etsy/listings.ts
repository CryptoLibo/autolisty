import { EtsyTokenPayload } from "./auth";
import { etsyFetch, getSelfShops } from "./client";

type EtsyListingImage = {
  listing_image_id: number;
  rank?: number;
  url_fullxfull?: string;
};

type EtsyListingFile = {
  listing_file_id: number;
  filename?: string;
};

function toBlobPart(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  const view = new Uint8Array(arrayBuffer);
  view.set(buffer);
  return arrayBuffer;
}

function buildUrlEncodedBody(fields: Record<string, string>, tags: string[], useArraySyntax: boolean) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    body.set(key, value);
  }

  if (useArraySyntax) {
    for (const tag of tags) {
      body.append("tags[]", tag);
    }
  } else {
    body.set("tags", tags.join(","));
  }

  return body;
}

async function parseEtsyError(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}

export async function getPrimaryShop(token: EtsyTokenPayload) {
  const shops = await getSelfShops(token);
  const first = shops[0];

  if (!first?.shop_id) {
    throw new Error("No Etsy shop is available for this account.");
  }

  return first;
}

export async function getShopListing(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string
) {
  void shopId;

  const response = await etsyFetch(`/application/listings/${listingId}`, token);

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to fetch Etsy listing."));
  }

  return await response.json();
}

export async function updateShopListingText({
  token,
  shopId,
  listingId,
  title,
  description,
  tags,
}: {
  token: EtsyTokenPayload;
  shopId: number;
  listingId: string;
  title: string;
  description: string;
  tags: string[];
}) {
  const fields = {
    title,
    description,
  };

  const attempts = [true, false];
  let lastError = "Failed to update Etsy listing.";

  for (const useArraySyntax of attempts) {
    const response = await etsyFetch(
      `/application/shops/${shopId}/listings/${listingId}`,
      token,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: buildUrlEncodedBody(fields, tags, useArraySyntax),
      }
    );

    if (response.ok) {
      return await response.json();
    }

    lastError = await parseEtsyError(response, lastError);
  }

  throw new Error(lastError);
}

export async function listListingImages(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string
) {
  const response = await etsyFetch(
    `/application/shop/${shopId}/listings/${listingId}/images`,
    token
  );

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to fetch Etsy listing images."));
  }

  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []) as EtsyListingImage[];
}

export async function deleteListingImage(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string,
  imageId: number
) {
  const response = await etsyFetch(
    `/application/shop/${shopId}/listings/${listingId}/images/${imageId}`,
    token,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to delete Etsy listing image."));
  }
}

export async function uploadListingImage({
  token,
  shopId,
  listingId,
  fileBuffer,
  filename,
  contentType,
  rank,
  altText,
}: {
  token: EtsyTokenPayload;
  shopId: number;
  listingId: string;
  fileBuffer: Buffer;
  filename: string;
  contentType: string;
  rank: number;
  altText?: string;
}) {
  async function send(includeAltText: boolean) {
    const form = new FormData();
    form.append("image", new Blob([toBlobPart(fileBuffer)], { type: contentType }), filename);
    form.append("rank", String(rank));

    if (includeAltText && altText) {
      form.append("alt_text", altText);
    }

    return await etsyFetch(
      `/application/shop/${shopId}/listings/${listingId}/images`,
      token,
      {
        method: "POST",
        body: form,
      }
    );
  }

  let response = await send(true);

  if (!response.ok && altText) {
    response = await send(false);
  }

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to upload Etsy listing image."));
  }

  return await response.json();
}

export async function listListingFiles(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string
) {
  const response = await etsyFetch(
    `/application/shop/${shopId}/listings/${listingId}/files`,
    token
  );

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to fetch Etsy listing files."));
  }

  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []) as EtsyListingFile[];
}

export async function deleteListingFile(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string,
  fileId: number
) {
  const response = await etsyFetch(
    `/application/shop/${shopId}/listings/${listingId}/files/${fileId}`,
    token,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to delete Etsy listing file."));
  }
}

export async function uploadListingFile({
  token,
  shopId,
  listingId,
  fileBuffer,
  filename,
  contentType,
}: {
  token: EtsyTokenPayload;
  shopId: number;
  listingId: string;
  fileBuffer: Buffer;
  filename: string;
  contentType: string;
}) {
  const form = new FormData();
  form.append("file", new Blob([toBlobPart(fileBuffer)], { type: contentType }), filename);
  form.append("name", filename);

  const response = await etsyFetch(
    `/application/shop/${shopId}/listings/${listingId}/files`,
    token,
    {
      method: "POST",
      body: form,
    }
  );

  if (!response.ok) {
    throw new Error(await parseEtsyError(response, "Failed to upload Etsy listing file."));
  }

  return await response.json();
}
