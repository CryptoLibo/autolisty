import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import { r2 } from "./client"
import { ProductType, normalizeProductType } from "@/lib/products"

const BUCKET = process.env.R2_BUCKET!
const PUBLIC_URL = process.env.R2_PUBLIC_URL!
const IMAGE_LAB_PREFIX = "image-lab/approved"
const IMAGE_LAB_ID_PATTERN = /^IL-\d{8}-[A-Z0-9]{5}$/

export type ImageLabSize = "1024x1536" | "1536x1024" | "1024x1024"
export type ImageLabQuality = "medium" | "low" | "high"
export type ImageLabStatus = "approved" | "used"

export type ImageLabMetadata = {
  id: string
  productType: ProductType
  prompt: string
  source: "prompt_lab" | "manual" | "edit"
  model: string
  quality: ImageLabQuality
  size: ImageLabSize
  status: ImageLabStatus
  createdAt: string
  updatedAt: string
  notes: string
  editInstruction?: string
  parentImageLabId?: string
  imageKey: string
  metadataKey: string
  imageUrl: string
}

export function productTypeToImageLabSlug(productType: ProductType) {
  switch (productType) {
    case "vertical_wall_art":
      return "vertical-wall-art"
    case "horizontal_wall_art":
      return "horizontal-wall-art"
    case "nursery_wall_art":
      return "nursery-wall-art"
    case "frame_tv_art":
    default:
      return "frame-tv-art"
  }
}

export function imageLabSlugToProductType(slug: string): ProductType {
  switch (slug) {
    case "vertical-wall-art":
      return "vertical_wall_art"
    case "horizontal-wall-art":
      return "horizontal_wall_art"
    case "nursery-wall-art":
      return "nursery_wall_art"
    case "frame-tv-art":
      return "frame_tv_art"
    default:
      return normalizeProductType(slug)
  }
}

function publicUrlForKey(key: string) {
  return `${PUBLIC_URL.replace(/\/+$/, "")}/${key}`
}

function streamToString(body: any): Promise<string> {
  if (!body) return Promise.resolve("")
  if (typeof body.transformToString === "function") return body.transformToString()

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    body.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)))
    body.on("error", reject)
    body.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
  })
}

export function createImageLabId(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "")
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const random = Array.from({ length: 5 }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  ).join("")
  return `IL-${date}-${random}`
}

export function getImageLabKeys(productType: ProductType, id: string) {
  if (!IMAGE_LAB_ID_PATTERN.test(id)) {
    throw new Error("Invalid Image Lab id.")
  }

  const slug = productTypeToImageLabSlug(productType)
  const baseKey = `${IMAGE_LAB_PREFIX}/${slug}/${id}`

  return {
    baseKey,
    imageKey: `${baseKey}/image.png`,
    metadataKey: `${baseKey}/metadata.json`,
  }
}

export async function putImageLabApprovedImage({
  productType,
  prompt,
  source,
  model,
  quality,
  size,
  imageBuffer,
  notes = "",
  editInstruction,
  parentImageLabId,
}: {
  productType: ProductType
  prompt: string
  source: ImageLabMetadata["source"]
  model: string
  quality: ImageLabQuality
  size: ImageLabSize
  imageBuffer: Buffer
  notes?: string
  editInstruction?: string
  parentImageLabId?: string
}) {
  const id = createImageLabId()
  const now = new Date().toISOString()
  const { imageKey, metadataKey } = getImageLabKeys(productType, id)

  const metadata: ImageLabMetadata = {
    id,
    productType,
    prompt,
    source,
    model,
    quality,
    size,
    status: "approved",
    createdAt: now,
    updatedAt: now,
    notes,
    editInstruction,
    parentImageLabId,
    imageKey,
    metadataKey,
    imageUrl: publicUrlForKey(imageKey),
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: imageKey,
      Body: imageBuffer,
      ContentType: "image/png",
    })
  )

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(metadata, null, 2),
      ContentType: "application/json",
    })
  )

  return metadata
}

export async function updateImageLabMetadata(metadata: ImageLabMetadata) {
  const updated: ImageLabMetadata = {
    ...metadata,
    productType: normalizeProductType(metadata.productType),
    updatedAt: new Date().toISOString(),
  }

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: updated.metadataKey,
      Body: JSON.stringify(updated, null, 2),
      ContentType: "application/json",
    })
  )

  return updated
}

export async function listImageLabApprovedImages(productType?: ProductType) {
  const prefix = productType
    ? `${IMAGE_LAB_PREFIX}/${productTypeToImageLabSlug(productType)}/`
    : `${IMAGE_LAB_PREFIX}/`
  const metadataKeys: string[] = []
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
      if (item.Key?.endsWith("/metadata.json")) metadataKeys.push(item.Key)
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  const items = await Promise.all(
    metadataKeys.map(async (key) => {
      try {
        const response = await r2.send(
          new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
          })
        )
        const json = await streamToString(response.Body)
        const parsed = JSON.parse(json) as ImageLabMetadata
        return {
          ...parsed,
          productType: normalizeProductType(parsed.productType),
          imageUrl: parsed.imageUrl || publicUrlForKey(parsed.imageKey),
        }
      } catch {
        return null
      }
    })
  )

  return items
    .filter((item): item is ImageLabMetadata => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getImageLabMetadata(productType: ProductType, id: string) {
  const { metadataKey } = getImageLabKeys(productType, id)
  const response = await r2.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: metadataKey,
    })
  )
  const json = await streamToString(response.Body)
  const parsed = JSON.parse(json) as ImageLabMetadata

  return {
    ...parsed,
    productType: normalizeProductType(parsed.productType),
    imageUrl: parsed.imageUrl || publicUrlForKey(parsed.imageKey),
  }
}

export async function deleteImageLabApprovedImage(productType: ProductType, id: string) {
  const { imageKey, metadataKey } = getImageLabKeys(productType, id)

  await r2.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: {
        Objects: [{ Key: imageKey }, { Key: metadataKey }],
        Quiet: true,
      },
    })
  )

  return { id, deletedObjectCount: 2 }
}
