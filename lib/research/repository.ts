import { randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { ProductType } from "@/lib/products"
import type { ResearchInvestigation, ResearchMode } from "./contracts"

type Row = {
  id: string
  title: string
  mode: ResearchMode
  query: string
  suggested_product_type: ProductType | null
  status: ResearchInvestigation["status"]
  created_at: string
  updated_at: string
}

function mapRow(row: Row): ResearchInvestigation {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    query: row.query,
    suggestedProductType: row.suggested_product_type,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class ResearchRepository {
  constructor(private readonly database: Database.Database) {}

  listInvestigations(limit = 50): ResearchInvestigation[] {
    const rows = this.database.prepare(
      "SELECT * FROM research_investigations ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as Row[]
    return rows.map(mapRow)
  }

  createInvestigation(input: {
    title: string
    mode: ResearchMode
    query: string
    suggestedProductType: ProductType | null
  }): ResearchInvestigation {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare(`
      INSERT INTO research_investigations
      (id, title, mode, query, suggested_product_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.title, input.mode, input.query, input.suggestedProductType, now, now)
    return mapRow(this.database.prepare("SELECT * FROM research_investigations WHERE id = ?").get(id) as Row)
  }
}
