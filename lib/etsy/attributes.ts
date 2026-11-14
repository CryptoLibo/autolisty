import { EtsyTokenPayload } from "./auth";
import { etsyFetch } from "./client";

type EtsyTaxonomyPropertyValue = {
  value_id?: number;
  name?: string;
  scale_id?: number;
  equal_to?: number[];
};

type EtsyTaxonomyPropertyScale = {
  scale_id?: number;
  display_name?: string;
  description?: string;
};

export type EtsyTaxonomyProperty = {
  property_id?: number;
  name?: string;
  display_name?: string;
  scales?: EtsyTaxonomyPropertyScale[];
  is_required?: boolean;
  supports_attributes?: boolean;
  supports_variations?: boolean;
  is_multivalued?: boolean;
  max_values_allowed?: number | null;
  possible_values?: EtsyTaxonomyPropertyValue[];
  selected_values?: EtsyTaxonomyPropertyValue[];
};

export type EtsyListingProperty = {
  property_id?: number;
  property_name?: string;
  scale_id?: number;
  scale_name?: string;
  value_ids?: number[];
  values?: string[];
};

let preferredArraySyntax = true;

/** Un 400 que habla del formato de los valores: merece probar la otra sintaxis. */
export function isFormatError(status: number, message: string) {
  return status === 400 && /value_ids|values|tags|array|expected|format|parameter/i.test(message);
}

async function parseEtsyError(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}

// Las opciones de una categoría casi nunca cambian: se guardan 24 h (E2).
const TAXONOMY_TTL_MS = 24 * 60 * 60 * 1000;
const taxonomyCache = new Map<number, { at: number; properties: EtsyTaxonomyProperty[] }>();

export async function getSellerTaxonomyProperties(
  token: EtsyTokenPayload,
  taxonomyId: number
) {
  const cached = taxonomyCache.get(taxonomyId);
  if (cached && Date.now() - cached.at < TAXONOMY_TTL_MS) return cached.properties;
  const properties = await fetchSellerTaxonomyProperties(token, taxonomyId);
  taxonomyCache.set(taxonomyId, { at: Date.now(), properties });
  return properties;
}

async function fetchSellerTaxonomyProperties(
  token: EtsyTokenPayload,
  taxonomyId: number
) {
  const response = await etsyFetch(
    `/application/seller-taxonomy/nodes/${taxonomyId}/properties`,
    token
  );

  if (!response.ok) {
    throw new Error(
      await parseEtsyError(response, "Failed to fetch Etsy taxonomy properties.")
    );
  }

  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []) as EtsyTaxonomyProperty[];
}

export async function getListingProperties(
  token: EtsyTokenPayload,
  shopId: number,
  listingId: string
) {
  const response = await etsyFetch(
    `/application/shops/${shopId}/listings/${listingId}/properties`,
    token
  );

  if (!response.ok) {
    throw new Error(
      await parseEtsyError(response, "Failed to fetch Etsy listing properties.")
    );
  }

  const data = await response.json();
  return (Array.isArray(data.results) ? data.results : []) as EtsyListingProperty[];
}

export async function updateListingProperty({
  token,
  shopId,
  listingId,
  propertyId,
  valueIds,
  values,
  scaleId,
}: {
  token: EtsyTokenPayload;
  shopId: number;
  listingId: string;
  propertyId: number;
  valueIds: number[];
  values: string[];
  scaleId?: number | null;
}) {
  async function send(useArraySyntax: boolean) {
    const body = new URLSearchParams();

    for (const valueId of valueIds) {
      body.append(useArraySyntax ? "value_ids[]" : "value_ids", String(valueId));
    }

    for (const value of values) {
      body.append(useArraySyntax ? "values[]" : "values", value);
    }

    if (scaleId) {
      body.set("scale_id", String(scaleId));
    }

    return await etsyFetch(
      `/application/shops/${shopId}/listings/${listingId}/properties/${propertyId}`,
      token,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
  }

  // Primero la sintaxis que funcionó la última vez; la otra solo si Etsy rechaza el formato.
  const first = preferredArraySyntax;
  let lastError = `Failed to update Etsy property ${propertyId}.`;

  for (const useArraySyntax of [first, !first]) {
    const response = await send(useArraySyntax);

    if (response.ok) {
      preferredArraySyntax = useArraySyntax;
      return await response.json();
    }

    lastError = await parseEtsyError(response, lastError);
    if (!isFormatError(response.status, lastError)) break;
  }

  throw new Error(lastError);
}

/** Quita un atributo del listing (deleteListingProperty). */
export async function deleteListingProperty({
  token,
  shopId,
  listingId,
  propertyId,
}: {
  token: EtsyTokenPayload;
  shopId: number;
  listingId: string;
  propertyId: number;
}) {
  const response = await etsyFetch(
    `/application/shops/${shopId}/listings/${listingId}/properties/${propertyId}`,
    token,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(await parseEtsyError(response, `Failed to remove Etsy property ${propertyId}.`));
  }
}
