import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"

export const runtime = "nodejs"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const repository = new CompanyRepository()
  if (!repository.cancelQueuedTask(id)) return NextResponse.json({ error: "Solo se puede cerrar una tarea pendiente o una incidencia; una llamada en curso debe terminar primero." }, { status: 409 })
  return NextResponse.json({ cancelled: true })
}
