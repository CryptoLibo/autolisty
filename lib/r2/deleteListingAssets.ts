import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3"
import { r2 } from "./client"

const BUCKET = process.env.R2_BUCKET!
const LISTING_ID_PATTERN = /^LBCreaStudio-[A-Z0-9]{6}$/

function assertListingId(listingId: string) {
  if (!LISTING_ID_PATTERN.test(listingId)) {
    throw new Error(`Invalid listing id: ${listingId}`)
  }
}

async function listKeysForPrefix(prefix: string) {
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    )

    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key)
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined
  } while (continuationToken)

  return keys
}

async function deleteKeys(keys: string[]) {
  if (keys.length === 0) return 0

  for (let index = 0; index < keys.length; index += 1000) {
    const chunk = keys.slice(index, index + 1000)

    await r2.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: chunk.map((key) => ({ Key: key })),
          Quiet: true,
        },
      })
    )
  }

  return keys.length
}

export async function deleteListingAssets(listingId: string) {
  assertListingId(listingId)

  const prefixes = [
    `mockups/${listingId}/`,
    `deliverables/${listingId}/`,
    `pinterest/${listingId}/`,
  ]

  const nestedKeys = (
    await Promise.all(prefixes.map((prefix) => listKeysForPrefix(prefix)))
  ).flat()

  const deletedNestedCount = await deleteKeys(nestedKeys)

  let deletedPdf = false

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: `delivery-pdf/${listingId}.pdf`,
      })
    )
    deletedPdf = true
  } catch {
    deletedPdf = false
  }

  return {
    listingId,
    deletedObjectCount: deletedNestedCount + (deletedPdf ? 1 : 0),
  }
}

export function isValidListingId(listingId: string) {
  return LISTING_ID_PATTERN.test(listingId)
}
