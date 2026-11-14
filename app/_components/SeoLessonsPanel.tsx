"use client"

import { Check, Loader2, Power, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { PRODUCT_OPTIONS } from "@/lib/products"

type Lesson = {
  id: number
  productType: string | null
  lesson: string
  reason: string | null
  sourceProductCode: string | null
  status: "PROPOSED" | "ACTIVE" | "DISABLED" | "REJECTED"
  createdAt: string
}

const STATUS_LABEL: Record<Lesson["status"], string> = {
  PROPOSED: "Propuesta",
  ACTIVE: "Activa",
  DISABLED: "Desactivada",
  REJECTED: "Rechazada",
}

function productLabel(productType: string | null) {
  if (!productType) return "Todos los productos"
  return PRODUCT_OPTIONS.find((product) => product.value === productType)?.label || productType
}

/**
 * Lecciones del SEO: Claude las propone tras revisar listings; solo las ACTIVAS
 * entran en el prompt del SEO. Aquí se activan, desactivan o rechazan.
 */
export default function SeoLessonsPanel() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/automation/lessons", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar las lecciones.")
      setLessons(data.lessons || [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar las lecciones.")
    }
  }, [])

  useEffect(() => {
    // Primera carga fuera del render del efecto (evita renders en cascada).
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function setStatus(id: number, status: Lesson["status"]) {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch("/api/automation/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la lección.")
      setLessons((current) => (current || []).map((lesson) => (lesson.id === id ? data.lesson : lesson)))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo actualizar la lección.")
    } finally {
      setBusyId(null)
    }
  }

  const visible = (lessons || []).filter((lesson) =>
    showArchived ? true : lesson.status === "PROPOSED" || lesson.status === "ACTIVE")
  const proposed = (lessons || []).filter((lesson) => lesson.status === "PROPOSED").length
  const active = (lessons || []).filter((lesson) => lesson.status === "ACTIVE").length

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Lecciones del SEO</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {active} activas · {proposed} por revisar. Solo las activas se aplican al generar listings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowArchived((value) => !value)}
          className="text-xs text-neutral-400 underline-offset-4 hover:text-[#f1cc61] hover:underline"
        >
          {showArchived ? "Ocultar desactivadas y rechazadas" : "Ver todas"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

      {lessons === null ? (
        <Loader2 size={18} className="mt-4 animate-spin text-neutral-500" />
      ) : visible.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-500">No hay lecciones todavía. Claude las propone al revisar listings.</p>
      ) : (
        <ul className="mt-4 divide-y divide-neutral-800 border-y border-neutral-800">
          {visible.map((lesson) => (
            <li key={lesson.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={
                      lesson.status === "ACTIVE"
                        ? "bg-emerald-500/15 px-2 py-0.5 text-emerald-300"
                        : lesson.status === "PROPOSED"
                          ? "bg-[#eeba2b]/15 px-2 py-0.5 text-[#f1cc61]"
                          : "bg-neutral-800 px-2 py-0.5 text-neutral-400"
                    }
                  >
                    {STATUS_LABEL[lesson.status]}
                  </span>
                  <span className="text-neutral-500">{productLabel(lesson.productType)}</span>
                  {lesson.sourceProductCode ? <span className="text-neutral-600">{lesson.sourceProductCode}</span> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-neutral-100">{lesson.lesson}</p>
                {lesson.reason ? <p className="mt-1 text-xs leading-5 text-neutral-500">{lesson.reason}</p> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                {lesson.status !== "ACTIVE" ? (
                  <button
                    type="button"
                    disabled={busyId === lesson.id}
                    onClick={() => void setStatus(lesson.id, "ACTIVE")}
                    className="inline-flex h-9 items-center gap-1.5 bg-[#eeba2b] px-3 text-xs font-semibold text-neutral-950 disabled:opacity-40"
                  >
                    <Check size={14} /> Activar
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === lesson.id}
                    onClick={() => void setStatus(lesson.id, "DISABLED")}
                    className="inline-flex h-9 items-center gap-1.5 border border-neutral-700 px-3 text-xs text-neutral-200 disabled:opacity-40"
                  >
                    <Power size={14} /> Desactivar
                  </button>
                )}
                {lesson.status === "PROPOSED" ? (
                  <button
                    type="button"
                    disabled={busyId === lesson.id}
                    onClick={() => void setStatus(lesson.id, "REJECTED")}
                    className="inline-flex h-9 items-center gap-1.5 border border-neutral-700 px-3 text-xs text-neutral-300 disabled:opacity-40"
                  >
                    <X size={14} /> Rechazar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
