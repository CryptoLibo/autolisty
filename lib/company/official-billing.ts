export type OfficialDailyBilling = {
  projectId: string
  dayUtc: string
  billedUsd: number
  usage: Array<{ model: string | null; serviceTier: string | null; inputTokens: number; outputTokens: number; requests: number }>
  costs: Array<{ lineItem: string | null; usd: number }>
}

export async function fetchOfficialDailyBilling(
  dayUtc: string,
  projectId: string | undefined,
  adminKey: string,
  request: typeof fetch = fetch
): Promise<OfficialDailyBilling> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayUtc) || new Date(`${dayUtc}T00:00:00Z`).toISOString().slice(0, 10) !== dayUtc) throw new Error("Invalid UTC day.")
  if (projectId && !/^proj_[A-Za-z0-9_-]+$/.test(projectId)) throw new Error("Invalid OpenAI project ID.")
  if (!adminKey) throw new Error("OPENAI_ADMIN_KEY is not configured.")
  const start = Date.parse(`${dayUtc}T00:00:00Z`) / 1000
  const end = start + 86_400
  async function get(path: string, groupBy: string[]) {
    const url = new URL(`https://api.openai.com/v1/organization/${path}`)
    url.searchParams.set("start_time", String(start))
    url.searchParams.set("end_time", String(end))
    url.searchParams.set("bucket_width", "1d")
    if (projectId) url.searchParams.append("project_ids", projectId)
    else url.searchParams.append("group_by", "project_id")
    for (const field of groupBy) url.searchParams.append("group_by", field)
    const response = await request(url, { headers: { Authorization: `Bearer ${adminKey}` }, cache: "no-store" })
    if (!response.ok) throw new Error(`OpenAI administrative ${path} request failed (${response.status}).`)
    return await response.json() as { data?: Array<{ results?: Array<Record<string, unknown>> }> }
  }
  const [usageResponse, costsResponse] = await Promise.all([
    get("usage/completions", ["model", "service_tier"]),
    get("costs", ["line_item"]),
  ])
  const usageRows = (usageResponse.data || []).flatMap((bucket) => bucket.results || [])
  const costRows = (costsResponse.data || []).flatMap((bucket) => bucket.results || [])
  const projects = new Set([...usageRows, ...costRows].map((row) => row.project_id).filter((id): id is string => typeof id === "string"))
  if (!projectId && projects.size !== 1) throw new Error("Set COMPANY_OPENAI_PROJECT_ID to reconcile one project.")
  if (projectId && projects.size > 0 && (projects.size !== 1 || !projects.has(projectId))) throw new Error("OpenAI returned a different project ID.")
  const resolvedProjectId = projectId || [...projects][0]
  const usage = usageRows.map((row) => ({
    model: typeof row.model === "string" ? row.model : null,
    serviceTier: typeof row.service_tier === "string" ? row.service_tier : null,
    inputTokens: Number(row.input_tokens || 0),
    outputTokens: Number(row.output_tokens || 0),
    requests: Number(row.num_model_requests || 0),
  }))
  const costs = costRows.map((row) => ({
    lineItem: typeof row.line_item === "string" ? row.line_item : null,
    usd: Number((row.amount as { value?: number } | undefined)?.value || 0),
  }))
  return { projectId: resolvedProjectId, dayUtc, billedUsd: costs.reduce((sum, item) => sum + item.usd, 0), usage, costs }
}
