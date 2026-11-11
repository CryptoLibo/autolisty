import { notFound } from "next/navigation"
import Workspace from "@/app/_components/Workspace"
import { sectionFromPath } from "@/lib/sections"

export default async function SectionPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params
  if (!section) {
    // "/" abre la última sección usada (la elige el navegador).
    return <Workspace />
  }
  const initialSection = section.length === 1 ? sectionFromPath(`/${section[0]}`) : null
  if (!initialSection) notFound()
  return <Workspace initialSection={initialSection} />
}
