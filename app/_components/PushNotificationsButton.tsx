"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, Loader2 } from "lucide-react"

type State = "loading" | "unsupported" | "needs-install" | "off" | "on" | "denied"

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
}

// Activa las notificaciones de este dispositivo (en iPhone, desde la app instalada).
export function PushNotificationsButton() {
  const [state, setState] = useState<State>("loading")
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "needs-install" : "unsupported")
        return
      }
      if (Notification.permission === "denied") return setState("denied")
      const registration = await navigator.serviceWorker.register("/sw.js")
      const subscription = await registration.pushManager.getSubscription()
      setState(subscription ? "on" : "off")
    })().catch(() => setState("unsupported"))
  }, [])

  async function enable() {
    setBusy(true)
    setNote(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off")
        return
      }
      const keyResponse = await fetch("/api/notifications/push")
      const { publicKey } = (await keyResponse.json()) as { publicKey: string }
      const registration = await navigator.serviceWorker.register("/sw.js")
      await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const response = await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
      if (!response.ok) throw new Error((await response.json()).error || "Could not enable notifications.")
      await fetch("/api/notifications/test", { method: "POST" })
      setState("on")
      setNote("Enabled. A test notification is on its way.")
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Could not enable notifications.")
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js")
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setState("off")
      setNote(null)
    } finally {
      setBusy(false)
    }
  }

  const label: Record<State, string> = {
    loading: "Notifications",
    unsupported: "Notifications not supported here",
    "needs-install": "Open the installed app to enable notifications",
    off: "Enable notifications",
    on: "Notifications on",
    denied: "Notifications blocked in settings",
  }

  const actionable = state === "off" || state === "on"
  return (
    <div className="flex flex-col">
      <button
        type="button"
        disabled={!actionable || busy}
        onClick={() => void (state === "on" ? disable() : enable())}
        title={state === "on" ? "Turn off notifications on this device" : undefined}
        className={`inline-flex h-11 items-center gap-2 border px-4 text-sm font-semibold transition disabled:opacity-60 ${
          state === "on"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15"
            : "border-neutral-800 bg-neutral-950 text-neutral-300 hover:border-[#eeba2b]/35 hover:text-[#f1cc61]"
        }`}
      >
        {busy || state === "loading" ? <Loader2 size={16} className="animate-spin" /> : state === "on" ? <Bell size={16} /> : <BellOff size={16} />}
        {label[state]}
      </button>
      {note ? <span className="mt-1 text-xs text-neutral-400">{note}</span> : null}
    </div>
  )
}
