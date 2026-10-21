"use client"

import { useEffect, useRef } from "react"
import * as art from "@/vendor/habblaud/client/src/art"
import { propSprite } from "@/vendor/habblaud/client/src/world/render/props"
export type OfficeFocus = "ceo" | "research" | "product" | "creative" | "board" | "lounge"
export type WorkState = "idle" | "working" | "attention"

type Props = {
  ceoName: string
  researcherName: string
  plannerName: string
  designerName: string
  ceoState: WorkState
  researcherState: WorkState
  plannerState: WorkState
  designerState: WorkState
  roster: Array<{ id: string; name: string; department: string; status: "active" | "planned" | "blocked" }>
  onDepartment: (department: string) => void
  onFocus: (focus: OfficeFocus) => void
}

type Ctx = CanvasRenderingContext2D
const W = 1552
const H = 656
const BX = 136
const BY = 126
const COL = 256
const ROW = 192
const SOUTH = BY + ROW + 80

function fill(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function place(ctx: Ctx, kind: art.FurnitureKind, x: number, y: number, variant?: string, seed = 0) {
  const sprite = art.furnitureSprites(kind, variant, 0, { seed }).base
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - sprite.ay))
  return { sprite, left: Math.round(x - sprite.ax), top: Math.round(y - sprite.ay) }
}

function tileFurniture(ctx: Ctx, kind: art.FurnitureKind, roomX: number, roomY: number, tx: number, ty: number, variant?: string, seed = 0) {
  const footprint = art.FURNITURE[kind].footprint
  return place(ctx, kind, roomX + tx * 16 + footprint.w * 8, roomY + (ty + footprint.h) * 16, variant, seed)
}

function wallFurniture(ctx: Ctx, kind: art.FurnitureKind, roomX: number, roomY: number, centerTile: number, variant?: string) {
  return place(ctx, kind, roomX + centerTile * 16, roomY + 32, variant)
}

function exterior(ctx: Ctx) {
  art.drawFloor(ctx, "grass", 0, 0, W, H, { seed: 17 })
  art.drawFloor(ctx, "sidewalk", 0, 596, W, 28, { seed: 18 })
  art.drawFloor(ctx, "street", 0, 624, W, 32, { seed: 19 })
  fill(ctx, 0, 624, W, 2, "#786f62")
  for (let x = 20; x < W; x += 76) fill(ctx, x, 641, 31, 2, "#e8d6a5")
  art.drawFloor(ctx, "sidewalk", 96, 330, 40, 266, { seed: 21 })
  const trees: Array<["tree" | "pine" | "bush" | "flowers", number, number, number]> = [
    ["tree", 35, 85, 1], ["pine", 97, 59, 2], ["tree", 231, 64, 3], ["pine", 372, 68, 4],
    ["tree", 529, 66, 5], ["pine", 669, 62, 6], ["tree", 841, 67, 7], ["pine", 995, 72, 8],
    ["tree", 48, 192, 9], ["tree", 45, 344, 10], ["pine", 51, 522, 11],
    ["tree", 1495, 209, 12], ["pine", 1509, 351, 13], ["tree", 1490, 518, 14],
    ["bush", 128, 95, 15], ["bush", 1435, 108, 16], ["flowers", 1490, 559, 17],
  ]
  for (const [kind, x, y, seed] of trees) {
    const sprite = propSprite({ kind, x, y, seed })
    ctx.drawImage(sprite.canvas, x - sprite.ax, y - sprite.ay)
  }
  for (let x = BX + 8; x < BX + COL * 5 - 12; x += 19) {
    const sprite = propSprite({ kind: "hedge", x, y: 586, seed: x })
    ctx.drawImage(sprite.canvas, x - sprite.ax, 586 - sprite.ay)
  }
}

