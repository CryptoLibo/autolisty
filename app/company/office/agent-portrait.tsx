"use client"

import { useEffect, useRef } from "react"
import { avatarCanvas } from "@/vendor/habblaud/client/src/art"

const ids = [
  "product_lead", "product_planner", "creative_lead", "visual_designer", "creation_operator",
  "ceo", "market_lead", "market_researcher", "production_lead", "quality_lead",
  "marketing_lead", "pinterest_specialist", "commerce_lead", "seo_specialist",
  "finance_lead", "systems_lead",
]

export default function AgentPortrait({ id, size = 36 }: { id: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = ref.current
    const context = target?.getContext("2d")
    if (!target || !context) return
    const index = Math.max(0, ids.indexOf(id))
    const portrait = avatarCanvas(501 + index * 71, id === "ceo" ? { look: "m", parts: { hairStyle: "side_part", topStyle: "shirt_tie", top: "#4c7890" } } : {})
    target.width = portrait.width
    target.height = portrait.height
    context.imageSmoothingEnabled = false
    context.drawImage(portrait, 0, 0)
  }, [id])
  return <canvas ref={ref} role="img" aria-label="" className="company-agent-portrait" style={{ width: size, height: size, imageRendering: "pixelated" }} />
}
