"use client"

import { useEffect, useRef } from "react"
import * as art from "@/vendor/habblaud/client/src/art"
import { propSprite } from "@/vendor/habblaud/client/src/world/render/props"
import type { OfficeFocus, WorkState } from "./habblaud-world"

type Agent = { id: string; name: string; department: string; status: "active" | "consultative" | "planned" | "blocked" }
type Props = {
  ceoName: string; researcherName: string; plannerName: string; designerName: string
  ceoState: WorkState; researcherState: WorkState; plannerState: WorkState; designerState: WorkState
  workingSpecialistId?: string | null
  roster: Agent[]; onDepartment: (department: string) => void; onFocus: (focus: OfficeFocus) => void
}
type Ctx = CanvasRenderingContext2D
type Station = { x: number; y: number; screen?: art.Rect; mode: art.ScreenMode }
type AmbientScreen = { rect: art.Rect; mode: art.ScreenMode; seed: number }
type AmbientWindow = { rect: art.Rect; seed: number }

const W = 1552
const H = 786
const BX = 136
const BY = 96
const COL = 256
const ROW = 180
const GAP = 34
const Y = [BY, BY + ROW + GAP, BY + 2 * (ROW + GAP)] as const

const rooms: Array<{ name: string; roles: string[]; floor: art.FloorKind; accent: string; mode: art.ScreenMode }> = [
  { name: "Producto", roles: ["product_lead", "product_planner"], floor: "carpet", accent: "#9ab7ad", mode: "tasks" },
  { name: "Creativo", roles: ["creative_lead", "visual_designer", "creation_operator"], floor: "wood", accent: "#b9a8c6", mode: "browser" },
  { name: "Dirección", roles: ["ceo"], floor: "marble", accent: "#bda480", mode: "chat" },
  { name: "Mercado", roles: ["market_lead", "market_researcher"], floor: "carpet", accent: "#8aaeca", mode: "search" },
  { name: "Producción", roles: ["production_lead"], floor: "concrete", accent: "#b9b59a", mode: "progress" },
  { name: "Calidad", roles: ["quality_lead"], floor: "tile_check", accent: "#b4c4a2", mode: "tasks" },
  { name: "Marketing", roles: ["marketing_lead", "pinterest_specialist"], floor: "wood", accent: "#cba89d", mode: "browser" },
  { name: "Comercial", roles: ["commerce_lead", "seo_specialist"], floor: "carpet", accent: "#c9b08e", mode: "docs" },
  { name: "Finanzas", roles: ["finance_lead"], floor: "tile_check", accent: "#a8b9d2", mode: "tasks" },
  { name: "Sistemas", roles: ["systems_lead"], floor: "concrete", accent: "#9daeb8", mode: "terminal" },
]

const captions: Record<string, string> = {
  ceo: "James", market_lead: "Mercado", market_researcher: "Investiga", product_lead: "Producto",
  product_planner: "Planifica", creative_lead: "Creativo", visual_designer: "Diseña",
  creation_operator: "Kittl", production_lead: "Produce", commerce_lead: "Etsy", seo_specialist: "SEO",
  marketing_lead: "Marketing", pinterest_specialist: "Pinterest", quality_lead: "Calidad",
  finance_lead: "Finanzas", systems_lead: "Sistemas",
}

const appearances = Object.fromEntries(rooms.flatMap((room) => room.roles).map((id, index) => [id,
  art.appearanceFromSeed(501 + index * 71, id === "ceo" ? { look: "m", parts: { hairStyle: "side_part", topStyle: "shirt_tie", top: "#4c7890" } } : undefined),
])) as Record<string, art.Appearance>

