import type Database from "better-sqlite3"
export function runResearchRetention(database: Database.Database, now?: Date, origin?: "inline" | "worker"): {
  id: string; status: "COMPLETED"; counts: Record<string, number>
}
