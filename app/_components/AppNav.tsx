"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  Layers3,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  Sparkles,
  Wand2,
  Workflow,
  X,
} from "lucide-react"
import { signOutEverywhere, signOutOfAutolisty } from "@/app/actions/auth"
import { AddPasskeyButton } from "@/app/_components/AddPasskeyButton"
import { SECTION_LABELS, SECTION_PATHS, type AppSection } from "@/lib/sections"

const ICONS: Record<AppSection, typeof Workflow> = {
  prompt: LayoutDashboard,
  automation: Workflow,
  single: NotebookPen,
  references: Sparkles,
  image: Wand2,
  batch: Layers3,
}

// Dashboard y Automation siempre a la vista; el flujo manual anterior (C2) va agrupado en
// «Herramientas manuales» en el PC y en «Más» en el iPhone.
const DESKTOP_ORDER: AppSection[] = ["prompt", "automation"]
const MOBILE_PRIMARY: AppSection[] = ["prompt", "automation"]
const MOBILE_MORE: AppSection[] = ["single", "references", "image", "batch"]

type Props = {
  active: AppSection
  onNavigate: (section: AppSection) => void
  badges?: Partial<Record<AppSection, number>>
}

function NavLink({ section, active, onNavigate, children, className }: {
  section: AppSection
  active: boolean
  onNavigate: (section: AppSection) => void
  children: React.ReactNode
  className: string
}) {
  return (
    <a
      href={SECTION_PATHS[section]}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        // Clic normal: cambia de sección sin recargar. Cmd/Ctrl+clic abre otra pestaña.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        onNavigate(section)
      }}
      className={className}
    >
      {children}
    </a>
  )
}

function Badge({ value }: { value?: number }) {
  if (!value) return null
  return (
    <span className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#eeba2b] px-1.5 text-[11px] font-semibold leading-5 text-neutral-950">
      {value > 99 ? "99+" : value}
    </span>
  )
}

export function AppNav({ active, onNavigate, badges = {} }: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)

  useEffect(() => {
    if (!moreOpen && !accountOpen && !toolsOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMoreOpen(false)
        setAccountOpen(false)
        setToolsOpen(false)
      }
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [moreOpen, accountOpen, toolsOpen])

  const go = (section: AppSection) => {
    setMoreOpen(false)
    setAccountOpen(false)
    setToolsOpen(false)
    onNavigate(section)
  }

  return (
    <>
      {/* PC y tablet: barra superior */}
      <header className="sticky top-0 z-40 hidden border-b border-white/[0.07] bg-[#0f0f11]/95 backdrop-blur md:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6 lg:px-8">
          <a href={SECTION_PATHS.prompt} onClick={(event) => { event.preventDefault(); go("prompt") }} className="shrink-0">
            <Image src="/logo-final.png" alt="Autolisty" width={132} height={29} priority className="h-auto w-[132px]" />
          </a>
          <nav aria-label="Secciones" className="flex min-w-0 flex-1 items-center gap-1">
            {DESKTOP_ORDER.map((section) => (
              <NavLink
                key={section}
                section={section}
                active={active === section}
                onNavigate={go}
                className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3.5 text-sm transition ${
                  active === section ? "bg-white/[0.08] font-medium text-neutral-100" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                }`}
              >
                {SECTION_LABELS[section]}
                <Badge value={badges[section]} />
              </NavLink>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setToolsOpen((value) => !value)}
                aria-expanded={toolsOpen}
                className={`inline-flex h-9 shrink-0 items-center rounded-lg px-3.5 text-sm transition ${
                  MOBILE_MORE.includes(active) ? "bg-white/[0.08] font-medium text-neutral-100" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                }`}
              >
                Herramientas manuales
              </button>
              {toolsOpen ? (
                <div className="absolute left-0 top-11 z-50 w-56 space-y-1 rounded-xl border border-white/10 bg-[#141416] p-2 shadow-2xl">
                  {MOBILE_MORE.map((section) => {
                    const Icon = ICONS[section]
                    return (
                      <NavLink
                        key={section}
                        section={section}
                        active={active === section}
                        onNavigate={go}
                        className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm ${active === section ? "bg-white/[0.06] text-[#eeba2b]" : "text-neutral-200 hover:bg-white/[0.04]"}`}
                      >
                        <Icon size={16} aria-hidden="true" />
                        {SECTION_LABELS[section]}
                      </NavLink>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </nav>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAccountOpen((value) => !value)}
              aria-expanded={accountOpen}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-neutral-400 transition hover:bg-white/[0.04] hover:text-neutral-200"
            >
              LBCreaStudio
            </button>
            {accountOpen ? (
              <div className="absolute right-0 top-11 w-64 space-y-2 rounded-xl border border-white/10 bg-[#141416] p-3 shadow-2xl">
                <AddPasskeyButton />
                <form action={signOutOfAutolisty}>
                  <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-red-500/10 hover:text-red-200">
                    <LogOut size={16} aria-hidden="true" />
                    Cerrar sesión
                  </button>
                </form>
                <form action={signOutEverywhere}>
                  <button type="submit" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-neutral-400 transition hover:bg-red-500/10 hover:text-red-200">
                    <LogOut size={16} aria-hidden="true" />
                    Cerrar todas las sesiones
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* iPhone: logo arriba y barra de pestañas abajo */}
      <header className="flex items-center justify-center pt-[max(env(safe-area-inset-top),16px)] pb-2 md:hidden">
        <Image src="/logo-final.png" alt="Autolisty" width={120} height={26} priority className="h-auto w-[120px]" />
      </header>
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-white/[0.07] bg-[#0f0f11]/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur md:hidden"
      >
        {MOBILE_PRIMARY.map((section) => {
          const Icon = ICONS[section]
          const isActive = active === section
          return (
            <NavLink
              key={section}
              section={section}
              active={isActive}
              onNavigate={go}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${isActive ? "font-medium text-[#eeba2b]" : "text-neutral-500"}`}
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              {SECTION_LABELS[section]}
              {badges[section] ? (
                <span className="absolute right-[calc(50%-22px)] top-0.5 min-w-4 rounded-full bg-[#eeba2b] px-1 text-center text-[10px] font-semibold leading-4 text-neutral-950">
                  {badges[section]}
                </span>
              ) : null}
            </NavLink>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${MOBILE_MORE.includes(active) ? "font-medium text-[#eeba2b]" : "text-neutral-500"}`}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} aria-hidden="true" />
          Más
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
          <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/10 bg-[#141416] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-200">Herramientas manuales</span>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center text-neutral-400">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-1">
              {MOBILE_MORE.map((section) => {
                const Icon = ICONS[section]
                return (
                  <NavLink
                    key={section}
                    section={section}
                    active={active === section}
                    onNavigate={go}
                    className={`flex h-12 items-center gap-3 rounded-lg px-3 text-[15px] ${active === section ? "bg-white/[0.06] text-[#eeba2b]" : "text-neutral-200"}`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    {SECTION_LABELS[section]}
                  </NavLink>
                )
              })}
            </div>
            <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-3">
              <AddPasskeyButton />
              <form action={signOutOfAutolisty}>
                <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-neutral-300">
                  <LogOut size={20} aria-hidden="true" />
                  Cerrar sesión
                </button>
              </form>
              <form action={signOutEverywhere}>
                <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-neutral-400">
                  <LogOut size={20} aria-hidden="true" />
                  Cerrar todas las sesiones
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
