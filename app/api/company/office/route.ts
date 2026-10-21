import { NextResponse } from "next/server"
import { requireOwnerApi } from "@/lib/auth/owner"
import { CompanyRepository } from "@/lib/company/repository"
import { AGENTS } from "@/lib/company/agents"
import { COMPANY_ROLES } from "@/lib/company/roles"
import { AGENT_PROCEDURES } from "@/lib/company/procedures"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const unauthorized = await requireOwnerApi()
  if (unauthorized) return unauthorized
  const repository = new CompanyRepository()
  const agents = COMPANY_ROLES.map((entry) => {
    if (entry.id in AGENTS) {
      const definition = AGENTS[entry.id as keyof typeof AGENTS]
      let name: string = definition.name
      let role: string = definition.role
      try {
        const configured = repository.agentConfig(entry.id as keyof typeof AGENTS)
        name = configured.name
        role = configured.role
      } catch (error) {
        if (process.env.NODE_ENV !== "development") throw error
        // Hot reload may retain a database opened before new roles were seeded.
      }
      return { ...entry, name, role, procedure: AGENT_PROCEDURES[entry.id] }
    }
    return { ...entry, role: entry.name, procedure: AGENT_PROCEDURES[entry.id] }
  })
  return NextResponse.json({
    agents,
    linkedConversationId: repository.linkedTelegramConversation(process.env.TELEGRAM_ALLOWED_CHAT_ID || ""),
    conversations: repository.listConversations(),
  })
}
