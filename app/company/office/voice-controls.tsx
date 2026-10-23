"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Mic, MicOff, Square } from "lucide-react"
import styles from "./workspace.module.css"

type Snapshot = { messages: Array<{ id: string; role: string; content: string }>; tasks: Array<{ id: string; status: string }> }
type Phase = "off" | "listening" | "processing" | "speaking"
const TERMINAL = new Set(["COMPLETED", "NEEDS_REVIEW", "CANCELLED"])

export default function VoiceControls({ conversationId, refresh }: { conversationId: string; refresh: (id: string) => Promise<Snapshot> }) {
  const [enabled, setEnabled] = useState(false)
  const [phase, setPhase] = useState<Phase>("off")
  const [error, setError] = useState("")
  const active = useRef(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef<string | null>(null)
  const cancelRequest = useRef<AbortController | null>(null)
  const silenceTimer = useRef<number | null>(null)
  const sessionTimer = useRef<number | null>(null)
  const idleTimer = useRef<number | null>(null)
  const context = useRef<AudioContext | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    fetch("/api/company/voice/status", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((data) => setEnabled(Boolean(data?.enabled))).catch(() => {})
  }, [])

  const cleanup = useCallback(() => {
    active.current = false
    cancelRequest.current?.abort()
    cancelRequest.current = null
    for (const timer of [silenceTimer.current, sessionTimer.current, idleTimer.current]) if (timer !== null) window.clearTimeout(timer)
    silenceTimer.current = sessionTimer.current = idleTimer.current = null
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    raf.current = null
    if (recorder.current?.state === "recording") recorder.current.stop()
    recorder.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    void context.current?.close()
    context.current = null
    audio.current?.pause()
    audio.current = null
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    audioUrl.current = null
    setPhase("off")
  }, [])

  useEffect(() => cleanup, [cleanup, conversationId])

  const ask = useCallback(async (blob: Blob, durationMs: number) => {
    setPhase("processing")
    const controller = new AbortController()
    cancelRequest.current = controller
    const signal = controller.signal
    const checked = async (response: Response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error || `Error ${response.status}`)
      }
      return response
    }
    try {
      const form = new FormData()
      form.append("audio", new File([blob], blob.type === "audio/mp4" ? "turn.mp4" : "turn.webm", { type: blob.type }))
      form.append("durationMs", String(durationMs))
      const transcript = await (await checked(await fetch("/api/company/voice/transcribe", { method: "POST", body: form, signal }))).json() as { text: string }
      if (!active.current) return
      if (!transcript.text) throw new Error("No se detectó voz. Inténtalo de nuevo.")
      const before = await refresh(conversationId)
      const seen = new Set(before.messages.map((message) => message.id))
      const sent = await (await checked(await fetch(`/api/company/conversations/${conversationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: transcript.text }), signal }))).json() as { taskId: string }
      let answer: Snapshot["messages"][number] | undefined
      for (let attempt = 0; attempt < 120 && active.current; attempt++) {
        const snapshot = await refresh(conversationId)
        const task = snapshot.tasks.find((item) => item.id === sent.taskId)
        if (task && TERMINAL.has(task.status)) {
          answer = snapshot.messages.findLast((message) => message.role === "assistant" && !seen.has(message.id))
          if (!answer) throw new Error("James no devolvió una respuesta para leer.")
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 900))
      }
      if (!active.current) return
      if (!answer) throw new Error("La respuesta tardó demasiado; revisa el chat.")
      const speech = await checked(await fetch("/api/company/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, messageId: answer.id }), signal }))
      const objectUrl = URL.createObjectURL(await speech.blob())
      audioUrl.current = objectUrl
      const player = new Audio(objectUrl)
      audio.current = player
      setPhase("speaking")
      player.onended = () => { URL.revokeObjectURL(objectUrl); audioUrl.current = null; audio.current = null; if (active.current) void listen() }
      await player.play()
    } catch (cause) {
      if (!active.current) return
      setError(cause instanceof Error ? cause.message : "Error de voz.")
      cleanup()
    }
  // listen is invoked after speech; it is intentionally resolved from the current render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, refresh, cleanup])

  async function listen() {
    if (!active.current) return
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (!active.current) { media.getTracks().forEach((track) => track.stop()); return }
      stream.current = media
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type))
      if (!mime) throw new Error("Este navegador no admite grabación de voz.")
      const mediaRecorder = new MediaRecorder(media, { mimeType: mime })
      recorder.current = mediaRecorder
      const chunks: Blob[] = []
      let heard = false
      let lastSpeech = performance.now()
      const started = performance.now()
      const audioContext = new AudioContext()
      context.current = audioContext
      const source = audioContext.createMediaStreamSource(media)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      mediaRecorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      mediaRecorder.onstop = () => {
        if (raf.current !== null) cancelAnimationFrame(raf.current)
        raf.current = null
        media.getTracks().forEach((track) => track.stop())
        stream.current = null
        void audioContext.close()
        context.current = null
        if (active.current && heard) void ask(new Blob(chunks, { type: mime.split(";")[0] }), performance.now() - started)
        else if (active.current) void listen()
      }
      const monitor = () => {
        if (mediaRecorder.state !== "recording" || !active.current) return
        analyser.getByteTimeDomainData(samples)
        let power = 0
        for (const value of samples) power += ((value - 128) / 128) ** 2
        if (Math.sqrt(power / samples.length) > 0.035) { heard = true; lastSpeech = performance.now() }
        if ((heard && performance.now() - lastSpeech > 1300) || performance.now() - started > 19_500) mediaRecorder.stop()
        else raf.current = requestAnimationFrame(monitor)
      }
      mediaRecorder.start()
      setPhase("listening")
      raf.current = requestAnimationFrame(monitor)
      idleTimer.current = window.setTimeout(() => { if (!heard && active.current) { setError("Sesión terminada por inactividad."); cleanup() } }, 90_000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el micrófono.")
      cleanup()
    }
  }

  function start() {
    if (!enabled || !conversationId) return
    setError("")
    active.current = true
    sessionTimer.current = window.setTimeout(() => { setError("Sesión terminada tras 10 minutos."); cleanup() }, 600_000)
    void listen()
  }

  function interrupt() {
    audio.current?.pause()
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    audio.current = null
    audioUrl.current = null
    if (active.current) void listen()
  }

  if (!enabled) return null
  return <div className={styles.voiceControls}>
    {phase === "off" ? <button type="button" onClick={start} title="Hablar con James" aria-label="Iniciar voz"><Mic size={16}/></button> : <>
      <span role="status" className={styles.voiceState}>{phase === "listening" ? "Escuchando" : phase === "processing" ? "Pensando" : "Hablando"}</span>
      {phase === "speaking" && <button type="button" onClick={interrupt} title="Interrumpir y hablar" aria-label="Interrumpir a James"><MicOff size={16}/></button>}
      <button type="button" onClick={cleanup} title="Terminar voz" aria-label="Terminar voz"><Square size={14}/></button>
    </>}
    {error && <span role="alert" className={styles.voiceError}>{error}</span>}
    <span className={styles.voiceDisclosure}>Voz generada por IA</span>
  </div>
}
