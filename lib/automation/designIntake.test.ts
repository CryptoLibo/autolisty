import { describe, expect, it } from "vitest"
import {
  assertSourceAcceptedForProduct,
  DesignSubmissionError,
  isAllowedDesignImageUrl,
  parseDesignSubmission,
  sniffImageMimeType,
} from "./designIntake"

const KITTL_URL = "https://cache.kittl.com/pr:sharp/plain/api/users/team/uploads/abc.png"

describe("Claude design submissions", () => {
  it("accepts a complete package and normalises keywords", () => {
    const submission = parseDesignSubmission({
      productType: "frame_tv_art",
      prompt: "Vintage oil painting of a snowy village",
      imageUrl: KITTL_URL,
      primaryKeyword: { keyword: "christmas frame tv art", etsyMonthlySearches: 5021, competingListings: 40482, competition: "low", trend3m: 0.07 },
      secondaryKeywords: ["christmas eve art", { keyword: "samsung christmas art" }],
      collection: "Vintage Christmas",
      cropAnchor: "center",
      kittl: { uploadId: "abc", modelId: "nano-banana-2-1-4k", aspectRatio: "16:9" },
      researchSource: "alura",
    })
    expect(submission.productType).toBe("frame_tv_art")
    expect(submission.brief.primaryKeyword?.etsyMonthlySearches).toBe(5021)
    expect(submission.brief.secondaryKeywords.map((item) => item.keyword)).toEqual([
      "christmas eve art",
      "samsung christmas art",
    ])
    expect(submission.brief.cropAnchor).toBe("center")
  })

  it("applies defaults for optional context", () => {
    const submission = parseDesignSubmission({ productType: "png_designs", prompt: "Nurse humor", imageUrl: KITTL_URL })
    expect(submission.brief).toMatchObject({ primaryKeyword: null, secondaryKeywords: [], collection: null, cropAnchor: "center" })
  })

  it("rejects unknown products, missing prompts and bad anchors", () => {
    expect(() => parseDesignSubmission({ productType: "mug", prompt: "x", imageUrl: KITTL_URL })).toThrow(DesignSubmissionError)
    expect(() => parseDesignSubmission({ productType: "png_designs", prompt: "  ", imageUrl: KITTL_URL })).toThrow(/prompt/)
    expect(() =>
      parseDesignSubmission({ productType: "png_designs", prompt: "x", imageUrl: KITTL_URL, cropAnchor: "middle" })
    ).toThrow(/cropAnchor/)
  })

  it("only downloads images from https kittl.com hosts", () => {
    expect(isAllowedDesignImageUrl(new URL(KITTL_URL))).toBe(true)
    expect(isAllowedDesignImageUrl(new URL("http://cache.kittl.com/a.png"))).toBe(false)
    expect(isAllowedDesignImageUrl(new URL("https://kittl.com.evil.example/a.png"))).toBe(false)
    expect(isAllowedDesignImageUrl(new URL("https://evilkittl.com/a.png"))).toBe(false)
    expect(isAllowedDesignImageUrl(new URL("https://cache.kittl.com:8443/a.png"))).toBe(false)
    expect(() => parseDesignSubmission({ productType: "png_designs", prompt: "x", imageUrl: "https://example.com/a.png" })).toThrow(/kittl/)
  })

  it("detects the real image type and enforces the product contract", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    expect(sniffImageMimeType(png)).toBe("image/png")
    expect(sniffImageMimeType(jpeg)).toBe("image/jpeg")
    expect(sniffImageMimeType(new TextEncoder().encode("<html>"))).toBeNull()
    expect(assertSourceAcceptedForProduct("frame_tv_art", "image/jpeg")).toBe("image/jpeg")
    expect(() => assertSourceAcceptedForProduct("png_designs", "image/jpeg")).toThrow(DesignSubmissionError)
    expect(() => assertSourceAcceptedForProduct("png_designs", null)).toThrow(DesignSubmissionError)
  })
})
