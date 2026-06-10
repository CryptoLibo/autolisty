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

async function parseEtsyError(response: Response, fallback: string) {
  const message = await response.text();
  return message || fallback;
}

export async function getSellerTaxonomyProperties(
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

  const attempts = [true, false];
  let lastError = `Failed to update Etsy property ${propertyId}.`;

  for (const useArraySyntax of attempts) {
    const response = await send(useArraySyntax);

    if (response.ok) {
      return await response.json();
    }

    lastError = await parseEtsyError(response, lastError);
  }

  throw new Error(lastError);
}
