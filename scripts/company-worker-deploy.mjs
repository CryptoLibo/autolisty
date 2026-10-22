import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

if (process.platform !== "linux") {
  process.stdout.write("Company worker: local build; PM2 unchanged.\n")
  process.exit(0)
}

function pm2(args) {
  const result = spawnSync("pm2", args, { cwd: process.cwd(), encoding: "utf8", timeout: 30_000 })
  if (result.error || result.status !== 0) {
    throw new Error(`PM2 ${args[0]} failed: ${result.error?.message || result.stderr?.trim() || result.status}`)
  }
  return result.stdout
}

let processes
try {
  processes = JSON.parse(pm2(["jlist"]))
} catch (error) {
  if (error?.cause?.code === "ENOENT" || error?.message?.includes("spawnSync pm2 ENOENT")) {
    process.stdout.write("Company worker: PM2 unavailable; skipped outside the server.\n")
    process.exit(0)
  }
  throw error
}

if (!processes.some((process) => process.name === "autolisty")) {
  process.stdout.write("Company worker: Autolisty is not registered in PM2; skipped.\n")
  process.exit(0)
}

const envFile = join(process.cwd(), ".env.local")
if (!existsSync(envFile)) throw new Error("Company worker: .env.local is missing on the server.")

if (processes.some((process) => process.name === "autolisty-kittl")) {
  pm2(["restart", "autolisty-kittl", "--update-env"])
  process.stdout.write("Company worker: restarted autolisty-kittl.\n")
} else {
  pm2(["start", join(process.cwd(), "scripts", "company-kittl-worker.mjs"), "--name", "autolisty-kittl", "--interpreter", "node", `--node-args=--env-file=${envFile}`])
  process.stdout.write("Company worker: started autolisty-kittl.\n")
}

const worker = JSON.parse(pm2(["jlist"])).find((process) => process.name === "autolisty-kittl")
if (!worker || worker.pm2_env?.status !== "online") throw new Error("Company worker did not reach PM2 online status.")