function fill(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function put(ctx: Ctx, kind: art.FurnitureKind, x: number, y: number, variant?: string, seed = 0) {
  const sprite = art.furnitureSprites(kind, variant, 0, { seed }).base
  const left = Math.round(x - sprite.ax)
  const top = Math.round(y - sprite.ay)
  ctx.drawImage(sprite.canvas, left, top)
  return { sprite, left, top }
}

function furniture(ctx: Ctx, kind: art.FurnitureKind, x: number, y: number, tx: number, ty: number, variant?: string, seed = 0) {
  const size = art.FURNITURE[kind].footprint
  return put(ctx, kind, x + tx * 16 + size.w * 8, y + (ty + size.h) * 16, variant, seed)
}

function wallItem(ctx: Ctx, kind: art.FurnitureKind, x: number, y: number, tile: number, variant?: string) {
  return put(ctx, kind, x + tile * 16, y + 32, variant)
}

function sign(ctx: Ctx, title: string, center: number, y: number) {
  const width = Math.max(86, title.length * 7 + 19)
  fill(ctx, center - width / 2 - 2, y - 14, width + 4, 20, "#22333b")
  fill(ctx, center - width / 2, y - 12, width, 16, "#3f5863")
  ctx.fillStyle = "#f5f1e5"
  ctx.textAlign = "center"
  ctx.font = "bold 10px Arial, sans-serif"
  ctx.fillText(title.toUpperCase(), center, y)
  ctx.textAlign = "start"
}

function drawRoom(ctx: Ctx, x: number, y: number, floor: art.FloorKind, accent: string, seed: number, pattern: art.WallPattern = "plain", northDoor = false, southDoor = true) {
  const wall: art.WallStyle = { base: "#e2e8e8", trim: accent, pattern }
  art.drawFloor(ctx, floor, x, y, COL, ROW, { seed })
  art.drawWallFace(ctx, x, y, COL, wall, northDoor ? { doorways: [{ x: x + 108, w: 40 }] } : undefined)
  if (northDoor) wallItem(ctx, "door_frame", x, y, 8)
  art.drawWallTop(ctx, x, y, 5, ROW, wall)
  art.drawWallTop(ctx, x + COL - 5, y, 5, ROW, wall)
  art.drawSouthWall(ctx, x, y + ROW - 16, COL, wall, southDoor ? { doorways: [{ x: x + 108, w: 40 }] } : undefined)
}

function background(ctx: Ctx) {
  art.drawFloor(ctx, "grass", 0, 0, W, H, { seed: 17 })
  art.drawFloor(ctx, "sidewalk", 0, 744, W, 23, { seed: 18 })
  art.drawFloor(ctx, "street", 0, 767, W, 19, { seed: 19 })
  for (const [kind, x, y, seed] of [
    ["tree", 42, 115, 1], ["pine", 73, 275, 2], ["tree", 43, 492, 3], ["pine", 58, 669, 4],
    ["tree", 1494, 108, 5], ["pine", 1501, 290, 6], ["tree", 1508, 494, 7], ["pine", 1492, 660, 8],
    ["bush", 215, 59, 9], ["bush", 1348, 51, 10], ["flowers", 1430, 728, 11],
    ["flowers", 112, 725, 12], ["hedge", 330, 75, 13], ["hedge", 1220, 75, 14],
    ["bench", 64, 574, 15], ["bench", 1490, 574, 16], ["lamp", 90, 740, 17],
    ["lamp", 1460, 740, 18], ["bush", 64, 360, 19], ["bush", 1498, 360, 20],
  ] as Array<["tree" | "pine" | "bush" | "flowers" | "hedge" | "bench" | "lamp", number, number, number]>) {
    const sprite = propSprite({ kind, x, y, seed })
    ctx.drawImage(sprite.canvas, x - sprite.ax, y - sprite.ay)
  }
  fill(ctx, BX - 6, BY - 6, COL * 5 + 12, Y[2] + ROW - BY + 12, "#3c4d50")
  for (const y of [Y[0] + ROW, Y[1] + ROW]) {
    art.drawFloor(ctx, "concrete", BX, y, COL * 5, GAP, { seed: y })
    for (let x = BX + 25; x < BX + COL * 5 - 30; x += 115) fill(ctx, x, y + 16, 57, 3, "#9aafb2")
  }
  art.drawFloor(ctx, "sidewalk", BX + 14, Y[2] + ROW, COL * 5 - 28, 36, { seed: 21 })
}

function stationTiles(count: number, roomIndex: number) {
  if (count === 1) return [roomIndex === 2 || roomIndex === 8 ? 4 : 10]
  return count === 2 ? [4, 10] : [3, 7, 11]
}

function departmentDetails(ctx: Ctx, index: number, x: number, y: number) {
  switch (index) {
    case 0: // Producto: plan de oferta y archivo de especificaciones.
      wallItem(ctx, "whiteboard", x, y, 8)
      furniture(ctx, "filing_cabinet", x, y, 13, 2)
      furniture(ctx, "printer", x, y, 1, 2)
      furniture(ctx, "plant_small", x, y, 14, 8, "succulent")
      break
    case 1: // Creativo: referencias, materiales y luz de estudio.
      wallItem(ctx, "painting", x, y, 8)
      wallItem(ctx, "poster", x, y, 13, "rocket")
      furniture(ctx, "bookshelf", x, y, 12, 2)
      furniture(ctx, "floor_lamp", x, y, 1, 8)
      furniture(ctx, "plant_small", x, y, 14, 8, "flower")
      break
    case 2: // Dirección: mesa de conversación y archivo.
      wallItem(ctx, "whiteboard", x, y, 8)
      furniture(ctx, "bookshelf", x, y, 12, 2)
      furniture(ctx, "water_cooler", x, y, 1, 8)
      furniture(ctx, "plant_tall", x, y, 14, 8, "bonsai")
      furniture(ctx, "cafe_table", x, y, 11, 8)
      furniture(ctx, "cafe_chair", x, y, 12, 8, "left")
      break
    case 3: // Mercado: evidencias y consulta de fuentes.
      wallItem(ctx, "shelf_wall", x, y, 8)
      furniture(ctx, "filing_cabinet", x, y, 1, 2)
      furniture(ctx, "printer", x, y, 13, 2)
      furniture(ctx, "plant_small", x, y, 14, 8, "fern")
      break
    case 4: // Producción: equipos y cola física.
      wallItem(ctx, "poster", x, y, 8, "ship_it")
      furniture(ctx, "printer", x, y, 1, 2)
      furniture(ctx, "filing_cabinet", x, y, 13, 2)
      furniture(ctx, "water_cooler", x, y, 14, 8)
      furniture(ctx, "binder_shelf", x, y, 2, 3)
      break
    case 5: // Calidad: tablero de revisión y muestras.
      wallItem(ctx, "whiteboard", x, y, 10)
      furniture(ctx, "filing_cabinet", x, y, 1, 2)
      furniture(ctx, "binder_shelf", x, y, 14, 2)
      furniture(ctx, "plant_small", x, y, 14, 8, "succulent")
      furniture(ctx, "meeting_table", x, y, 2, 6)
      break
    case 6: // Marketing: campaña y referencias visuales.
      wallItem(ctx, "painting", x, y, 10)
      wallItem(ctx, "poster", x, y, 13, "ship_it")
      furniture(ctx, "bookshelf", x, y, 12, 2)
      furniture(ctx, "floor_lamp", x, y, 1, 8)
      break
    case 7: // Comercial: documentos y expedientes Etsy.
      wallItem(ctx, "shelf_wall", x, y, 10)
      furniture(ctx, "printer", x, y, 1, 2)
      furniture(ctx, "filing_cabinet", x, y, 13, 2)
      furniture(ctx, "plant_tall", x, y, 14, 8, "ficus")
      break
    case 8: // Finanzas: registros y control.
      wallItem(ctx, "whiteboard", x, y, 10)
      furniture(ctx, "filing_cabinet", x, y, 1, 2)
      furniture(ctx, "filing_cabinet", x, y, 13, 2)
      furniture(ctx, "plant_small", x, y, 14, 8, "flower")
      furniture(ctx, "binder_shelf", x, y, 12, 3)
      break
    case 9: // Sistemas: equipo y documentación técnica.
      wallItem(ctx, "poster", x, y, 10, "code")
      furniture(ctx, "printer", x, y, 1, 2)
      furniture(ctx, "bookshelf", x, y, 12, 2)
      furniture(ctx, "water_cooler", x, y, 14, 8)
      furniture(ctx, "binder_shelf", x, y, 2, 3)
  }
}

function department(ctx: Ctx, index: number, stations: Map<string, Station>, windows: AmbientWindow[], clocks: art.Rect[]) {
  const room = rooms[index]
  const x = BX + index % 5 * COL
  const y = Y[Math.floor(index / 5)]
  const patterns: art.WallPattern[] = ["stripes", "wood_panel", "marble", "plain", "tiles", "plain", "wood_panel", "stripes", "marble", "brick"]
  drawRoom(ctx, x, y, room.floor, room.accent, 101 + index * 17, patterns[index], index >= 5)
  sign(ctx, room.name, x + COL / 2, y - 3)
  const window = wallItem(ctx, "window", x, y, 3)
  if (window.sprite.rects?.glass) {
    const rect = window.sprite.rects.glass
    windows.push({ rect: { x: window.left + rect.x, y: window.top + rect.y, w: rect.w, h: rect.h }, seed: index * 13 + 4 })
  }
  const clock = wallItem(ctx, "clock", x, y, 14)
  if (clock.sprite.rects?.face) {
    const rect = clock.sprite.rects.face
    clocks.push({ x: clock.left + rect.x, y: clock.top + rect.y, w: rect.w, h: rect.h })
  }
  if (index === 2) art.drawRug(ctx, x + 76, y + 99, 103, 41, "#849d9c", 52)
  departmentDetails(ctx, index, x, y)
  const deskVariants = ["white", "wood", "dark", "white", "dark", "white", "wood", "white", "dark", "dark"]
  const chairVariants = ["green", "red", "black", "blue", "gray", "green", "red", "blue", "black", "gray"]
  for (const [position, roleId] of room.roles.entries()) {
    const tx = stationTiles(room.roles.length, index)[position]
    const desk = furniture(ctx, "desk", x, y, tx, 5, deskVariants[index], position + index * 3)
    furniture(ctx, "office_chair", x, y, tx, 7, chairVariants[index])
    const screen = desk.sprite.rects?.screen
    stations.set(roleId, {
      x: x + tx * 16 + 16, y: y + 121,
      screen: screen ? { x: desk.left + screen.x, y: desk.top + screen.y, w: screen.w, h: screen.h } : undefined,
      mode: room.mode,
    })
  }
}

function commonAreas(ctx: Ctx) {
  const ambientScreens: AmbientScreen[] = []
  const titles = ["Recepción", "Reuniones", "Descanso", "Copa", "Baños"]
  const floors: art.FloorKind[] = ["marble", "carpet", "wood", "tile_check", "tile_white"]
  const y = Y[2]
  for (let col = 0; col < 5; col++) {
    const x = BX + col * COL
    drawRoom(ctx, x, y, floors[col], "#b0bec0", 600 + col * 13, col === 4 ? "tiles" : "plain", true, false)
    sign(ctx, titles[col], x + COL / 2, y - 3)
  }
  let x = BX
  wallItem(ctx, "elevator", x, y, 3)
  wallItem(ctx, "clock", x, y, 11)
  wallItem(ctx, "painting", x, y, 14)
  furniture(ctx, "reception_desk", x, y, 7, 6)
  furniture(ctx, "bench", x, y, 2, 9)
  furniture(ctx, "bench", x, y, 11, 9)
  furniture(ctx, "water_cooler", x, y, 13, 8)
  furniture(ctx, "plant_tall", x, y, 14, 8, "ficus")
  wallItem(ctx, "shelf_wall", x, y, 6)
  x = BX + COL
  wallItem(ctx, "whiteboard", x, y, 4)
  wallItem(ctx, "tv", x, y, 13)
  art.drawRug(ctx, x + 43, y + 77, 169, 73, "#809eaa", 43)
  furniture(ctx, "meeting_table", x, y, 6, 6)
  furniture(ctx, "stool", x, y, 4, 9)
  furniture(ctx, "stool", x, y, 12, 9)
  furniture(ctx, "stool", x, y, 8, 9)
  furniture(ctx, "bookshelf", x, y, 13, 3)
  furniture(ctx, "floor_lamp", x, y, 2, 8)
  x = BX + COL * 2
  wallItem(ctx, "painting", x, y, 4)
  const loungeTv = wallItem(ctx, "tv", x, y, 11)
  if (loungeTv.sprite.rects?.tv) {
    const rect = loungeTv.sprite.rects.tv
    ambientScreens.push({ rect: { x: loungeTv.left + rect.x, y: loungeTv.top + rect.y, w: rect.w, h: rect.h }, mode: "show", seed: 17 })
  }
  art.drawRug(ctx, x + 35, y + 82, 181, 72, "#83a489", 34)
  furniture(ctx, "sofa", x, y, 3, 7, "down")
  furniture(ctx, "coffee_table", x, y, 7, 9)
  furniture(ctx, "armchair", x, y, 12, 8, "left")
  furniture(ctx, "beanbag", x, y, 2, 9, "red")
  furniture(ctx, "pingpong_table", x, y, 10, 5)
  const arcade = furniture(ctx, "arcade", x, y, 14, 3)
  if (arcade.sprite.rects?.screen) {
    const rect = arcade.sprite.rects.screen
    ambientScreens.push({ rect: { x: arcade.left + rect.x, y: arcade.top + rect.y, w: rect.w, h: rect.h }, mode: "game", seed: 8 })
  }
  furniture(ctx, "plant_tall", x, y, 1, 8, "bonsai")
  furniture(ctx, "bookshelf", x, y, 1, 3)
  furniture(ctx, "floor_lamp", x, y, 13, 8)
  x = BX + COL * 3
  wallItem(ctx, "poster", x, y, 3, "coffee")
  for (let tx = 1; tx < 7; tx++) furniture(ctx, "counter", x, y, tx, 3, tx % 2 ? "drawers" : "plain")
  furniture(ctx, "counter_sink", x, y, 3, 3)
  furniture(ctx, "coffee_machine", x, y, 5, 3)
  furniture(ctx, "microwave", x, y, 7, 3)
  furniture(ctx, "fridge", x, y, 13, 3)
  furniture(ctx, "vending_machine", x, y, 14, 6)
  furniture(ctx, "cafe_table", x, y, 5, 8)
  furniture(ctx, "cafe_chair", x, y, 4, 8, "right")
  furniture(ctx, "cafe_chair", x, y, 6, 8, "left")
  furniture(ctx, "cafe_table", x, y, 10, 8)
  furniture(ctx, "cafe_chair", x, y, 9, 8, "right")
  furniture(ctx, "cafe_chair", x, y, 11, 8, "left")
  x = BX + COL * 4
  wallItem(ctx, "mirror", x, y, 3)
  wallItem(ctx, "mirror", x, y, 6)
  furniture(ctx, "sink", x, y, 3, 3)
  furniture(ctx, "sink", x, y, 6, 3)
  furniture(ctx, "toilet_stall", x, y, 10, 6)
  furniture(ctx, "toilet_stall", x, y, 13, 6)
  furniture(ctx, "trash_bin", x, y, 2, 8)
  return ambientScreens
}

function staticWorld(ctx: Ctx) {
  ctx.imageSmoothingEnabled = false
  background(ctx)
  const stations = new Map<string, Station>()
  const windows: AmbientWindow[] = []
  const clocks: art.Rect[] = []
  rooms.forEach((_, index) => department(ctx, index, stations, windows, clocks))
  const ambientScreens = commonAreas(ctx)
  return { stations, ambientScreens, windows, clocks }
}

type Point = { x: number; y: number }

function routeFor(roomIndex: number, station: Station): Point[] {
  const col = roomIndex % 5
  const row = Math.floor(roomIndex / 5)
  const x = BX + col * COL
  const y = Y[row]
  const hallY = y + ROW + GAP / 2
  const commonDestinations = [1, 2, 3, 2, 1]
  const destinationCol = row === 0 ? col % 2 ? col : (col + 1) % 5 : commonDestinations[col]
  const destinationX = BX + destinationCol * COL + COL / 2
  const destinationY = row === 0 ? col % 2 ? Y[1] + 55 : y + 151 : Y[2] + 135
  return [
    { x: station.x, y: station.y },
    { x: x + COL / 2, y: y + 151 },
    { x: x + COL / 2, y: hallY },
    { x: destinationX, y: hallY },
    { x: destinationX, y: destinationY },
  ]
}

function routePosition(points: Point[], progress: number): { point: Point; direction: art.Dir } {
  const distances = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y))
  const total = distances.reduce((sum, distance) => sum + distance, 0)
  let remaining = Math.max(0, Math.min(1, progress)) * total
  for (let index = 0; index < distances.length; index++) {
    const start = points[index]
    const end = points[index + 1]
    if (remaining <= distances[index] || index === distances.length - 1) {
      const amount = distances[index] ? Math.min(1, remaining / distances[index]) : 1
      return {
        point: { x: Math.round(start.x + (end.x - start.x) * amount), y: Math.round(start.y + (end.y - start.y) * amount) },
        direction: Math.abs(end.x - start.x) > Math.abs(end.y - start.y)
          ? end.x < start.x ? "left" : "right" : end.y < start.y ? "up" : "down",
      }
    }
    remaining -= distances[index]
  }
  return { point: points.at(-1)!, direction: "down" }
}

