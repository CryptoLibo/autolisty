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
