import { describe, expect, it } from "vitest"
import { groupDraftsByTitle } from "./draftImport"

describe("groupDraftsByTitle", () => {
  it("agrupa los drafts base por título, de mayor a menor", () => {
    const groups = groupDraftsByTitle([
      { listingId: "1", title: "Frame TV base", imageUrl: null, createdAt: null },
      { listingId: "2", title: "Vertical base", imageUrl: "a.jpg", createdAt: null },
      { listingId: "3", title: "Frame TV base", imageUrl: "b.jpg", createdAt: null },
    ])
    expect(groups).toEqual([
      { title: "Frame TV base", imageUrl: "b.jpg", listingIds: ["1", "3"] },
      { title: "Vertical base", imageUrl: "a.jpg", listingIds: ["2"] },
    ])
  })
})
