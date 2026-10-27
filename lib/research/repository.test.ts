import { afterEach, describe, expect, it } from "vitest"
import type Database from "better-sqlite3"
import { openAutomationDatabase } from "../automation/db/database"
import { ResearchRepository } from "./repository"

describe("Market Research foundation", () => {
  let database: Database.Database | null = null

  afterEach(() => {
    database?.close()
    database = null
  })

  it("adds research tables without removing Automation tables", () => {
    database = openAutomationDatabase(":memory:")
    const names = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
    expect(names).toContain("automation_jobs")
    expect(names).toContain("research_investigations")
    expect(names).toContain("research_briefs")
    expect(names).toContain("creative_prompts")
    expect(names).toContain("creative_designs")
    expect(names).toContain("creative_reviews")
  })

  it("persists open and directed drafts without treating product interest as a filter", () => {
    database = openAutomationDatabase(":memory:")
    const repository = new ResearchRepository(database)
    const open = repository.createInvestigation({ title: "Seasonal ideas", mode: "open", query: "autumn", suggestedProductType: null })
    const directed = repository.createInvestigation({ title: "Wall art ideas", mode: "directed", query: "botanical", suggestedProductType: "vertical_wall_art" })
    expect(open.status).toBe("DRAFT")
    expect(directed.suggestedProductType).toBe("vertical_wall_art")
    expect(repository.listInvestigations()).toHaveLength(2)
  })

  it("supports one prompt across products and independent designs in a collection", () => {
    database = openAutomationDatabase(":memory:")
    const now = new Date().toISOString()
    database.prepare("INSERT INTO creative_prompts (id,revision,creative_text,origin,created_at) VALUES (?,?,?,?,?)").run("p", 1, "An original floral arrangement", "owner", now)
    database.prepare("INSERT INTO creative_prompt_products (prompt_id,prompt_revision,product_type) VALUES (?,?,?)").run("p", 1, "vertical_wall_art")
    database.prepare("INSERT INTO creative_prompt_products (prompt_id,prompt_revision,product_type) VALUES (?,?,?)").run("p", 1, "frame_tv_art")
    database.prepare("INSERT INTO creative_projects (id,title,created_at,updated_at) VALUES (?,?,?,?)").run("project", "Botanical set", now, now)
    database.prepare("INSERT INTO creative_collections (id,project_id,title,created_at) VALUES (?,?,?,?)").run("collection", "project", "Spring", now)
    database.prepare("INSERT INTO creative_designs (id,project_id,collection_id,prompt_id,prompt_revision,created_at) VALUES (?,?,?,?,?,?)").run("a", "project", "collection", "p", 1, now)
    database.prepare("INSERT INTO creative_designs (id,project_id,collection_id,prompt_id,prompt_revision,created_at) VALUES (?,?,?,?,?,?)").run("b", "project", "collection", "p", 1, now)
    database.prepare("INSERT INTO creative_reviews (id,design_id,decision,created_at) VALUES (?,?,?,?)").run("review", "a", "APPROVED", now)
    expect((database.prepare("SELECT COUNT(*) AS count FROM creative_prompt_products WHERE prompt_id = 'p'").get() as { count: number }).count).toBe(2)
    expect((database.prepare("SELECT status FROM creative_designs WHERE id = 'b'").get() as { status: string }).status).toBe("DRAFT")
  })
})
