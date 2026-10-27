import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import Database from "better-sqlite3"

const [source, destination] = process.argv.slice(2)
if (!source || !destination || !path.isAbsolute(source) || !path.isAbsolute(destination) ||
    path.resolve(source) === path.resolve(destination)) {
  throw new Error("Provide distinct absolute source and destination paths.")
}
if (!fs.existsSync(source)) throw new Error("Source SQLite does not exist.")
if (!fs.existsSync(path.dirname(destination)) || fs.existsSync(destination)) {
  throw new Error("Backup directory must exist and destination must be new.")
}
const db = new Database(source, { readonly: true, fileMustExist: true })
try {
  if (db.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Source integrity check failed.")
  await db.backup(destination)
  const saved = new Database(destination, { readonly: true, fileMustExist: true })
  try {
    if (saved.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup integrity check failed.")
    const digest = createHash("sha256")
    for await (const chunk of fs.createReadStream(destination)) digest.update(chunk)
    const hash = digest.digest("hex")
    process.stdout.write(JSON.stringify({
      source, destination, version: saved.pragma("user_version", { simple: true }),
      bytes: fs.statSync(destination).size, sha256: hash, integrity: "ok",
    }) + "\n")
  } finally { saved.close() }
} finally { db.close() }