function room(ctx: Ctx, x: number, y: number, floor: art.FloorKind, seed: number, wall: art.WallStyle) {
  art.drawFloor(ctx, floor, x, y, COL, ROW, { seed })
  art.drawWallFace(ctx, x, y, COL, wall)
  art.drawWallTop(ctx, x, y, 6, ROW, wall)
  art.drawWallTop(ctx, x + COL - 6, y, 6, ROW, wall)
  art.drawSouthWall(ctx, x, y + ROW - 16, COL, wall)
}

function sign(ctx: Ctx, value: string, centerX: number, y: number) {
  const width = Math.max(76, value.length * 6 + 16)
  fill(ctx, centerX - width / 2 - 2, y - 13, width + 4, 17, "#273940")
  fill(ctx, centerX - width / 2, y - 11, width, 13, "#405760")
  ctx.font = "bold 9px Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillStyle = "#f8f4e9"
  ctx.fillText(value, centerX, y - 2)
  ctx.textAlign = "start"
}

function staticWorld(ctx: Ctx) {
  ctx.imageSmoothingEnabled = false
  exterior(ctx)
  const reception = { base: "#e9e5dc", trim: "#a88e6c", pattern: "wood_panel" } as const
  const cafe = { base: "#eef0ee", trim: "#9aa6ad", pattern: "plain" } as const
  const office = { base: "#e5e9e6", trim: "#8da9ad", pattern: "plain" } as const
  const restroom = { base: "#dce8ee", trim: "#8fb0c0", pattern: "tiles" } as const
  const lounge = { base: "#e6e2ea", trim: "#8f8aa3", pattern: "plain" } as const
  const research = { base: "#dce6e9", trim: "#87a8b2", pattern: "plain" } as const
  const wallOuter = { base: "#cfc8bd", trim: "#8a8174", pattern: "brick", exterior: true } as const
  fill(ctx, BX - 5, BY - 5, COL * 5 + 10, ROW * 2 + 90, "#3b4a4c")
  room(ctx, BX, BY, "marble", 101, reception)
  room(ctx, BX + COL, BY, "tile_check", 301, cafe)
  room(ctx, BX + COL * 2, BY, "carpet", 701, office)
  room(ctx, BX, SOUTH, "tile_white", 201, restroom)
  room(ctx, BX + COL, SOUTH, "wood", 401, lounge)
  room(ctx, BX + COL * 2, SOUTH, "carpet", 801, research)
  room(ctx, BX + COL * 3, BY, "tile_check", 901, research)
  room(ctx, BX + COL * 4, BY, "concrete", 902, office)
  room(ctx, BX + COL * 3, SOUTH, "wood", 903, reception)
  room(ctx, BX + COL * 4, SOUTH, "carpet", 904, cafe)
  art.drawFloor(ctx, "concrete", BX, BY + ROW, COL * 5, 80, { seed: 501 })
  art.drawWallTop(ctx, BX, BY + ROW, COL * 5, 4, wallOuter)
  art.drawWallTop(ctx, BX, SOUTH - 4, COL * 5, 4, wallOuter)
  for (let x = BX + 18; x < BX + COL * 5 - 18; x += 105) fill(ctx, x, BY + ROW + 34, 64, 5, "#97abb4")

  // Reception and break areas use Habblaud's original furniture sprites.
  wallFurniture(ctx, "elevator", BX, BY, 3)
  wallFurniture(ctx, "elevator", BX, BY, 6)
  wallFurniture(ctx, "clock", BX, BY, 9)
  wallFurniture(ctx, "painting", BX, BY, 13)
  art.drawRug(ctx, BX + 32, BY + 74, 93, 42, "#6c8ea9", 22)
  tileFurniture(ctx, "reception_desk", BX, BY, 9, 6)
  tileFurniture(ctx, "bench", BX, BY, 2, 9)
  tileFurniture(ctx, "water_cooler", BX, BY, 1, 7)
  tileFurniture(ctx, "plant_tall", BX, BY, 14, 8, "ficus")

  wallFurniture(ctx, "window", BX + COL, BY, 3)
  wallFurniture(ctx, "window", BX + COL, BY, 12)
  wallFurniture(ctx, "poster", BX + COL, BY, 8, "coffee")
  for (let x = 1; x <= 5; x++) tileFurniture(ctx, "counter", BX + COL, BY, x, 3)
  tileFurniture(ctx, "counter_sink", BX + COL, BY, 3, 3)
  tileFurniture(ctx, "coffee_machine", BX + COL, BY, 5, 3)
  tileFurniture(ctx, "fridge", BX + COL, BY, 13, 3)
  for (const [x, y] of [[5, 7], [10, 7]] as const) {
    tileFurniture(ctx, "cafe_table", BX + COL, BY, x, y)
    tileFurniture(ctx, "cafe_chair", BX + COL, BY, x - 1, y, "right")
    tileFurniture(ctx, "cafe_chair", BX + COL, BY, x + 1, y, "left")
  }
  tileFurniture(ctx, "plant_small", BX + COL, BY, 14, 9, "flower")

  wallFurniture(ctx, "window", BX + COL * 2, BY, 3)
  wallFurniture(ctx, "whiteboard", BX + COL * 2, BY, 8)
  wallFurniture(ctx, "painting", BX + COL * 2, BY, 13)
  art.drawRug(ctx, BX + COL * 2 + 62, BY + 80, 123, 74, "#7ca398", 54)
  tileFurniture(ctx, "bookshelf", BX + COL * 2, BY, 13, 3, undefined, 3)
  tileFurniture(ctx, "desk", BX + COL * 2, BY, 10, 6, "wood", 3)
  tileFurniture(ctx, "office_chair", BX + COL * 2, BY, 11, 8, "blue")
  tileFurniture(ctx, "plant_tall", BX + COL * 2, BY, 1, 9, "monstera")
  tileFurniture(ctx, "filing_cabinet", BX + COL * 2, BY, 14, 9)

  wallFurniture(ctx, "whiteboard", BX, SOUTH, 8)
  tileFurniture(ctx, "desk", BX, SOUTH, 8, 6, "white")
  tileFurniture(ctx, "office_chair", BX, SOUTH, 8, 8, "blue")
  tileFurniture(ctx, "filing_cabinet", BX, SOUTH, 13, 4)
  tileFurniture(ctx, "plant_small", BX, SOUTH, 1, 9, "fern")

  wallFurniture(ctx, "painting", BX + COL, SOUTH, 5)
  wallFurniture(ctx, "tv", BX + COL, SOUTH, 11)
  art.drawRug(ctx, BX + COL + 42, SOUTH + 87, 164, 69, "#6e9479", 43)
  tileFurniture(ctx, "sofa", BX + COL, SOUTH, 3, 7, "down")
  tileFurniture(ctx, "coffee_table", BX + COL, SOUTH, 6, 8)
  tileFurniture(ctx, "sofa", BX + COL, SOUTH, 10, 7, "down")
  tileFurniture(ctx, "beanbag", BX + COL, SOUTH, 6, 10, "red")
  tileFurniture(ctx, "plant_tall", BX + COL, SOUTH, 1, 9, "bonsai")
  tileFurniture(ctx, "bookshelf", BX + COL, SOUTH, 13, 3, undefined, 1)

  wallFurniture(ctx, "window", BX + COL * 2, SOUTH, 3)
  wallFurniture(ctx, "whiteboard", BX + COL * 2, SOUTH, 8)
  wallFurniture(ctx, "clock", BX + COL * 2, SOUTH, 14)
  art.drawRug(ctx, BX + COL * 2 + 46, SOUTH + 87, 161, 71, "#829fb7", 79)
  tileFurniture(ctx, "binder_shelf", BX + COL * 2, SOUTH, 14, 3, undefined, 4)
  tileFurniture(ctx, "desk", BX + COL * 2, SOUTH, 10, 6, "white", 1)
  tileFurniture(ctx, "office_chair", BX + COL * 2, SOUTH, 11, 8, "red")
  tileFurniture(ctx, "meeting_table", BX + COL * 2, SOUTH, 2, 7)
  tileFurniture(ctx, "plant_tall", BX + COL * 2, SOUTH, 1, 9, "palm")

  for (const [col, row] of [[3, 0], [4, 0], [3, 1], [4, 1]] as const) {
    const x = BX + COL * col
    const y = row ? SOUTH : BY
    wallFurniture(ctx, "whiteboard", x, y, 8)
    tileFurniture(ctx, "desk", x, y, 8, 6, "wood")
    tileFurniture(ctx, "office_chair", x, y, 9, 8, "blue")
    tileFurniture(ctx, "bookshelf", x, y, 14, 3)
    tileFurniture(ctx, "plant_small", x, y, 2, 9, "fern")
  }

  sign(ctx, "PRODUCTO", BX + COL / 2, BY - 7)
  sign(ctx, "CREATIVO", BX + COL * 1.5, BY - 7)
  sign(ctx, "DIRECCION", BX + COL * 2.5, BY - 7)
  sign(ctx, "MERCADO", BX + COL * 3.5, BY - 7)
  sign(ctx, "PRODUCCION", BX + COL * 4.5, BY - 7)
  sign(ctx, "CALIDAD", BX + COL / 2, SOUTH - 7)
  sign(ctx, "MARKETING", BX + COL * 1.5, SOUTH - 7)
  sign(ctx, "COMERCIAL", BX + COL * 2.5, SOUTH - 7)
  sign(ctx, "FINANZAS", BX + COL * 3.5, SOUTH - 7)
  sign(ctx, "SISTEMAS", BX + COL * 4.5, SOUTH - 7)
}

