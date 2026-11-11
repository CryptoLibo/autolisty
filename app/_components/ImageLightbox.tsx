"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Minus, Plus, X } from "lucide-react"

// Visor a pantalla completa para revisar detalles de un diseño.
// Móvil: pellizcar para ampliar, arrastrar para mover, doble toque para 1x / 3x.
// Escritorio: rueda o botones +/-, arrastrar con el ratón, doble clic, Esc para cerrar.

type Props = {
  src: string
  alt: string
  caption?: string
  onClose: () => void
}

const MIN_SCALE = 1
const MAX_SCALE = 8
const DOUBLE_TAP_SCALE = 3

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function ImageLightbox({ src, alt, caption, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [loaded, setLoaded] = useState(false)
  const [gesturing, setGesturing] = useState(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance: number; scale: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const lastTap = useRef(0)

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setScale((current) => {
      const next = clamp(current * factor, MIN_SCALE, MAX_SCALE)
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "+" || event.key === "=") zoomBy(1.5)
      if (event.key === "-") zoomBy(1 / 1.5)
      if (event.key === "0") reset()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose, reset, zoomBy])

  function onPointerDown(event: React.PointerEvent) {
    ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setGesturing(true)
    const points = [...pointers.current.values()]
    if (points.length === 2) {
      const [a, b] = points
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        ox: offset.x,
        oy: offset.y,
      }
    } else if (points.length === 1) {
      gesture.current = { distance: 0, scale, x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
      const now = Date.now()
      if (now - lastTap.current < 300) {
        if (scale > 1) reset()
        else setScale(DOUBLE_TAP_SCALE)
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const points = [...pointers.current.values()]
    const start = gesture.current
    if (points.length >= 2 && start.distance > 0) {
      const [a, b] = points
      const nextScale = clamp((start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / start.distance, MIN_SCALE, MAX_SCALE)
      setScale(nextScale)
      setOffset({ x: start.ox + ((a.x + b.x) / 2 - start.x), y: start.oy + ((a.y + b.y) / 2 - start.y) })
    } else if (points.length === 1 && scale > 1) {
      setOffset({ x: start.ox + (event.clientX - start.x), y: start.oy + (event.clientY - start.y) })
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    pointers.current.delete(event.pointerId)
    const remaining = [...pointers.current.values()]
    gesture.current = remaining.length === 1
      ? { distance: 0, scale, x: remaining[0].x, y: remaining[0].y, ox: offset.x, oy: offset.y }
      : null
    if (remaining.length === 0) setGesturing(false)
    if (scale <= 1.02) reset()
  }

  function onWheel(event: React.WheelEvent) {
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-neutral-300">
        <span className="truncate">{caption || alt}</span>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Alejar" onClick={() => zoomBy(1 / 1.5)} className="flex h-10 w-10 items-center justify-center border border-neutral-700 text-neutral-200">
            <Minus size={18} />
          </button>
          <button type="button" aria-label="Restablecer zoom" onClick={reset} className="h-10 min-w-14 border border-neutral-700 px-2 text-xs text-neutral-200">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" aria-label="Acercar" onClick={() => zoomBy(1.5)} className="flex h-10 w-10 items-center justify-center border border-neutral-700 text-neutral-200">
            <Plus size={18} />
          </button>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="flex h-10 w-10 items-center justify-center bg-neutral-800 text-neutral-100">
            <X size={18} />
          </button>
        </div>
      </div>
      <div
        className="relative flex-1 overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {!loaded ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">Cargando…</div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 m-auto h-full w-full select-none object-contain"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: gesturing ? "none" : "transform 120ms ease-out",
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>
      <div className="px-4 pb-3 text-center text-xs text-neutral-500">
        Pinch or double-tap to zoom · drag to move
      </div>
    </div>,
    document.body
  )
}
