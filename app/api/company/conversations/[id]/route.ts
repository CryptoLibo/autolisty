import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const repository = new CompanyRepository()
  if (!repository.getConversation(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  repository.recoverInterrupted()
  const tasks = repository.tasks(id)
  return NextResponse.json({ messages: repository.messages(id), tasks: tasks.map((task) => ({
    ...task, designUnit: repository.designUnit(task.id), report: repository.report(task.id), artifacts: repository.artifacts(task.id), designReviews: repository.designReviews(task.id), calls: repository.calls(task.id), events: repository.events(task.id),
  })), telegramLinked: repository.isTelegramConversation(process.env.TELEGRAM_ALLOWED_CHAT_ID || "", id), budget: { ...repository.spend(), localDailyTokens: repository.localDailyTokens() } })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const { id } = await params
  const body = await request.json().catch(() => null) as { content?: string } | null
  const content = body?.content?.trim() || ""
  if (!content || content.length > 12000) return NextResponse.json({ error: "Message must contain 1-12000 characters." }, { status: 400 })
  try {
    return NextResponse.json({ taskId: new CompanyRepository().addUserMessage(id, content) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cannot send message." }, { status: 409 })
  }
}