const ceoAppearance = art.appearanceFromSeed(501, { look: "m", parts: { hairStyle: "side_part", topStyle: "shirt_tie", top: "#4c7890" } })
const researcherAppearance = art.appearanceFromSeed(903, { look: "f", parts: { hairStyle: "bob", topStyle: "jacket", top: "#bc7358" } })
const plannerAppearance = art.appearanceFromSeed(737, { look: "m", parts: { hairStyle: "short", topStyle: "jacket", top: "#71877a" } })
const designerAppearance = art.appearanceFromSeed(824, { look: "f", parts: { hairStyle: "long", topStyle: "blouse", top: "#b37857" } })

function drawAgent(ctx: Ctx, name: string, x: number, y: number, state: WorkState, appearance: art.Appearance, tick: number, status: "active" | "planned" | "blocked" = "active") {
  const pose: art.Pose = state === "attention" ? "raise_hand" : state === "working" ? "type" : "stand"
  const sprite = art.characterSprite({ appearance, dir: state === "working" ? "up" : "down", pose, frame: Math.floor(tick / 5) })
  ctx.globalAlpha = status === "active" ? 1 : .62
  ctx.drawImage(sprite.canvas, Math.round(x - sprite.ax), Math.round(y - sprite.ay))
  ctx.globalAlpha = 1
  if (state !== "idle") {
    const icon = art.iconSprite(state === "attention" ? "alert" : "idea")
    ctx.drawImage(icon.canvas, Math.round(x - icon.ax), Math.round(y - 39 - icon.ay - tick % 2))
  }
  const width = Math.max(62, Math.min(146, name.length * 6 + 25))
  fill(ctx, Math.round(x - width / 2 - 1), y + 4, width + 2, 18, "#17292c")
  fill(ctx, Math.round(x - width / 2), y + 5, width, 16, "#354d50")
  fill(ctx, Math.round(x - width / 2 + 5), y + 11, 6, 6, status === "blocked" ? "#dc7466" : status === "planned" ? "#9da9a3" : state === "working" ? "#e8ad68" : state === "attention" ? "#e17566" : "#61bf8d")
  ctx.fillStyle = "#f5f2e5"
  ctx.font = "bold 10px Arial, sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(name.slice(0, 18), x + 5, y + 17)
  ctx.textAlign = "start"
}

