import { NextResponse } from "next/server"
import { deleteListingAssets, isValidListingId } from "@/lib/r2/deleteListingAssets"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { listingIds?: string[] }
    const listingIds = Array.isArray(body.listingIds) ? body.listingIds : []

    if (listingIds.length === 0) {
      return NextResponse.json(
        { error: "No listing ids provided" },
        { status: 400 }
      )
    }

    if (listingIds.length > 50) {
      return NextResponse.json(
        { error: "Too many listing ids in one request" },
        { status: 400 }
      )
    }

    const invalid = listingIds.find((listingId) => !isValidListingId(listingId))

    if (invalid) {
      return NextResponse.json(
        { error: `Invalid listing id: ${invalid}` },
        { status: 400 }
      )
    }

    const uniqueListingIds = [...new Set(listingIds)]
    const results = await Promise.all(
      uniqueListingIds.map((listingId) => deleteListingAssets(listingId))
    )

    return NextResponse.json({
      ok: true,
      results,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to delete listing assets" },
      { status: 500 }
    )
  }
}
