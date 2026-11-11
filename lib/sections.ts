// Secciones del espacio de trabajo y su ruta real (botón atrás, enlaces y la app instalada).
export type AppSection = "prompt" | "references" | "image" | "single" | "batch" | "automation"

export const SECTION_PATHS: Record<AppSection, string> = {
  prompt: "/dashboard",
  automation: "/automation",
  single: "/listing",
  references: "/prompt-lab",
  image: "/image-lab",
  batch: "/scale",
}

export const SECTION_LABELS: Record<AppSection, string> = {
  prompt: "Dashboard",
  automation: "Automation",
  single: "Listing",
  references: "Prompt Lab",
  image: "Image Lab",
  batch: "Escala",
}

export function sectionFromPath(pathname: string): AppSection | null {
  const clean = pathname.replace(/\/+$/, "") || "/"
  for (const [section, path] of Object.entries(SECTION_PATHS) as Array<[AppSection, string]>) {
    if (clean === path) return section
  }
  return null
}

const LEGACY_QUERY: Record<string, AppSection> = {
  prompt: "prompt", references: "references", image: "image", single: "single", batch: "batch", automation: "automation",
}

/** ?section=automation de los avisos antiguos. */
export function sectionFromQuery(value: string | null): AppSection | null {
  return value ? LEGACY_QUERY[value] ?? null : null
}
