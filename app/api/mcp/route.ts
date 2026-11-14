import { NextResponse } from "next/server"
import { rateLimited } from "@/lib/http/rateLimit"
import { authenticateClaudeApi, describeClaudeAuthAttempt } from "@/lib/auth/claudeApi"
import { listClaudeDesigns, submitClaudeDesign } from "@/lib/automation/claudeDesigns"
import { handleMcpMessage } from "@/lib/mcp/server"
import { reviewListingDraft } from "@/lib/automation/draftReview"
import { editListingDraft } from "@/lib/automation/draftEdit"
import { SeoLessonStore } from "@/lib/automation/seoLessons"
import { getProductionStatus } from "@/lib/automation/statusSummary"
import { getSalesByListing, listFeedback } from "@/lib/automation/claudeInsights"
import { getListingImages } from "@/lib/automation/listingImages"
import { parseDesignReport, parseReviewReport, ReviewReportStore } from "@/lib/automation/reviewReports"
import { publishListingDraft } from "@/lib/automation/publishListing"
import { notifyOwner } from "@/lib/notifications/webPush"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Conector MCP de Autolisty para Claude. Autenticación: cabecera
// "Authorization: Bearer <token>" configurada en el conector (mismo token que
// /api/claude/*; el servidor solo guarda su SHA-256 en CLAUDE_API_TOKEN_SHA256).

function unauthorized(request: Request) {
  console.warn("[mcp] rejected request", request.method, JSON.stringify(describeClaudeAuthAttempt(request)))
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid Autolisty credentials." } },
    { status: 401 }
  )
}

export async function POST(request: Request) {
  // Los intentos fallidos cuentan aparte y con un tope mucho menor.
  if (!authenticateClaudeApi(request)) return rateLimited(request, "mcp-denied", 10, 600_000) ?? unauthorized(request)
  const limited = rateLimited(request, "mcp", 240, 60_000)
  if (limited) return limited

  const message = await request.json().catch(() => undefined)
  const method = message && typeof message === "object" && "method" in message ? String(message.method) : "?"
  console.info("[mcp] request", method)
  if (message === undefined) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })
  }

  const response = await handleMcpMessage(message, {
    submitDesign: submitClaudeDesign,
    listDesigns: listClaudeDesigns,
    reviewListing: reviewListingDraft,
    editListing: editListingDraft,
    proposeLesson: async (input) => {
      const lesson = new SeoLessonStore().propose({
        lesson: String(input.lesson || ""),
        reason: typeof input.reason === "string" ? input.reason : null,
        productType: typeof input.productType === "string" ? input.productType : null,
        sourceProductCode: typeof input.sourceProductCode === "string" ? input.sourceProductCode : null,
      })
      if (lesson.status === "PROPOSED") {
        await notifyOwner({
          title: "Nueva lección propuesta para el SEO",
          body: lesson.lesson.slice(0, 140),
          url: "/automation",
          tag: `lesson-${lesson.id}`,
        }).catch(() => {})
      }
      return lesson
    },
    listLessons: () => new SeoLessonStore().list(),
    getStatus: () => getProductionStatus(),
    listFeedback: (input) => listFeedback(input),
    getSalesByListing: (input) => getSalesByListing(input),
    viewListingImages: (input) => getListingImages(input),
    saveReviewReport: async (input) => {
      const report = new ReviewReportStore().save(parseReviewReport(input))
      const changed = report.listings.filter((listing) => listing.changes.length).length
      await notifyOwner({
        title: "Revisión diaria de drafts lista",
        body: `${report.listings.length} draft(s) revisados, ${changed} con cambios.${report.patterns.length ? ` ${report.patterns.length} patrón(es) para mejorar el SEO.` : ""}`,
        url: "/automation",
        tag: `review-report-${report.id}`,
      }).catch(() => {})
      return report
    },
    listReviewReports: (input) => new ReviewReportStore().list(input.limit ?? 7),
    publishListing: (input) => publishListingDraft(input),
    saveDesignReport: (input) => new ReviewReportStore().saveDesignReport(parseDesignReport(input)),
    listDesignReports: (input) => new ReviewReportStore().listDesignReports(input.limit ?? 7),
  })
  if (method === "tools/list" && response && "result" in response) {
    const tools = (response.result as { tools?: Array<{ name: string }> }).tools || []
    console.info(`[mcp] tools/list → ${tools.length}: ${tools.map((tool) => tool.name).join(", ")}`)
  }
  if (response === null) return new Response(null, { status: 202 })
  return NextResponse.json(response)
}

// Sin flujo SSE iniciado por el servidor ni sesiones.
export async function GET(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized(request)
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}

export async function DELETE(request: Request) {
  if (!authenticateClaudeApi(request)) return unauthorized(request)
  return new Response(null, { status: 405, headers: { Allow: "POST" } })
}
