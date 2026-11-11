import { describe, expect, it } from "vitest"
import { AUTOMATION_JOB_STATUSES } from "./types"
import { defaultStageTab, pipelineStepOf, stageTabOf, STATUS_LABELS, timeAgo } from "./stages"

describe("stages", () => {
  it("cada estado tiene pestaña y etiqueta en español", () => {
    for (const status of AUTOMATION_JOB_STATUSES) {
      expect(stageTabOf(status)).toBeTruthy()
      expect(STATUS_LABELS[status]).toBeTruthy()
    }
    expect(stageTabOf("PENDING_APPROVAL")).toBe("approve")
    expect(stageTabOf("LOCAL_BUILDING")).toBe("production")
    expect(stageTabOf("WAITING_ETSY_REVIEW")).toBe("review")
    expect(stageTabOf("NEEDS_ATTENTION")).toBe("issues")
    expect(stageTabOf("CANCELED")).toBe("history")
  })

  it("abre la primera pestaña con algo pendiente para ti", () => {
    expect(defaultStageTab({ approve: 2, issues: 1 })).toBe("approve")
    expect(defaultStageTab({ issues: 1, review: 3 })).toBe("issues")
    expect(defaultStageTab({ production: 4 })).toBe("production")
    expect(defaultStageTab({})).toBe("published")
  })

  it("una incidencia marca la etapa donde se paró", () => {
    expect(pipelineStepOf("LOCAL_BUILDING")).toBe(1)
    expect(pipelineStepOf("NEEDS_ATTENTION", "ETSY_MEDIA_SYNCING")).toBe(3)
    expect(pipelineStepOf("COMPLETED")).toBe(6)
  })

  it("tiempo relativo", () => {
    const now = Date.parse("2026-11-11T12:00:00Z")
    expect(timeAgo("2026-11-11T11:48:00Z", now)).toBe("hace 12 min")
    expect(timeAgo("2026-11-11T09:00:00Z", now)).toBe("hace 3 h")
    expect(timeAgo("2026-11-09T12:00:00Z", now)).toBe("hace 2 días")
  })
})
