import { spawnSync } from "node:child_process"

if (process.platform !== "linux") process.exit(0)

function pm2(args) {
  const result = spawnSync("pm2", args, { encoding: "utf8", timeout: 30_000 })
  if (result.error?.code === "ENOENT") return null
  if (result.error || result.status !== 0) {
    throw new Error(`PM2 ${args[0]} failed: ${result.error?.message || result.stderr?.trim() || result.status}`)
  }
  return result.stdout
}

const running = pm2(["jlist"])
if (running === null) process.exit(0)

const processes = JSON.parse(running)
if (processes.some((process) => process.name === "autolisty-kittl")) {
  pm2(["delete", "autolisty-kittl"])
  pm2(["save"])
  process.stdout.write("Retired obsolete PM2 worker.\n")
}
