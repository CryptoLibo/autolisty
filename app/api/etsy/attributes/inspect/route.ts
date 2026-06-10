import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ETSY_AUTH_COOKIE, EtsyTokenPayload } from "@/lib/etsy/auth";
import { ensureFreshToken } from "@/lib/etsy/client";
import { getListingProperties, getSellerTaxonomyProperties } from "@/lib/etsy/attributes";
import { getPrimaryShop, getShopListing } from "@/lib/etsy/listings";

export const runtime = "nodejs";

const TARGET_PROPERTY_NAMES = new Set([
  "orientation",
  "framing",
  "number of pieces included",
  "aspect ratio",
  "can be personalized",
  "primary color",
  "secondary color",
  "home style",
  "room",
  "subject",
]);

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePropertyName(value: unknown) {
  return cleanText(value).toLowerCase();
}

function summarizeProperty(property: any, selectedProperty?: any) {
  const displayName = cleanText(property.display_name || property.name);
  const selectedValues = Array.isArray(selectedProperty?.values)
    ? selectedProperty.values.map((value: unknown) => cleanText(value)).filter(Boolean)
    : [];
  const possibleValues = Array.isArray(property.possible_values)
    ? property.possible_values
        .map((value: any) => ({
          valueId: value.value_id ?? null,
          name: cleanText(value.name),
          scaleId: value.scale_id ?? null,
          equalTo: Array.isArray(value.equal_to) ? value.equal_to : [],
        }))
        .filter((value: any) => value.name || value.valueId)
    : [];

  return {
    propertyId: property.property_id ?? null,
    name: cleanText(property.name),
    displayName,
    supportsAttributes: Boolean(property.supports_attributes),
    supportsVariations: Boolean(property.supports_variations),
    isRequired: Boolean(property.is_required),
    isMultivalued: Boolean(property.is_multivalued),
    maxValuesAllowed: property.max_values_allowed ?? null,
    scales: Array.isArray(property.scales)
      ? property.scales.map((scale: any) => ({
          scaleId: scale.scale_id ?? null,
          displayName: cleanText(scale.display_name),
          description: cleanText(scale.description),
        }))
      : [],
    possibleValues,
    selected: selectedProperty
      ? {
          propertyId: selectedProperty.property_id ?? null,
          propertyName: cleanText(selectedProperty.property_name),
          scaleId: selectedProperty.scale_id ?? null,
          scaleName: cleanText(selectedProperty.scale_name),
          valueIds: Array.isArray(selectedProperty.value_ids)
            ? selectedProperty.value_ids
            : [],
          values: selectedValues,
        }
      : null,
    targetStatus: TARGET_PROPERTY_NAMES.has(normalizePropertyName(displayName))
      ? "tracked"
      : property.supports_attributes
        ? "available"
        : "ignored",
  };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ETSY_AUTH_COOKIE)?.value;

  if (!raw) {
    return NextResponse.json({ error: "Etsy is not connected." }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { listingId?: string };
    const listingId = cleanText(body.listingId);

    if (!/^\d+$/.test(listingId)) {
      return NextResponse.json(
        { error: "The Etsy listing ID must be numeric." },
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
    const listing = await getShopListing(token, shopId, listingId);
    const taxonomyId = Number(listing?.taxonomy_id);

    if (!Number.isInteger(taxonomyId) || taxonomyId <= 0) {
      return NextResponse.json(
        { error: "Etsy did not return a valid taxonomy_id for this listing." },
        { status: 400 }
      );
    }

    const [taxonomyProperties, listingProperties] = await Promise.all([
      getSellerTaxonomyProperties(token, taxonomyId),
      getListingProperties(token, shopId, listingId),
    ]);
    const selectedByName = new Map(
      listingProperties.map((property) => [
        normalizePropertyName(property.property_name),
        property,
      ])
    );
    const properties = taxonomyProperties
      .map((property) =>
        summarizeProperty(
          property,
          selectedByName.get(normalizePropertyName(property.display_name || property.name))
        )
      )
      .sort((a, b) => {
        const statusOrder = { tracked: 0, available: 1, ignored: 2 };
        return (
          statusOrder[a.targetStatus as keyof typeof statusOrder] -
            statusOrder[b.targetStatus as keyof typeof statusOrder] ||
          a.displayName.localeCompare(b.displayName)
        );
      });

    return NextResponse.json({
      ok: true,
      shopId,
      listingId,
      listing: {
        title: cleanText(listing?.title),
        state: cleanText(listing?.state),
        taxonomyId,
        url: cleanText(listing?.url || listing?.listing_url),
      },
      properties,
      trackedProperties: properties.filter((property) => property.targetStatus === "tracked"),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to inspect Etsy listing attributes." },
      { status: 500 }
    );
  }
}