function drawAgent(ctx: Ctx, agent: Agent, caption: string, station: Station, state: WorkState, tick: number) {
  const roomIndex = rooms.findIndex((room) => room.roles.includes(agent.id))
  const position = rooms[roomIndex].roles.indexOf(agent.id)
  const socialOffsets = [440, 600, 750, 600, 440]
  const offset = roomIndex < 5 ? roomIndex * 89 : socialOffsets[roomIndex % 5]
  const phase = (tick + offset + position * 157) % 1000
  const wandering = state === "idle" && agent.status !== "blocked" && phase >= 620 && phase < 860
  const walking = wandering && (phase < 710 || phase >= 770)
  const points = routeFor(roomIndex, station)
  const path = phase < 770 ? points : [...points].reverse()
  const location = wandering ? routePosition(path, phase < 770 ? Math.min(1, (phase - 620) / 90) : (phase - 770) / 90) : { point: station, direction: "up" as art.Dir }
  const { x, y } = location.point
  const destination = roomIndex < 5 ? "colleague" : ["meeting", "lounge", "cafe", "lounge", "meeting"][roomIndex % 5]
  const pose = state === "attention" ? "raise_hand" : state === "working" ? "type" : walking ? "walk"
    : wandering ? destination === "cafe" ? "drink" : destination === "lounge" ? "sit" : destination === "meeting" ? "talk" : "read" : "sit"
  const sprite = art.characterSprite({
    appearance: appearances[agent.id], dir: walking ? location.direction : wandering ? "down" : "up",
    pose, frame: Math.floor(tick / 5), seated: !wandering || destination === "lounge" && !walking,
  })
  ctx.globalAlpha = agent.status === "blocked" ? .62 : 1
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - sprite.ay))
  ctx.globalAlpha = 1
  if (state !== "idle") {
    const icon = art.iconSprite(state === "attention" ? "alert" : "idea")
    ctx.drawImage(icon.canvas, Math.round(x - icon.ax), Math.round(y - 38 - icon.ay))
  }
  if (wandering && state === "idle") return
  const label = caption.slice(0, 11)
  const width = Math.max(56, Math.min(84, label.length * 6 + 17))
  fill(ctx, x - width / 2 - 1, y + 5, width + 2, 17, "#17292c")
  fill(ctx, x - width / 2, y + 6, width, 15, "#344d52")
  fill(ctx, x - width / 2 + 4, y + 11, 5, 5,
    agent.status === "blocked" ? "#db7466" : agent.status === "planned" ? "#9da9a3" : state === "working" ? "#edb56b" : state === "attention" ? "#e17566" : agent.status === "consultative" ? "#80b7cf" : "#61bf8d")
  ctx.fillStyle = "#f7f5ed"
  ctx.font = "bold 9px Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(label, x + 4, y + 17)
  ctx.textAlign = "start"
}

