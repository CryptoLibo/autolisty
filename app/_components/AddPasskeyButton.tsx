"use client"

import { useState } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { guessDeviceName, passkeysSupported, registerPasskey } from "@/lib/auth/webauthnClient"

// Registra un passkey adicional (otro dispositivo o navegador) con la sesión ya iniciada.
export function AddPasskeyButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle")
  const [message, setMessage] = useState<string | null>(null)

  async function add() {
    if (!passkeysSupported()) {
      setState("error")
      setMessage("This browser does not support passkeys.")
      return
    }
    setState("busy")
    setMessage(null)
    try {
      await registerPasskey({ name: guessDeviceName() })
      setState("done")
      setMessage("Passkey added for this device.")
    } catch (caught) {
      setState("error")
      const text = caught instanceof Error ? caught.message : "Could not add the passkey."
      setMessage(/NotAllowedError|InvalidStateError/i.test(text) ? "Canceled, or this device already has a passkey." : text)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void add()}
        disabled={state === "busy"}
        className="flex w-full items-center gap-3 border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-300 transition hover:border-[#eeba2b]/35 hover:text-[#f1cc61] disabled:opacity-50"
      >
        {state === "busy" ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
        Add passkey on this device
      </button>
      {message ? (
        <p className={`px-1 text-xs ${state === "error" ? "text-red-300" : "text-emerald-300"}`}>{message}</p>
      ) : null}
    </div>
  )
}