export default function HabblaudWorld(props: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
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
    staticWorld(baseCtx)
    let tick = 0
    let timer = 0
    const paint = () => {
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(base, 0, 0)
      const ceoX = props.ceoState === "idle" ? BX + COL * 2 + 126 + Math.round(Math.sin(tick / 15) * 4) : BX + COL * 2 + 182
      const researchX = props.researcherState === "idle" ? BX + COL * 3 + 130 + Math.round(Math.sin(tick / 17) * 4) : BX + COL * 3 + 181
      drawAgent(ctx, props.ceoName, ceoX, BY + 139, props.ceoState, ceoAppearance, tick)
      drawAgent(ctx, props.researcherName, researchX, BY + 139, props.researcherState, researcherAppearance, tick)
      drawAgent(ctx, props.plannerName, BX + 130, BY + 139, props.plannerState, plannerAppearance, tick)
      drawAgent(ctx, props.designerName, BX + COL + 130, BY + 139, props.designerState, designerAppearance, tick)
      const positions: Record<string, [number, number, string]> = {
        market_lead: [3, 0, "Mercado"], product_lead: [0, 0, "Producto"], creative_lead: [1, 0, "Creativo"],
        creation_operator: [1, 0, "Creacion"], production_lead: [4, 0, "Produccion"],
        commerce_lead: [2, 1, "Comercial"], seo_specialist: [2, 1, "SEO"],
        marketing_lead: [1, 1, "Marketing"], pinterest_specialist: [1, 1, "Pinterest"],
        quality_lead: [0, 1, "Calidad"], finance_lead: [3, 1, "Finanzas"], systems_lead: [4, 1, "Sistemas"],
      }
      const counts: Record<string, number> = {}
      for (const agent of props.roster) {
        const position = positions[agent.id]
        if (!position) continue
        const [col, row, label] = position
        const roomKey = `${col}:${row}`
        const index = counts[roomKey] || 0
        counts[roomKey] = index + 1
        const x = BX + COL * col + (index === 0 ? 67 : index === 1 ? 195 : 128)
        const activeRoom = !row && [0, 1, 3].includes(col)
        const y = (row ? SOUTH : BY) + (activeRoom || index === 2 ? 90 : 139)
        drawAgent(ctx, label, x, y, "idle", art.appearanceFromSeed(1100 + props.roster.indexOf(agent) * 41), tick, agent.status)
      }
      tick++
      timer = window.setTimeout(paint, 110)
    }
    paint()
    return () => window.clearTimeout(timer)
  }, [props])

  function select(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) * W / rect.width
    const y = (event.clientY - rect.top) * H / rect.height
    if (x >= BX && x < BX + COL * 5 && (y < BY + ROW || y > SOUTH)) {
      const col = Math.floor((x - BX) / COL)
      const row = y > SOUTH ? 1 : 0
      const department = [["Producto", "Creativo", "Dirección", "Mercado", "Producción"], ["Calidad", "Marketing", "Comercial", "Finanzas", "Sistemas"]][row][col]
      if (department === "Dirección") props.onFocus("ceo")
      else if (department === "Producto") props.onFocus("product")
      else if (department === "Creativo") props.onFocus("creative")
      else if (department === "Mercado") props.onFocus("research")
      else props.onDepartment(department)
    } else if (x < BX + COL && y < BY + ROW) props.onFocus("product")
    else if (x < BX + COL * 2 && y < BY + ROW) props.onFocus("creative")
    else if (x > BX + COL * 2 && y > SOUTH) props.onFocus("research")
    else if (x > BX + COL * 2 && y < BY + ROW) props.onFocus("ceo")
    else if (x > BX + COL * 2) props.onFocus("board")
    else props.onFocus("lounge")
  }

  return <canvas ref={ref} width={W} height={H} onClick={select} role="img" aria-label="Oficina de Autolisty Company con salas, personajes y actividad real" style={{ width: "100%", height: "auto", display: "block", imageRendering: "pixelated", cursor: "pointer" }} />
}
