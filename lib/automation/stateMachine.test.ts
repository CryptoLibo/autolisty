import { describe, expect, it } from "vitest"
import {
  assertAutomationTransition,
  canTransitionAutomationJob,
  isTerminalAutomationStatus,
} from "./stateMachine"

describe("automation state machine", () => {
  it("accepts the complete production path without a video", () => {
    const path = [
      "CREATED",
      "SOURCE_READY",
      "QUEUED_LOCAL",
      "LOCAL_CLAIMED",
      "LOCAL_BUILDING",
      "LOCAL_VALIDATING",
      "LOCAL_UPLOADING",
      "LOCAL_COMPLETE",
      "DRAFT_ASSIGNED",
      "SEO_GENERATING",
      "SEO_READY",
      "PINTEREST_SEO_GENERATING",
      "PINTEREST_SEO_READY",
      "DELIVERY_PREPARING",
      "DELIVERY_READY",
      "ETSY_TEXT_SYNCING",
      "ETSY_MEDIA_SYNCING",
      "ETSY_FILE_SYNCING",
      "WAITING_ETSY_REVIEW",
      "ETSY_ACTIVE",
      "PINTEREST_PUBLISHING",
      "COMPLETED",
    ] as const

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionAutomationJob(path[index], path[index + 1])).toBe(true)
    }
  })

  it("only resumes an error at its recorded status", () => {
    expect(canTransitionAutomationJob("SEO_GENERATING", "RETRY_WAIT")).toBe(true)
    expect(canTransitionAutomationJob("RETRY_WAIT", "SEO_GENERATING", "SEO_GENERATING")).toBe(true)
    expect(canTransitionAutomationJob("RETRY_WAIT", "ETSY_TEXT_SYNCING", "SEO_GENERATING")).toBe(false)
  })

  it("rejects skipped stages", () => {
    expect(() => assertAutomationTransition("LOCAL_COMPLETE", "SEO_GENERATING")).toThrow(
      "Invalid automation transition"
    )
  })

  it("recognizes terminal states", () => {
    expect(isTerminalAutomationStatus("COMPLETED")).toBe(true)
    expect(isTerminalAutomationStatus("CANCELED")).toBe(true)
    expect(isTerminalAutomationStatus("WAITING_ETSY_REVIEW")).toBe(false)
  })
})
