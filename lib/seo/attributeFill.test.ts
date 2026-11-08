import { describe, expect, it } from "vitest"
import { fillRoomOptions, subjectTargetCount } from "./attributeFill"

const ROOMS = ["Bathroom", "Bedroom", "Dorm", "Entryway", "Game room", "Kids", "Kitchen & dining", "Laundry", "Living room", "Nursery", "Office"].map((name) => ({ name }))
const pick = (...names: string[]) => names.map((name) => ROOMS.find((room) => room.name === name)!)

describe("fillRoomOptions", () => {
  it("nursery: completa hasta 4 y quita salas sin sentido para bebés", () => {
    const result = fillRoomOptions(pick("Nursery", "Dorm"), ROOMS, 5, "nursery_wall_art").map((room) => room.name)
    expect(result).toEqual(["Nursery", "Kids", "Bedroom", "Game room"])
  })

  it("arte general: respeta lo elegido y completa hasta 4", () => {
    const result = fillRoomOptions(pick("Living room"), ROOMS, 5, "vertical_wall_art").map((room) => room.name)
    expect(result).toEqual(["Living room", "Bedroom", "Office", "Entryway"])
  })

  it("no recorta si la IA ya eligió 5", () => {
    const five = pick("Living room", "Bedroom", "Office", "Entryway", "Kitchen & dining")
    expect(fillRoomOptions(five, ROOMS, 5, "frame_tv_art")).toHaveLength(5)
  })
})

describe("subjectTargetCount", () => {
  it("mínimo 2; el 3º solo si la IA lo eligió", () => {
    expect(subjectTargetCount(0, 3, 40)).toBe(2)
    expect(subjectTargetCount(1, 3, 40)).toBe(2)
    expect(subjectTargetCount(2, 3, 40)).toBe(2)
    expect(subjectTargetCount(3, 3, 40)).toBe(3)
    expect(subjectTargetCount(5, 3, 40)).toBe(3)
  })
})
