import { describe, expect, it } from "vitest"
import { openAutomationDatabase } from "./db/database"
import { SeoLessonStore } from "./seoLessons"

describe("SeoLessonStore", () => {
  it("solo las lecciones activadas llegan al prompt, por producto o generales", () => {
    const store = new SeoLessonStore(openAutomationDatabase(":memory:"))
    const general = store.propose({ lesson: "Never use Occasion Housewarming just because it is home decor." })
    const nursery = store.propose({ lesson: "Nursery art: Room is Nursery, Kids, Bedroom and Game room.", productType: "nursery_wall_art" })
    store.propose({ lesson: "Proposed but never activated by the owner." })

    expect(store.activeFor("nursery_wall_art")).toEqual([])
    store.setStatus(general.id, "ACTIVE")
    store.setStatus(nursery.id, "ACTIVE")
    expect(store.activeFor("nursery_wall_art")).toHaveLength(2)
    expect(store.activeFor("frame_tv_art")).toEqual([general.lesson])

    store.setStatus(general.id, "DISABLED")
    expect(store.activeFor("frame_tv_art")).toEqual([])
  })

  it("no duplica una lección ya propuesta", () => {
    const store = new SeoLessonStore(openAutomationDatabase(":memory:"))
    const a = store.propose({ lesson: "Titles always end with | (Digital Download)." })
    const b = store.propose({ lesson: "titles always end with | (digital download)." })
    expect(b.id).toBe(a.id)
  })
})
