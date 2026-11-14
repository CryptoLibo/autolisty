import { describe, expect, it } from "vitest"
import { uploadedImageRanks } from "./postProduction"

const ev = (eventType: string, fromStatus: string | null, toStatus: string | null, message: string | null = null) =>
  ({ eventType, fromStatus, toStatus, message })

describe("reanudar fotos", () => {
  it("un reintento conserva las fotos de la pasada actual", () => {
    expect(uploadedImageRanks([
      ev("STATUS_CHANGED", "ETSY_TEXT_SYNCING", "ETSY_MEDIA_SYNCING"),
      ev("IMAGE_UPLOADED", null, null, "1"),
      ev("IMAGE_UPLOADED", null, null, "2"),
      ev("STATUS_CHANGED", "ETSY_MEDIA_SYNCING", "RETRY_WAIT"),
      ev("STATUS_CHANGED", "RETRY_WAIT", "ETSY_MEDIA_SYNCING"),
      ev("IMAGE_UPLOADED", null, null, "3"),
    ])).toEqual([1, 2, 3])
  })

  it("una pasada nueva empieza de cero", () => {
    expect(uploadedImageRanks([
      ev("STATUS_CHANGED", "ETSY_TEXT_SYNCING", "ETSY_MEDIA_SYNCING"),
      ev("IMAGE_UPLOADED", null, null, "1"),
      ev("STATUS_CHANGED", "ETSY_TEXT_SYNCING", "ETSY_MEDIA_SYNCING"),
    ])).toEqual([])
  })
})