export default function CompanyWorld(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  useEffect(() => { latest.current = props }, [props])
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.imageSmoothingEnabled = false
    const base = document.createElement("canvas")
    base.width = W
    base.height = H
    const baseCtx = base.getContext("2d")
    if (!baseCtx) return
    const { stations, ambientScreens, windows, clocks } = staticWorld(baseCtx)
    let tick = 0
    let timer = 0
    const paint = () => {
      const current = latest.current
      const states: Record<string, WorkState> = {
        ceo: current.ceoState, market_researcher: current.researcherState,
        product_planner: current.plannerState, visual_designer: current.designerState,
      }
      if (current.workingSpecialistId) states[current.workingSpecialistId] = "working"
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(base, 0, 0)
      const time = new Date()
      for (const window of windows) art.drawWindowView(ctx, window.rect, time.getHours(), tick, window.seed)
      for (const clock of clocks) art.drawClock(ctx, clock, time)
      for (const screen of ambientScreens) art.drawScreen(ctx, screen.rect, screen.mode, tick, screen.seed)
      for (const agent of current.roster) {
        const station = stations.get(agent.id)
        if (station?.screen) art.drawScreen(ctx, station.screen, states[agent.id] === "working" ? station.mode : "standby", tick, agent.id.length * 31)
      }
      for (const agent of current.roster) {
        const station = stations.get(agent.id)
        if (station) drawAgent(ctx, agent, agent.id === "ceo" ? current.ceoName : captions[agent.id] || agent.name, station, states[agent.id] || "idle", tick)
      }
      tick++
      timer = window.setTimeout(paint, 120)
    }
    paint()
    return () => window.clearTimeout(timer)
  }, [])

  function select(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * W / rect.width
    const y = (event.clientY - rect.top) * H / rect.height
    if (x < BX || x >= BX + COL * 5) return
    const col = Math.floor((x - BX) / COL)
    const row = Y.findIndex((top) => y >= top && y < top + ROW)
    if (row < 0) return
    if (row === 2) { props.onFocus(col === 0 ? "ceo" : col === 1 ? "board" : "lounge"); return }
    const department = rooms[row * 5 + col].name
    if (department === "Dirección") props.onFocus("ceo")
    else if (department === "Producto") props.onFocus("product")
    else if (department === "Creativo") props.onFocus("creative")
    else if (department === "Mercado") props.onFocus("research")
    else props.onDepartment(department)
  }

  return <canvas ref={ref} width={W} height={H} onClick={select} role="img" aria-label="Oficina con diez departamentos, puestos asignados y áreas comunes independientes" style={{ width: "100%", height: "auto", display: "block", imageRendering: "pixelated", cursor: "pointer" }} />
}
