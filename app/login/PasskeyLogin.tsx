"use client"

import { useState } from "react"
import { Fingerprint, KeyRound, Loader2 } from "lucide-react"
import { guessDeviceName, passkeysSupported, registerPasskey, signInWithPasskey } from "@/lib/auth/webauthnClient"

function safeCallback(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"
}

export function PasskeyLogin({ callbackUrl }: { callbackUrl?: string }) {
  const [busy, setBusy] = useState<"login" | "setup" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [setupCode, setSetupCode] = useState("")

  async function run(kind: "login" | "setup") {
    setError(null)
    if (!passkeysSupported()) {
      setError("This browser does not support passkeys. Use Safari on iPhone or Chrome/Edge on your PC.")
      return
    }
    setBusy(kind)
    try {
      if (kind === "login") await signInWithPasskey()
      else await registerPasskey({ setupCode: setupCode.trim(), name: guessDeviceName() })
      window.location.assign(safeCallback(callbackUrl))
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong."
      setError(/NotAllowedError|canceled|cancelled|timed out/i.test(message) ? "The request was canceled or timed out." : message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={() => void run("login")}
        disabled={busy !== null}
        className="inline-flex h-12 w-full items-center justify-center gap-3 border border-[#eeba2b]/30 bg-[#eeba2b] px-5 text-sm font-semibold text-neutral-950 transition hover:bg-[#f1cc61] disabled:opacity-60"
      >
        {busy === "login" ? <Loader2 size={19} className="animate-spin" /> : <Fingerprint size={19} />}
        Sign in with passkey
      </button>

      {error ? <div className="border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      {showSetup ? (
        <div className="space-y-3 border border-neutral-800 p-4">
          <p className="text-xs leading-5 text-neutral-400">
            First time on this device? Enter your setup code to create a passkey (Face ID, fingerprint or PIN).
          </p>
          <input
            type="password"
            autoComplete="off"
            value={setupCode}
            onChange={(event) => setSetupCode(event.target.value)}
            placeholder="Setup code"
            className="h-11 w-full border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none focus:border-[#eeba2b]/50"
          />
          <button
            type="button"
            onClick={() => void run("setup")}
            disabled={busy !== null || !setupCode.trim()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 border border-neutral-700 text-sm font-semibold text-neutral-100 transition hover:border-[#eeba2b]/40 disabled:opacity-50"
          >
            {busy === "setup" ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
            Create passkey on this device
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowSetup(true)}
          className="w-full text-center text-xs text-neutral-500 underline-offset-4 hover:text-neutral-300 hover:underline"
        >
          Set up this device with a setup code
        </button>
      )}
    </div>
  )
}
