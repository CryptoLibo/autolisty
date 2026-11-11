"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, X } from "lucide-react"

// Piezas comunes de la app (U5, U9): diálogo propio y aviso flotante.

export const buttonPrimary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#eeba2b] px-4 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:cursor-not-allowed disabled:opacity-40"
export const buttonSecondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/12 px-4 text-sm text-neutral-200 transition hover:border-[#eeba2b]/40 hover:text-[#f1cc61] disabled:cursor-not-allowed disabled:opacity-40"
export const buttonDanger =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 text-sm text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-40"
export const card = "rounded-xl border border-white/[0.08] bg-[#141416]"

type ConfirmRequest = {
  title: string
  body?: string
  confirmLabel: string
  danger?: boolean
  resolve: (value: boolean) => void
}

/** Sustituye a window.confirm: `if (!(await confirm({...}))) return`. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  const confirm = useCallback(
    (options: Omit<ConfirmRequest, "resolve">) =>
      new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    []
  )

  const close = (value: boolean) => {
    request?.resolve(value)
    setRequest(null)
  }

  const dialog = request ? <ConfirmDialog request={request} onClose={close} /> : null
  return { confirm, dialog }
}

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: (value: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <button type="button" aria-label="Cancelar" className="absolute inset-0 bg-black/65" onClick={() => onClose(false)} />
      <div className={`relative w-full max-w-md p-5 shadow-2xl ${card}`}>
        <h2 id="confirm-title" className="text-[17px] font-semibold text-neutral-100">{request.title}</h2>
        {request.body ? <p className="mt-2 whitespace-pre-line text-sm leading-6 text-neutral-300">{request.body}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => onClose(false)} className={buttonSecondary}>Cancelar</button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={request.danger ? buttonDanger : buttonPrimary}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Aviso flotante: no desplaza la página; los de éxito se cierran solos. */
export function Toast({ message, tone, onClose }: { message: string | null; tone: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    if (!message || tone === "error") return
    const timer = window.setTimeout(onClose, 6000)
    return () => window.clearTimeout(timer)
  }, [message, tone, onClose])

  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-6">
      <div
        role={tone === "error" ? "alert" : "status"}
        className={`pointer-events-auto flex max-w-xl items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
          tone === "error" ? "border-red-500/30 bg-[#2a1416] text-red-100" : "border-white/10 bg-[#17171a] text-neutral-100"
        }`}
      >
        {tone === "error"
          ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-300" aria-hidden="true" />
          : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />}
        <span className="min-w-0 flex-1 leading-6">{message}</span>
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center text-neutral-400 hover:text-neutral-100">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** Estado vacío con una acción sugerida. */
export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/12 px-6 py-14 text-center">
      <div className="text-[15px] font-semibold text-neutral-200">{title}</div>
      {detail ? <div className="text-sm text-neutral-400">{detail}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
