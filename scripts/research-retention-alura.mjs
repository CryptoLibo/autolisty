function scrubJson(raw, transform) {
  try { return JSON.stringify(transform(JSON.parse(raw || "{}"))) }
  catch { return null }
}

export function scrubAluraArtifacts(database, now) {
  const cutoff = new Date(now.getTime() - 23 * 3600000).toISOString()
  let coverage = 0, usage = 0
  const runs = database.prepare(`SELECT id,coverage_json,usage_json FROM research_runs WHERE started_at<=?
    AND id IN (SELECT run_id FROM research_queries WHERE provider='alura')`).all(cutoff)
  const updateRun = database.prepare("UPDATE research_runs SET coverage_json=?,usage_json=? WHERE id=?")
  for (const row of runs) {
    const nextCoverage = scrubJson(row.coverage_json, (data) => ({ ...data, discrepancies:
      (data.discrepancies || []).map((item) => ({ ...item,
        variants: (item.variants || []).filter((variant) => variant.provider !== "alura") }))
        .filter((item) => item.variants.length > 1) }))
    const nextUsage = scrubJson(row.usage_json, (data) => ({ ...data, creditsReported: null }))
    if (nextCoverage === null || nextUsage === null) throw new Error("Unable to scrub stored research JSON.")
    if (nextCoverage !== row.coverage_json) coverage++
    if (nextUsage !== row.usage_json) usage++
    updateRun.run(nextCoverage, nextUsage, row.id)
  }
  const queryUsage = database.prepare(`UPDATE research_queries SET credits_reported=NULL WHERE provider='alura'
    AND captured_at<=? AND credits_reported IS NOT NULL`).run(cutoff).changes
  const diagnostics = database.prepare("DELETE FROM research_alura_diagnostics WHERE checked_at<=?")
    .run(cutoff).changes
  return { coverage, usage, queryUsage, diagnostics }
}
